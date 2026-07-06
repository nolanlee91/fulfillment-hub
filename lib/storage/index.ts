import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  storagePallets,
  storageMovements,
  storagePickupRequestItems,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { StorageUom } from "./rates";

// Module Lưu kho chỉ chạy ở kho BC (WEST). ON (EAST) không dùng.
export const STORAGE_WAREHOUSE_CODE = "WEST";

/** Sinh mã pallet kế tiếp dạng KDE-PLT-00001 (lấy max số đuôi hiện có +1). */
async function nextPalletNumber(): Promise<number> {
  const rows = await db.select({ code: storagePallets.palletCode }).from(storagePallets);
  let max = 0;
  for (const r of rows) {
    const m = r.code.match(/(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

function palletCode(n: number): string {
  return `KDE-PLT-${String(n).padStart(5, "0")}`;
}

export interface ReceiveInput {
  customerId: string;
  warehouseCode: string;
  productName: string;
  unitsPerPallet: number;
  palletCount: number;
  createdBy: string;
  note?: string;
}

/**
 * Nhập kho: tạo `palletCount` pallet, mỗi pallet `unitsPerPallet` unit (1 SKU/pallet),
 * kèm 1 movement RECEIVE_IN/pallet (cơ sở phí nhận $10/pallet).
 */
export async function receivePallets(input: ReceiveInput) {
  const { customerId, warehouseCode, productName, createdBy } = input;
  const unitsPerPallet = Math.max(0, Math.floor(input.unitsPerPallet));
  const palletCount = Math.max(1, Math.floor(input.palletCount));

  const start = await nextPalletNumber();
  const now = new Date();
  const palletRows: (typeof storagePallets.$inferInsert)[] = [];
  const moveRows: (typeof storageMovements.$inferInsert)[] = [];

  for (let i = 0; i < palletCount; i++) {
    const id = randomUUID();
    palletRows.push({
      id,
      palletCode: palletCode(start + i),
      customerId,
      warehouseCode,
      productName,
      unitCount: unitsPerPallet,
      initialUnits: unitsPerPallet,
      status: "IN_STORAGE",
      receivedAt: now,
      note: input.note ?? null,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
    moveRows.push({
      id: randomUUID(),
      palletId: id,
      customerId,
      type: "RECEIVE_IN",
      units: unitsPerPallet,
      uom: "PALLET",
      occurredAt: now,
      createdBy,
      createdAt: now,
    });
  }

  await db.insert(storagePallets).values(palletRows);
  await db.insert(storageMovements).values(moveRows);

  return { count: palletRows.length, pallets: palletRows };
}

export interface PickupInput {
  palletId: string;
  uom: StorageUom; // PALLET = lấy nguyên pallet (hết unit); UNIT = lấy lẻ `units`
  units?: number; // bắt buộc khi uom = UNIT
  createdBy: string;
  note?: string;
}

/**
 * Xuất/khách lấy hàng từ 1 pallet. PALLET = lấy hết unit còn lại; UNIT = lấy `units`.
 * Trừ unit; nếu về 0 → pallet PICKED_UP. Ghi movement PICKUP_OUT (units âm).
 */
export async function pickupFromPallet(input: PickupInput) {
  const [pallet] = await db
    .select()
    .from(storagePallets)
    .where(eq(storagePallets.id, input.palletId));
  if (!pallet) throw new Error("Pallet not found");
  if (pallet.status !== "IN_STORAGE") throw new Error("Pallet is no longer in storage");

  const taken =
    input.uom === "PALLET"
      ? pallet.unitCount
      : Math.min(pallet.unitCount, Math.max(1, Math.floor(input.units ?? 0)));
  if (taken <= 0) throw new Error("Units to pick must be greater than 0");
  if (taken > pallet.unitCount)
    throw new Error(`Only ${pallet.unitCount} units left on this pallet`);

  const now = new Date();
  const remaining = pallet.unitCount - taken;

  await db
    .update(storagePallets)
    .set({
      unitCount: remaining,
      status: remaining === 0 ? "PICKED_UP" : "IN_STORAGE",
      pickedUpAt: remaining === 0 ? now : pallet.pickedUpAt,
      updatedAt: now,
    })
    .where(eq(storagePallets.id, pallet.id));

  await db.insert(storageMovements).values({
    id: randomUUID(),
    palletId: pallet.id,
    customerId: pallet.customerId,
    type: "PICKUP_OUT",
    units: -taken,
    uom: input.uom,
    occurredAt: now,
    note: input.note ?? null,
    createdBy: input.createdBy,
    createdAt: now,
  });

  return { taken, remaining, emptied: remaining === 0 };
}

export interface ListPalletsFilter {
  customerId?: string;
  warehouseCode?: string;
  status?: "IN_STORAGE" | "PICKED_UP" | "DISPOSED";
}

/** Liệt kê pallet (mặc định mới nhất trước). */
export async function listPallets(filter: ListPalletsFilter = {}) {
  const conds = [];
  if (filter.customerId) conds.push(eq(storagePallets.customerId, filter.customerId));
  if (filter.warehouseCode)
    conds.push(eq(storagePallets.warehouseCode, filter.warehouseCode));
  if (filter.status) conds.push(eq(storagePallets.status, filter.status));

  return db
    .select()
    .from(storagePallets)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(storagePallets.receivedAt), desc(storagePallets.palletCode));
}

/** Movement history của 1 hoặc nhiều pallet (audit). */
export async function listMovements(palletIds: string[]) {
  if (palletIds.length === 0) return [];
  return db
    .select()
    .from(storageMovements)
    .where(inArray(storageMovements.palletId, palletIds))
    .orderBy(desc(storageMovements.occurredAt));
}

/**
 * Xóa hẳn 1 pallet (dọn dữ liệu test / nhập nhầm). CHỈ staff gọi.
 * Chặn nếu pallet đang bị pickup request tham chiếu (phải hủy request trước).
 * Xóa kèm mọi movement của pallet trong 1 transaction (giữ toàn vẹn).
 */
export async function deletePallet(id: string): Promise<void> {
  const [pallet] = await db
    .select({ id: storagePallets.id })
    .from(storagePallets)
    .where(eq(storagePallets.id, id));
  if (!pallet) throw new Error("Không tìm thấy pallet.");

  const refs = await db
    .select({ id: storagePickupRequestItems.id })
    .from(storagePickupRequestItems)
    .where(eq(storagePickupRequestItems.palletId, id));
  if (refs.length > 0) {
    throw new Error(
      "Pallet đang nằm trong một pickup request — hãy hủy request liên quan trước khi xóa.",
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(storageMovements).where(eq(storageMovements.palletId, id));
    await tx.delete(storagePallets).where(eq(storagePallets.id, id));
  });
}
