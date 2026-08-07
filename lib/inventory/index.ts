// Tồn kho theo từng kho — logic dùng chung cho API + hook trừ kho khi import label.
//
// Mô hình:
//   - inventory_movements là ledger nguồn gốc (mọi biến động + audit).
//   - inventory_tracking.on_hand là cache tồn hiện tại, cập nhật cùng mỗi movement
//     trong 1 transaction → routing đọc nhanh, không cần SUM.
//   - Chỉ product được `tracked` ở kho đó mới bị trừ; product không track = bỏ qua
//     hoàn toàn (kho coi như không quản loại đó).

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { inventoryTracking, inventoryMovements, orders } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { provinceToRegion, type Region } from "@/lib/geo/province";

export type WarehouseCode = "WEST" | "EAST";

/** Region đích của đơn → kho đóng hàng vật lý. UNKNOWN (ngoài CA) → kho BC. */
export function regionToWarehouse(region: Region): WarehouseCode {
  return region === "EAST" ? "EAST" : "WEST";
}

/** Kho đóng đơn dựa trên tỉnh/quốc gia người nhận. */
export function orderWarehouse(
  province: string | null,
  country: string | null,
): WarehouseCode {
  return regionToWarehouse(provinceToRegion(province, country));
}

export function trackingId(warehouseCode: string, productId: string): string {
  return `${warehouseCode}__${productId}`;
}

type MovementType = "STOCK_IN" | "ORDER_OUT" | "ADJUST";

/**
 * Ghi 1 biến động vào ledger + cập nhật cache on_hand (trong transaction).
 * - Với ORDER_OUT có refOrderKey: idempotent — đã trừ đơn này rồi thì bỏ qua,
 *   KHÔNG trừ on_hand lần 2 (dựa unique index ref_order_key).
 * - Tự tạo dòng inventory_tracking nếu chưa có (tracked theo `defaultTracked`).
 *
 * Trả về true nếu đã ghi (và trừ/cộng cache), false nếu bị bỏ qua (idempotent skip).
 */
export async function recordMovement(opts: {
  warehouseCode: string;
  productId: string;
  delta: number;
  type: MovementType;
  refOrderKey?: string | null;
  note?: string | null;
  createdBy?: string | null;
  defaultTracked?: boolean;
}): Promise<boolean> {
  const {
    warehouseCode,
    productId,
    delta,
    type,
    refOrderKey = null,
    note = null,
    createdBy = null,
    defaultTracked = true,
  } = opts;

  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(inventoryMovements)
      .values({
        id: randomUUID(),
        warehouseCode,
        productId,
        delta,
        type,
        refOrderKey,
        note,
        createdBy,
      })
      .onConflictDoNothing({ target: inventoryMovements.refOrderKey })
      .returning({ id: inventoryMovements.id });

    // refOrderKey đã tồn tại → đã ghi trước đó, không trừ cache lần 2.
    if (refOrderKey && inserted.length === 0) return false;

    const id = trackingId(warehouseCode, productId);
    await tx
      .insert(inventoryTracking)
      .values({
        id,
        warehouseCode,
        productId,
        tracked: defaultTracked,
        onHand: delta,
      })
      .onConflictDoUpdate({
        target: inventoryTracking.id,
        set: {
          onHand: sql`${inventoryTracking.onHand} + ${delta}`,
          updatedAt: new Date(),
        },
      });

    return true;
  });
}

/**
 * Trừ tồn khi đơn được tạo label (LABEL_CREATED).
 * Với mỗi uniqueKey: tìm kho theo region đích, nếu product đang `tracked` ở kho đó
 * (và đơn có ngày ≥ tracked_since) thì ghi ORDER_OUT −quantity (idempotent).
 *
 * KHÔNG ném lỗi ra ngoài — tồn kho là phụ trợ, không được làm hỏng việc import label.
 * Trả về số đơn đã trừ thành công.
 */
export async function deductOrdersInventory(
  uniqueKeys: string[],
  createdBy?: string | null,
): Promise<number> {
  if (uniqueKeys.length === 0) return 0;
  let deducted = 0;

  for (const key of uniqueKeys) {
    try {
      const [o] = await db
        .select({
          uniqueKey: orders.uniqueKey,
          productId: orders.productId,
          quantity: orders.quantity,
          itemBreakdown: orders.itemBreakdown,
          province: orders.province,
          country: orders.country,
          shipDate: orders.shipDate,
          warehouseCode: orders.warehouseCode,
        })
        .from(orders)
        .where(eq(orders.uniqueKey, key));
      if (!o || o.quantity <= 0) continue;

      // Ưu tiên kho đã gán lúc tạo batch; fallback theo region cho đơn cũ chưa gán.
      const warehouseCode =
        o.warehouseCode === "EAST" || o.warehouseCode === "WEST"
          ? o.warehouseCode
          : orderWarehouse(o.province, o.country);

      // Tab nhiều mặt hàng (vd Baku Serum + Cream): trừ theo TỪNG loại từ breakdown,
      // KHÔNG trừ product gốc (gốc chỉ là đơn vị đóng gói). Mỗi loại 1 refOrderKey
      // riêng (`key::variantId`) để giữ idempotent độc lập.
      const breakdown = o.itemBreakdown;
      const targets: { productId: string; qty: number; refKey: string }[] =
        breakdown && Object.keys(breakdown).length > 0
          ? Object.entries(breakdown)
              .filter(([, q]) => q > 0)
              .map(([variantId, q]) => ({
                productId: variantId,
                qty: q,
                refKey: `${o.uniqueKey}::${variantId}`,
              }))
          : [{ productId: o.productId, qty: o.quantity, refKey: o.uniqueKey }];

      for (const t of targets) {
        // Chỉ trừ nếu product đang được theo dõi ở kho này.
        const [cfg] = await db
          .select({
            tracked: inventoryTracking.tracked,
            trackedSince: inventoryTracking.trackedSince,
          })
          .from(inventoryTracking)
          .where(
            and(
              eq(inventoryTracking.warehouseCode, warehouseCode),
              eq(inventoryTracking.productId, t.productId),
            ),
          );
        if (!cfg || !cfg.tracked) continue;

        // Chỉ trừ đơn RỜI KỆ (ship) sau mốc bắt đầu theo dõi (nếu có đặt mốc).
        // Dùng shipDate (lúc hàng thực sự xuất kho), KHÔNG dùng orderDate — khách
        // đặt trước cả tuần mới đóng nên orderDate luôn cũ hơn, dễ bị chặn oan.
        if (cfg.trackedSince && o.shipDate && o.shipDate < cfg.trackedSince) {
          continue;
        }

        const ok = await recordMovement({
          warehouseCode,
          productId: t.productId,
          delta: -t.qty,
          type: "ORDER_OUT",
          refOrderKey: t.refKey,
          note: "Import label",
          createdBy,
          defaultTracked: true,
        });
        if (ok) deducted++;
      }
    } catch (err) {
      console.error(`[inventory] deduct failed for ${key}:`, err);
    }
  }

  return deducted;
}
