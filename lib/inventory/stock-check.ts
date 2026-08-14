// Kiểm tra thiếu tồn kho TRƯỚC khi tạo batch ("đóng" đơn).
//
// Bối cảnh: định tuyến (routing.ts) né kho EAST khi hết, nhưng mặc định coi kho
// WEST vô hạn → khi WEST cũng hết (vd Baku Serum, Acai) không ai chặn, dẫn tới
// tạo label vượt hàng thật. Hàm này gom nhu cầu của lô đơn sắp đóng theo
// (kho × sản phẩm), so với tồn KHẢ DỤNG (on_hand − đã cam kết cho đơn EXPORTED
// chưa import label), trả về các dòng THIẾU để cảnh báo.
//
// Chỉ product đang được THEO DÕI tồn ở kho đó mới bị soi; product không đếm tồn
// (không có dòng inventory_tracking) coi như vô hạn — không chặn.

import { db } from "@/lib/db";
import { orders, inventoryTracking, products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { effectiveWarehouse } from "./routing";
import type { WarehouseCode } from "./index";

export interface Shortfall {
  warehouseCode: WarehouseCode;
  productId: string;
  productName: string;
  demand: number;
  available: number;
  shortBy: number;
}

interface DemandOrder {
  warehouseCode: WarehouseCode;
  productId: string;
  quantity: number;
  itemBreakdown: Record<string, number> | null;
}

/** 1 đơn → các dòng nhu cầu tồn kho (tách theo variant nếu có breakdown). */
function demandLines(o: {
  productId: string;
  quantity: number;
  itemBreakdown: Record<string, number> | null;
}): { productId: string; qty: number }[] {
  const bd = o.itemBreakdown;
  if (bd && Object.keys(bd).length > 0) {
    return Object.entries(bd)
      .filter(([, q]) => q > 0)
      .map(([productId, qty]) => ({ productId, qty }));
  }
  return [{ productId: o.productId, qty: o.quantity }];
}

/**
 * Tính các dòng thiếu tồn cho lô đơn sắp đóng (đã gán kho).
 * `assigned`: đơn kèm kho đã chọn (EAST/WEST). Đơn này đang READY (chưa EXPORTED)
 * nên KHÔNG bị tính vào "đã cam kết".
 */
export async function computeShortfalls(
  assigned: DemandOrder[],
): Promise<Shortfall[]> {
  // 1) Tồn on_hand của product ĐANG track (theo kho).
  const track = await db
    .select({
      wh: inventoryTracking.warehouseCode,
      pid: inventoryTracking.productId,
      tracked: inventoryTracking.tracked,
      onHand: inventoryTracking.onHand,
    })
    .from(inventoryTracking);
  const onHand = new Map<string, number>(); // `wh::pid` → onHand
  const trackedSet = new Set<string>();
  for (const t of track) {
    if (!t.tracked) continue;
    onHand.set(`${t.wh}::${t.pid}`, t.onHand);
    trackedSet.add(`${t.wh}::${t.pid}`);
  }
  if (trackedSet.size === 0) return []; // không đếm tồn gì → không chặn

  // 2) Đã cam kết = đơn EXPORTED (chưa import label nên on_hand chưa trừ).
  const committed = await db
    .select({
      productId: orders.productId,
      quantity: orders.quantity,
      itemBreakdown: orders.itemBreakdown,
      province: orders.province,
      country: orders.country,
      warehouseCode: orders.warehouseCode,
    })
    .from(orders)
    .where(eq(orders.status, "EXPORTED"));
  const used = new Map<string, number>();
  for (const c of committed) {
    const wh = effectiveWarehouse(c);
    for (const d of demandLines(c)) {
      const k = `${wh}::${d.productId}`;
      if (!trackedSet.has(k)) continue;
      used.set(k, (used.get(k) ?? 0) + d.qty);
    }
  }

  // 3) Nhu cầu của lô đơn sắp đóng.
  const demand = new Map<string, number>();
  for (const o of assigned) {
    for (const d of demandLines(o)) {
      const k = `${o.warehouseCode}::${d.productId}`;
      if (!trackedSet.has(k)) continue; // product không track ở kho này → bỏ qua
      demand.set(k, (demand.get(k) ?? 0) + d.qty);
    }
  }
  if (demand.size === 0) return [];

  // 4) Đối chiếu: khả dụng = on_hand − đã cam kết.
  const nameRows = await db.select({ id: products.id, name: products.name }).from(products);
  const nameMap = new Map(nameRows.map((r) => [r.id, r.name]));

  const out: Shortfall[] = [];
  for (const [k, dem] of demand) {
    const avail = (onHand.get(k) ?? 0) - (used.get(k) ?? 0);
    if (dem > avail) {
      const [wh, pid] = k.split("::");
      out.push({
        warehouseCode: wh as WarehouseCode,
        productId: pid,
        productName: nameMap.get(pid) ?? pid,
        demand: dem,
        available: avail,
        shortBy: dem - avail,
      });
    }
  }
  // Nặng nhất trước.
  out.sort((a, b) => b.shortBy - a.shortBy);
  return out;
}
