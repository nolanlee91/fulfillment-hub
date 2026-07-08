import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  storagePallets,
  storagePickupRequests,
  storagePickupRequestItems,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { pickupFromPallet } from "./index";
import type { StorageUom } from "./rates";

export interface RequestItemInput {
  palletId: string;
  units: number;
  uom: StorageUom;
}

/** Kiểm tra pallet thuộc khách + còn trong kho + đủ unit. Trả về map pallet. */
async function loadAndValidatePallets(
  customerId: string,
  items: RequestItemInput[],
) {
  if (items.length === 0) throw new Error("Request must have at least one item");
  const ids = [...new Set(items.map((i) => i.palletId))];
  const rows = await db
    .select()
    .from(storagePallets)
    .where(inArray(storagePallets.id, ids));
  const byId = new Map(rows.map((p) => [p.id, p]));

  for (const it of items) {
    const p = byId.get(it.palletId);
    if (!p) throw new Error("Pallet not found");
    if (p.customerId !== customerId) throw new Error("Pallet does not belong to this customer");
    if (p.status !== "IN_STORAGE") throw new Error(`Pallet ${p.palletCode} is no longer in storage`);
    if (it.uom === "UNIT") {
      if (it.units < 1) throw new Error("Units must be at least 1");
      if (it.units > p.unitCount)
        throw new Error(`Pallet ${p.palletCode} only has ${p.unitCount} units`);
    }
  }
  return byId;
}

export interface CreateRequestInput {
  customerId: string;
  items: RequestItemInput[];
  requestedDate?: Date | null;
  note?: string;
  createdBy: string;
}

