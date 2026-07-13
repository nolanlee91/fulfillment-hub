import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  storagePallets,
  storagePalletItems,
  storageMovements,
  storagePickupRequestItems,
} from "@/lib/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { StorageUom } from "./rates";

// Module Lưu kho chỉ chạy ở kho BC (WEST). ON (EAST) không dùng.
export const STORAGE_WAREHOUSE_CODE = "WEST";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Đồng bộ cache mức pallet từ các SKU con (nguồn thật = storage_pallet_items):
 * unitCount = TỔNG, productName = "A + B", initialUnits = TỔNG, status/pickedUpAt
 * theo tổng tồn. Gọi sau mỗi lần đổi item.
 */
async function recomputePalletCache(tx: Tx, palletId: string, now: Date) {
  const items = await tx
    .select()
    .from(storagePalletItems)
    .where(eq(storagePalletItems.palletId, palletId));
  const totalUnits = items.reduce((s, it) => s + it.unitCount, 0);
  const totalInit = items.reduce((s, it) => s + it.initialUnits, 0);
  const name = items.map((it) => it.productName).join(" + ") || "";
  const [pallet] = await tx
    .select({ pickedUpAt: storagePallets.pickedUpAt })
    .from(storagePallets)
    .where(eq(storagePallets.id, palletId));
  await tx
    .update(storagePallets)
    .set({
      productName: name,
      unitCount: totalUnits,
      initialUnits: totalInit,
      status: totalUnits === 0 ? "PICKED_UP" : "IN_STORAGE",
      pickedUpAt: totalUnits === 0 ? (pallet?.pickedUpAt ?? now) : null,
      updatedAt: now,
    })
    .where(eq(storagePallets.id, palletId));
}

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
  const itemRows: (typeof storagePalletItems.$inferInsert)[] = [];
  const moveRows: (typeof storageMovements.$inferInsert)[] = [];

  for (let i = 0; i < palletCount; i++) {
    const id = randomUUID();
    const itemId = randomUUID();
    palletRows.push({
      id,
      palletCode: palletCode(start + i),
      customerId,
      warehouseCode,
      productName, // cache
      unitCount: unitsPerPallet,
      initialUnits: unitsPerPallet,
      status: "IN_STORAGE",
      receivedAt: now,
      note: input.note ?? null,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
    itemRows.push({
      id: itemId,
      palletId: id,
      productName,
      unitCount: unitsPerPallet,
      initialUnits: unitsPerPallet,
      createdAt: now,
      updatedAt: now,
    });
    moveRows.push({
      id: randomUUID(),
      palletId: id,
      palletItemId: itemId,
      customerId,
      type: "RECEIVE_IN",
      units: unitsPerPallet,
      uom: "PALLET",
      occurredAt: now,
      createdBy,
      createdAt: now,
    });
  }

  await db.transaction(async (tx) => {
    await tx.insert(storagePallets).values(palletRows);
    await tx.insert(storagePalletItems).values(itemRows);
    await tx.insert(storageMovements).values(moveRows);
  });

  return { count: palletRows.length, pallets: palletRows };
}

export interface MixedReceiveInput {
  customerId: string;
  warehouseCode: string;
  items: { productName: string; units: number }[]; // nhiều SKU trên 1 pallet
  palletCount: number; // số pallet giống nhau (mỗi cái cùng bộ SKU)
  createdBy: string;
  note?: string;
}

/**
 * Nhập kho pallet TRỘN: mỗi pallet gồm nhiều SKU (items). Tạo `palletCount` pallet
 * giống nhau, mỗi pallet 1 dòng item + 1 RECEIVE_IN/SKU. Cache pallet = tổng.
 */
export async function receiveMixedPallet(input: MixedReceiveInput) {
  const items = input.items
    .map((it) => ({ productName: it.productName.trim(), units: Math.max(0, Math.floor(it.units)) }))
    .filter((it) => it.productName && it.units > 0);
  if (items.length === 0) throw new Error("Cần ít nhất 1 SKU với số lượng > 0");
  const palletCount = Math.max(1, Math.floor(input.palletCount));

  const start = await nextPalletNumber();
  const now = new Date();
  const total = items.reduce((s, it) => s + it.units, 0);
  const summary = items.map((it) => it.productName).join(" + ");

  const palletRows: (typeof storagePallets.$inferInsert)[] = [];
  const itemRows: (typeof storagePalletItems.$inferInsert)[] = [];
  const moveRows: (typeof storageMovements.$inferInsert)[] = [];

  for (let i = 0; i < palletCount; i++) {
    const id = randomUUID();
    palletRows.push({
      id,
      palletCode: palletCode(start + i),
      customerId: input.customerId,
      warehouseCode: input.warehouseCode,
      productName: summary,
      unitCount: total,
      initialUnits: total,
      status: "IN_STORAGE",
      receivedAt: now,
      note: input.note ?? null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    for (const it of items) {
      const itemId = randomUUID();
      itemRows.push({
        id: itemId,
        palletId: id,
        productName: it.productName,
        unitCount: it.units,
        initialUnits: it.units,
        createdAt: now,
        updatedAt: now,
      });
      moveRows.push({
        id: randomUUID(),
        palletId: id,
        palletItemId: itemId,
        customerId: input.customerId,
        type: "RECEIVE_IN",
        units: it.units,
        uom: "UNIT",
        occurredAt: now,
        createdBy: input.createdBy,
        createdAt: now,
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(storagePallets).values(palletRows);
    await tx.insert(storagePalletItems).values(itemRows);
    await tx.insert(storageMovements).values(moveRows);
  });

  return { count: palletRows.length };
}

export interface PickupInput {
  palletId: string;
  uom: StorageUom; // PALLET = lấy nguyên pallet (hết unit); UNIT = lấy lẻ `units`
  units?: number; // bắt buộc khi uom = UNIT
  createdBy: string;
  note?: string;
}

export interface PickupItemInput {
  palletItemId: string;
  uom: StorageUom; // PALLET = lấy hết SKU đó; UNIT = lấy lẻ `units`
  units?: number;
  createdBy: string;
  note?: string;
}

/**
 * Xuất/lấy hàng từ 1 SKU (item) trong pallet. PALLET = lấy hết SKU; UNIT = `units`.
 * Trừ tồn item + ghi PICKUP_OUT (gắn palletItemId) + đồng bộ cache pallet.
 */
export async function pickupFromItem(input: PickupItemInput) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(storagePalletItems)
      .where(eq(storagePalletItems.id, input.palletItemId));
    if (!item) throw new Error("Không tìm thấy SKU trong pallet");
    const [pallet] = await tx
      .select()
      .from(storagePallets)
      .where(eq(storagePallets.id, item.palletId));
    if (!pallet) throw new Error("Pallet not found");

    const taken =
      input.uom === "PALLET"
        ? item.unitCount
        : Math.min(item.unitCount, Math.max(1, Math.floor(input.units ?? 0)));
    if (taken <= 0) throw new Error("Số lượng lấy phải > 0");
    if (taken > item.unitCount)
      throw new Error(`SKU ${item.productName} chỉ còn ${item.unitCount} units`);

    const now = new Date();
    await tx
      .update(storagePalletItems)
      .set({ unitCount: item.unitCount - taken, updatedAt: now })
      .where(eq(storagePalletItems.id, item.id));

    await tx.insert(storageMovements).values({
      id: randomUUID(),
      palletId: pallet.id,
      palletItemId: item.id,
      customerId: pallet.customerId,
      type: "PICKUP_OUT",
      units: -taken,
      uom: input.uom,
      occurredAt: now,
      note: input.note ?? null,
      createdBy: input.createdBy,
      createdAt: now,
    });

    await recomputePalletCache(tx, pallet.id, now);
    return { taken, remaining: item.unitCount - taken, emptied: item.unitCount - taken === 0 };
  });
}

/**
 * Lấy hàng ở mức pallet (tương thích UI cũ / pallet 1 SKU). Pallet nhiều SKU thì
 * bắt buộc chỉ định SKU qua pickupFromItem.
 */
export async function pickupFromPallet(input: PickupInput) {
  const [pallet] = await db
    .select()
    .from(storagePallets)
    .where(eq(storagePallets.id, input.palletId));
  if (!pallet) throw new Error("Pallet not found");
  if (pallet.status !== "IN_STORAGE") throw new Error("Pallet is no longer in storage");

  const items = await db
    .select()
    .from(storagePalletItems)
    .where(eq(storagePalletItems.palletId, input.palletId));
  if (items.length > 1)
    throw new Error("Pallet có nhiều SKU — hãy chọn SKU cụ thể để lấy.");
  if (items.length === 0) throw new Error("Pallet chưa có SKU nào");

  return pickupFromItem({
    palletItemId: items[0].id,
    uom: input.uom,
    units: input.units,
    createdBy: input.createdBy,
    note: input.note,
  });
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

export interface EditPalletInput {
  palletId: string;
  productName?: string;
  unitCount?: number; // tồn hiện tại MỚI (chênh so với cũ → ghi ADJUST)
  note?: string | null;
  createdBy: string;
}

/** SKU con của 1 hoặc nhiều pallet (cho UI hiển thị/chọn). */
export async function listPalletItems(palletIds: string[]) {
  if (palletIds.length === 0) return [];
  return db
    .select()
    .from(storagePalletItems)
    .where(inArray(storagePalletItems.palletId, palletIds))
    .orderBy(storagePalletItems.createdAt);
}

/**
 * Sửa 1 SKU (item) trong pallet: đổi tên / chỉnh tồn (delta → ADJUST) + đồng bộ cache.
 */
export async function editPalletItem(input: {
  palletItemId: string;
  productName?: string;
  unitCount?: number;
  createdBy: string;
}) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(storagePalletItems)
      .where(eq(storagePalletItems.id, input.palletItemId));
    if (!item) throw new Error("Không tìm thấy SKU");

    const now = new Date();
    const set: Partial<typeof storagePalletItems.$inferInsert> = { updatedAt: now };
    if (input.productName != null && input.productName.trim())
      set.productName = input.productName.trim();

    let delta = 0;
    if (input.unitCount != null) {
      const newCount = Math.max(0, Math.floor(input.unitCount));
      delta = newCount - item.unitCount;
      set.unitCount = newCount;
    }
    await tx.update(storagePalletItems).set(set).where(eq(storagePalletItems.id, item.id));
    if (delta !== 0) {
      await tx.insert(storageMovements).values({
        id: randomUUID(),
        palletId: item.palletId,
        palletItemId: item.id,
        customerId: (
          await tx
            .select({ c: storagePallets.customerId })
            .from(storagePallets)
            .where(eq(storagePallets.id, item.palletId))
        )[0].c,
        type: "ADJUST",
        units: delta,
        uom: "UNIT",
        occurredAt: now,
        note: "Sửa tồn tay",
        createdBy: input.createdBy,
        createdAt: now,
      });
    }
    await recomputePalletCache(tx, item.palletId, now);
    return { id: item.id, delta };
  });
}

