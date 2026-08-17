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
import { provinceToRegion } from "@/lib/geo/province";
import type { WarehouseCode } from "./index";

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

interface AllocOrder {
  uniqueKey: string;
  productId: string;
  quantity: number;
  itemBreakdown: Record<string, number> | null;
  province: string | null;
  country: string | null;
}

export interface BatchAllocation {
  /** Đơn đủ hàng → tạo batch. */
  okKeys: string[];
  /** Đơn thiếu hàng → chuyển OUT_OF_STOCK. */
  shortKeys: string[];
  /** Kho đã gán cho từng đơn đủ hàng. */
  warehouseByKey: Map<string, WarehouseCode>;
  /** Tóm tắt thiếu theo sản phẩm (cho hộp xác nhận). */
  shortSummary: {
    productId: string;
    productName: string;
    shortOrders: number;
  }[];
}

/**
 * Phân bổ kho + phát hiện đơn thiếu tồn cho lô sắp tạo batch (greedy FIFO,
 * breakdown-aware, WEST hữu hạn cho product đang track).
 *
 * Quy tắc kho: đơn region EAST thử kho EAST trước (mọi loại phải được track + đủ ở
 * EAST); không được thì thử WEST; WEST không track loại đó = vô hạn (kho gốc đủ
 * hàng). Không kho nào đủ → đơn THIẾU (OUT_OF_STOCK).
 */
export async function allocateBatch(
  ordersIn: AllocOrder[],
): Promise<BatchAllocation> {
  // Tồn khả dụng theo (kho::product) = on_hand(tracked) − đã cam kết EXPORTED.
  const track = await db
    .select({
      wh: inventoryTracking.warehouseCode,
      pid: inventoryTracking.productId,
      tracked: inventoryTracking.tracked,
      onHand: inventoryTracking.onHand,
    })
    .from(inventoryTracking);
  const avail = new Map<string, number>();
  for (const t of track) if (t.tracked) avail.set(`${t.wh}::${t.pid}`, t.onHand);

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
  for (const c of committed) {
    const wh = effectiveWarehouse(c);
    for (const d of demandLines(c)) {
      const k = `${wh}::${d.productId}`;
      if (avail.has(k)) avail.set(k, (avail.get(k) ?? 0) - d.qty);
    }
  }

  // Đủ hàng ở 1 kho? EAST: MỌI loại phải track + đủ. WEST: loại không track = vô hạn.
  const fitsEast = (lines: { productId: string; qty: number }[]) =>
    lines.every((l) => {
      const k = `EAST::${l.productId}`;
      return avail.has(k) && (avail.get(k) ?? 0) >= l.qty;
    });
  const fitsWest = (lines: { productId: string; qty: number }[]) =>
    lines.every((l) => {
      const k = `WEST::${l.productId}`;
      return !avail.has(k) || (avail.get(k) ?? 0) >= l.qty;
    });
  const consume = (wh: WarehouseCode, lines: { productId: string; qty: number }[]) => {
    for (const l of lines) {
      const k = `${wh}::${l.productId}`;
      if (avail.has(k)) avail.set(k, (avail.get(k) ?? 0) - l.qty);
    }
  };

  const okKeys: string[] = [];
  const shortKeys: string[] = [];
  const warehouseByKey = new Map<string, WarehouseCode>();
  const shortByProduct = new Map<string, number>();

  for (const o of ordersIn) {
    const lines = demandLines(o);
    const region = provinceToRegion(o.province, o.country);

    let placed: WarehouseCode | null = null;
    if (region === "EAST" && fitsEast(lines)) placed = "EAST";
    else if (fitsWest(lines)) placed = "WEST";

    if (placed) {
      consume(placed, lines);
      warehouseByKey.set(o.uniqueKey, placed);
      okKeys.push(o.uniqueKey);
    } else {
      shortKeys.push(o.uniqueKey);
      // Ghi nhận loại nào gây thiếu (ở WEST — kho gốc).
      for (const l of lines) {
        const k = `WEST::${l.productId}`;
        if (avail.has(k) && (avail.get(k) ?? 0) < l.qty) {
          shortByProduct.set(l.productId, (shortByProduct.get(l.productId) ?? 0) + 1);
        }
      }
    }
  }

  const nameRows = await db.select({ id: products.id, name: products.name }).from(products);
  const nameMap = new Map(nameRows.map((r) => [r.id, r.name]));
  const shortSummary = [...shortByProduct.entries()]
    .map(([productId, shortOrders]) => ({
      productId,
      productName: nameMap.get(productId) ?? productId,
      shortOrders,
    }))
    .sort((a, b) => b.shortOrders - a.shortOrders);

  return { okKeys, shortKeys, warehouseByKey, shortSummary };
}
