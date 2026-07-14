import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  storagePallets,
  storagePalletItems,
  storageMovements,
  storagePickupRequests,
  storagePickupRequestItems,
} from "@/lib/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { pickupFromPallet, pickupFromItem, recomputePalletCache } from "./index";
import type { StorageUom } from "./rates";

export interface RequestItemInput {
  palletId: string;
  palletItemId?: string; // SKU cụ thể (pallet trộn). Không có → pallet 1 SKU.
  units: number;
  uom: StorageUom;
}

interface NormItem {
  palletId: string;
  palletItemId: string;
  units: number;
  uom: StorageUom;
}

/**
 * Chuẩn hoá + kiểm tra từng SKU: thuộc khách + pallet còn trong kho + đủ tồn SKU.
 * Legacy (chỉ có palletId, pallet 1 SKU) → tự resolve sang SKU duy nhất.
 */
async function loadAndValidateItems(
  customerId: string,
  items: RequestItemInput[],
): Promise<NormItem[]> {
  if (items.length === 0) throw new Error("Request must have at least one item");
  const norm: NormItem[] = [];
  for (const it of items) {
    let itemId = it.palletItemId;
    if (!itemId) {
      const its = await db
        .select({ id: storagePalletItems.id })
        .from(storagePalletItems)
        .where(eq(storagePalletItems.palletId, it.palletId));
      if (its.length !== 1)
        throw new Error("Pallet nhiều SKU — cần chọn SKU cụ thể");
      itemId = its[0].id;
    }
    const [item] = await db
      .select()
      .from(storagePalletItems)
      .where(eq(storagePalletItems.id, itemId));
    if (!item) throw new Error("Không tìm thấy SKU");
    const [p] = await db
      .select()
      .from(storagePallets)
      .where(eq(storagePallets.id, item.palletId));
    if (!p) throw new Error("Pallet not found");
    if (p.customerId !== customerId) throw new Error("SKU không thuộc khách này");
    if (p.status !== "IN_STORAGE")
      throw new Error(`Pallet ${p.palletCode} không còn trong kho`);
    if (it.uom === "UNIT") {
      if (it.units < 1) throw new Error("Units phải ≥ 1");
      if (it.units > item.unitCount)
        throw new Error(`${item.productName} chỉ còn ${item.unitCount} units`);
    }
    norm.push({ palletId: item.palletId, palletItemId: itemId, units: it.units, uom: it.uom });
  }
  return norm;
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
  const norm = await loadAndValidateItems(input.customerId, input.items);

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
    norm.map((it) => ({
      id: randomUUID(),
      requestId: id,
      palletId: it.palletId,
      palletItemId: it.palletItemId,
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

  const norm = await loadAndValidateItems(r.customerId, input.items);

  const now = new Date();
  // Thay toàn bộ items: xóa cũ, thêm mới.
  await db
    .delete(storagePickupRequestItems)
    .where(eq(storagePickupRequestItems.requestId, r.id));
  await db.insert(storagePickupRequestItems).values(
    norm.map((it) => ({
      id: randomUUID(),
      requestId: r.id,
      palletId: it.palletId,
      palletItemId: it.palletItemId,
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

export interface DeleteRequestOptions {
  /** Khách: ép customerId của họ để chỉ xóa request của mình. */
  customerId?: string;
  /** SUPER_ADMIN: cho phép xóa cả request DONE (đã thống nhất) — sẽ HOÀN KHO trước. */
  allowDone?: boolean;
  /** Ghi tên người hoàn kho vào movement ADJUST (audit). */
  restoredBy?: string;
}

/**
 * Xóa hẳn request + items (dọn test / nhầm).
 * - Khách (truyền customerId): chỉ xóa request CỦA MÌNH và chỉ khi PENDING/CANCELLED.
 * - Staff thường: xóa PENDING/CANCELLED, KHÔNG xóa DONE.
 * - SUPER_ADMIN (allowDone): xóa được cả DONE — nhưng phải HOÀN KHO: cộng lại
 *   `confirmedUnits` đã trừ vào từng SKU + ghi movement ADJUST (giữ dấu vết),
 *   rồi mới xóa. Tồn luôn khớp, không mồ côi như bug PLT-00010 cũ.
 */
export async function deleteRequest(
  requestId: string,
  optsOrCustomerId?: string | DeleteRequestOptions,
) {
  const opts: DeleteRequestOptions =
    typeof optsOrCustomerId === "string"
      ? { customerId: optsOrCustomerId }
      : (optsOrCustomerId ?? {});
  const { customerId, allowDone, restoredBy } = opts;

  const r = await getRequest(requestId);
  if (!r) throw new Error("Request not found");
  if (customerId && r.customerId !== customerId) throw new Error("Not allowed");

  if (r.status === "DONE") {
    // DONE = đã trừ kho THẬT. Chỉ SUPER_ADMIN (allowDone) xóa được, và phải hoàn kho.
    if (!allowDone) throw new Error("Đơn đã xác nhận (pickup), không thể xóa.");

    const items = await db
      .select()
      .from(storagePickupRequestItems)
      .where(eq(storagePickupRequestItems.requestId, requestId));

    await db.transaction(async (tx) => {
      const now = new Date();
      const touchedPallets = new Set<string>();
      for (const it of items) {
        const restore = it.confirmedUnits ?? 0;
        if (restore <= 0) continue;
        // Resolve SKU: mới có palletItemId; legacy 1-SKU thì lấy SKU duy nhất của pallet.
        let palletItemId = it.palletItemId;
        if (!palletItemId) {
          const its = await tx
            .select({ id: storagePalletItems.id })
            .from(storagePalletItems)
            .where(eq(storagePalletItems.palletId, it.palletId));
          if (its.length === 1) palletItemId = its[0].id;
        }
        if (!palletItemId) continue; // không resolve được → bỏ qua (không đoán mò)
        const [item] = await tx
          .select()
          .from(storagePalletItems)
          .where(eq(storagePalletItems.id, palletItemId));
        if (!item) continue;
        const [p] = await tx
          .select({ c: storagePallets.customerId })
          .from(storagePallets)
          .where(eq(storagePallets.id, item.palletId));
        await tx
          .update(storagePalletItems)
          .set({ unitCount: item.unitCount + restore, updatedAt: now })
          .where(eq(storagePalletItems.id, item.id));
        await tx.insert(storageMovements).values({
          id: randomUUID(),
          palletId: item.palletId,
          palletItemId: item.id,
          customerId: p?.c ?? r.customerId,
          type: "ADJUST",
          units: restore,
          uom: "UNIT",
          occurredAt: now,
          note: `Hoàn kho: admin xóa yêu cầu ${requestId}`,
          createdBy: restoredBy ?? "system",
          createdAt: now,
        });
        touchedPallets.add(item.palletId);
      }
      for (const pid of touchedPallets) await recomputePalletCache(tx, pid, now);
      await tx
        .delete(storagePickupRequestItems)
        .where(eq(storagePickupRequestItems.requestId, requestId));
      await tx.delete(storagePickupRequests).where(eq(storagePickupRequests.id, requestId));
    });
    return { id: requestId, restored: true };
  }

  // PENDING/CANCELLED: chưa trừ kho → xóa thẳng.
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
      const res = it.palletItemId
        ? await pickupFromItem({
            palletItemId: it.palletItemId,
            uom: it.uom,
            units: it.uom === "UNIT" ? take : undefined,
            createdBy: input.confirmedBy,
            note: `Pickup request ${r.id}`,
          })
        : await pickupFromPallet({
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

/** Đếm số request đang PENDING (cho badge noti trên sidebar staff). */
export async function countPendingRequests(): Promise<number> {
  const rows = await db
    .select({ id: storagePickupRequests.id })
    .from(storagePickupRequests)
    .where(eq(storagePickupRequests.status, "PENDING"));
  return rows.length;
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
      palletItemId: storagePickupRequestItems.palletItemId,
      units: storagePickupRequestItems.units,
      uom: storagePickupRequestItems.uom,
      confirmedUnits: storagePickupRequestItems.confirmedUnits,
      palletCode: storagePallets.palletCode,
      // Tên/tồn ưu tiên theo SKU (pallet trộn); fallback cache pallet.
      productName: sql<string>`coalesce(${storagePalletItems.productName}, ${storagePallets.productName})`,
      unitCount: sql<number>`coalesce(${storagePalletItems.unitCount}, ${storagePallets.unitCount})`,
    })
    .from(storagePickupRequestItems)
    .leftJoin(storagePallets, eq(storagePickupRequestItems.palletId, storagePallets.id))
    .leftJoin(storagePalletItems, eq(storagePickupRequestItems.palletItemId, storagePalletItems.id))
    .where(inArray(storagePickupRequestItems.requestId, reqIds));

  const byReq = new Map<string, typeof items>();
  for (const it of items) {
    const list = byReq.get(it.requestId) ?? [];
    list.push(it);
    byReq.set(it.requestId, list);
  }

  return reqs.map((r) => ({ ...r, items: byReq.get(r.id) ?? [] }));
}