/**
 * Sửa pallet (staff, tương thích UI cũ): ghi chú ở mức pallet; tên/tồn áp cho SKU
 * DUY NHẤT nếu pallet 1 SKU. Pallet nhiều SKU → sửa từng SKU qua editPalletItem.
 */
export async function editPallet(input: EditPalletInput) {
  const [p] = await db
    .select()
    .from(storagePallets)
    .where(eq(storagePallets.id, input.palletId));
  if (!p) throw new Error("Pallet not found");

  const now = new Date();
  if (input.note !== undefined) {
    await db
      .update(storagePallets)
      .set({ note: input.note || null, updatedAt: now })
      .where(eq(storagePallets.id, p.id));
  }

  if (input.productName != null || input.unitCount != null) {
    const items = await db
      .select({ id: storagePalletItems.id })
      .from(storagePalletItems)
      .where(eq(storagePalletItems.palletId, p.id));
    if (items.length > 1)
      throw new Error("Pallet có nhiều SKU — sửa từng SKU riêng.");
    if (items.length === 1) {
      await editPalletItem({
        palletItemId: items[0].id,
        productName: input.productName,
        unitCount: input.unitCount,
        createdBy: input.createdBy,
      });
    }
  }
  return { id: p.id };
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
    await tx.delete(storagePalletItems).where(eq(storagePalletItems.palletId, id));
    await tx.delete(storagePallets).where(eq(storagePallets.id, id));
  });
}