/** Khách tạo yêu cầu lấy hàng (PENDING, còn sửa được). */
export async function createRequest(input: CreateRequestInput) {
  await loadAndValidatePallets(input.customerId, input.items);

  const id = randomUUID();
  const now = new Date();
  await db.insert(storagePickupRequests).values({
    id,
    customerId: input.customerId,
    status: "PENDING",
    requestedDate: input.requestedDate ?? null,
    note: input.note ?? null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(storagePickupRequestItems).values(
    input.items.map((it) => ({
      id: randomUUID(),
      requestId: id,
      palletId: it.palletId,
      units: Math.max(1, Math.floor(it.units)),
      uom: it.uom,
      createdAt: now,
    })),
  );
  return { id };
}

/** Load 1 request (kèm customerId, status) để guard. */
async function getRequest(requestId: string) {
  const [r] = await db
    .select()
    .from(storagePickupRequests)
    .where(eq(storagePickupRequests.id, requestId));
  return r ?? null;
}

export interface EditRequestInput {
  requestId: string;
  items: RequestItemInput[];
  requestedDate?: Date | null;
  note?: string;
  /** Khách: ép customerId của họ để không sửa request người khác. */
  customerId?: string;
}

/** Sửa request khi còn PENDING (thay toàn bộ items). */
export async function editRequest(input: EditRequestInput) {
  const r = await getRequest(input.requestId);
  if (!r) throw new Error("Request not found");
  if (input.customerId && r.customerId !== input.customerId)
    throw new Error("Not allowed");
  if (r.status !== "PENDING") throw new Error("Only pending requests can be edited");

  await loadAndValidatePallets(r.customerId, input.items);

  const now = new Date();
  // Thay toàn bộ items: xóa cũ, thêm mới.
  await db
    .delete(storagePickupRequestItems)
    .where(eq(storagePickupRequestItems.requestId, r.id));
  await db.insert(storagePickupRequestItems).values(
    input.items.map((it) => ({
      id: randomUUID(),
      requestId: r.id,
      palletId: it.palletId,
      units: Math.max(1, Math.floor(it.units)),
      uom: it.uom,
      createdAt: now,
    })),
  );
  await db
    .update(storagePickupRequests)
    .set({
      requestedDate: input.requestedDate ?? r.requestedDate,
      note: input.note ?? r.note,
      updatedAt: now,
    })
    .where(eq(storagePickupRequests.id, r.id));
  return { id: r.id };
}

/** Hủy request (chỉ khi PENDING). */
export async function cancelRequest(requestId: string, customerId?: string) {
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  if (customerId && r.customerId !== customerId) throw new Error("Not allowed");
  if (r.status !== "PENDING") throw new Error("Only pending requests can be cancelled");
  await db
    .update(storagePickupRequests)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(storagePickupRequests.id, requestId));
  return { id: requestId };
}

/**
 * Xóa hẳn request + items (dọn test / nhầm).
 * - Khách (truyền customerId): chỉ xóa request CỦA MÌNH và chỉ khi PENDING/CANCELLED
 *   (không xóa DONE vì đã trừ kho thật).
 * - Staff (không truyền customerId): xóa được mọi request.
 */
export async function deleteRequest(requestId: string, customerId?: string) {
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  // DONE = staff đã confirm + trừ kho THẬT → khóa, xóa sẽ mất dấu + lệch tồn.
  // Chỉ PENDING/CANCELLED mới xóa được (dọn nháp). Áp cho CẢ staff lẫn khách.
  if (r.status === "DONE")
    throw new Error("Đơn đã xác nhận (pickup), không thể xóa.");
  if (customerId && r.customerId !== customerId) throw new Error("Not allowed");
  await db.transaction(async (tx) => {
    await tx
      .delete(storagePickupRequestItems)
      .where(eq(storagePickupRequestItems.requestId, requestId));
    await tx.delete(storagePickupRequests).where(eq(storagePickupRequests.id, requestId));
  });
  return { id: requestId };
}

/**
 * Khách bấm "Đồng ý" xác nhận số cuối (phương án A: sau khi STAFF đã chốt → DONE).
 * Ghi customerConfirmedBy/At. Cả 2 phía có timestamp = đã thống nhất.
 */
export async function customerConfirm(
  requestId: string,
  customerId: string,
  confirmedBy: string,
) {
  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  if (r.customerId !== customerId) throw new Error("Not allowed");
  if (r.status !== "DONE")
    throw new Error("Chỉ xác nhận được sau khi kho đã chốt số cuối");
  if (r.customerConfirmedAt) return { id: requestId }; // đã xác nhận rồi, idempotent
  await db
    .update(storagePickupRequests)
    .set({
      customerConfirmedBy: confirmedBy,
      customerConfirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(storagePickupRequests.id, requestId));
  return { id: requestId };
}

export interface ConfirmInput {
  requestId: string;
  /** itemId → số unit thực lấy (mặc định = số yêu cầu). 0 = không lấy item đó. */
  confirmations?: Record<string, number>;
  confirmedBy: string;
}

/**
 * Staff chốt số cuối khi hàng ra kho → DONE. Thực hiện pickup thật cho từng item
 * (trừ unit + ghi PICKUP_OUT), lưu confirmedUnits.
 */
export async function confirmRequest(input: ConfirmInput) {
  const r = await getRequest(input.requestId);
  if (!r) throw new Error("Request not found");
  if (r.status !== "PENDING") throw new Error("Request already finalized");

  const items = await db
    .select()
    .from(storagePickupRequestItems)
    .where(eq(storagePickupRequestItems.requestId, r.id));

  // Số thực mỗi item (mặc định = yêu cầu, staff có thể chỉnh qua confirmations)
  const finalUnits = new Map<string, number>();
  for (const it of items) {
    const c = input.confirmations?.[it.id];
    finalUnits.set(it.id, c != null ? Math.max(0, Math.floor(c)) : it.units);
  }

  // Tiền kiểm: pallet còn trong kho + đủ unit (tránh chốt nửa chừng rồi lỗi).
  const palletIds = [...new Set(items.map((i) => i.palletId))];
  const pallets = await db
    .select()
    .from(storagePallets)
    .where(inArray(storagePallets.id, palletIds));
  const byId = new Map(pallets.map((p) => [p.id, p]));
  for (const it of items) {
    const take = finalUnits.get(it.id) ?? 0;
    if (take <= 0) continue;
    const p = byId.get(it.palletId);
    if (!p || p.status !== "IN_STORAGE")
      throw new Error(`Pallet ${p?.palletCode ?? it.palletId} is no longer in storage`);
    const need = it.uom === "PALLET" ? p.unitCount : take;
    if (need > p.unitCount)
      throw new Error(`Pallet ${p.palletCode} only has ${p.unitCount} units`);
  }

  const now = new Date();
  for (const it of items) {
    const take = finalUnits.get(it.id) ?? 0;
    let confirmed = 0;
    if (take > 0) {
      const res = await pickupFromPallet({
        palletId: it.palletId,
        uom: it.uom,
        units: it.uom === "UNIT" ? take : undefined,
        createdBy: input.confirmedBy,
        note: `Pickup request ${r.id}`,
      });
      confirmed = res.taken;
    }
    await db
      .update(storagePickupRequestItems)
      .set({ confirmedUnits: confirmed })
      .where(eq(storagePickupRequestItems.id, it.id));
  }

  await db
    .update(storagePickupRequests)
    .set({
      status: "DONE",
      confirmedBy: input.confirmedBy,
      confirmedAt: now,
      updatedAt: now,
    })
    .where(eq(storagePickupRequests.id, r.id));
  return { id: r.id };
}

export interface ListRequestsFilter {
  customerId?: string;
  status?: "PENDING" | "DONE" | "CANCELLED";
}

/** Liệt kê request kèm items (+ mã pallet, tên SP để hiển thị). */
export async function listRequests(filter: ListRequestsFilter = {}) {
  const conds = [];
  if (filter.customerId)
    conds.push(eq(storagePickupRequests.customerId, filter.customerId));
  if (filter.status) conds.push(eq(storagePickupRequests.status, filter.status));

  const reqs = await db
    .select()
    .from(storagePickupRequests)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(storagePickupRequests.createdAt));

  if (reqs.length === 0) return [];

  const reqIds = reqs.map((r) => r.id);
  const items = await db
    .select({
      id: storagePickupRequestItems.id,
      requestId: storagePickupRequestItems.requestId,
      palletId: storagePickupRequestItems.palletId,
      units: storagePickupRequestItems.units,
      uom: storagePickupRequestItems.uom,
      confirmedUnits: storagePickupRequestItems.confirmedUnits,
      palletCode: storagePallets.palletCode,
      productName: storagePallets.productName,
      unitCount: storagePallets.unitCount,
    })
    .from(storagePickupRequestItems)
    .leftJoin(storagePallets, eq(storagePickupRequestItems.palletId, storagePallets.id))
    .where(inArray(storagePickupRequestItems.requestId, reqIds));

  const byReq = new Map<string, typeof items>();
  for (const it of items) {
    const list = byReq.get(it.requestId) ?? [];
    list.push(it);
    byReq.set(it.requestId, list);
  }

  return reqs.map((r) => ({ ...r, items: byReq.get(r.id) ?? [] }));
}
