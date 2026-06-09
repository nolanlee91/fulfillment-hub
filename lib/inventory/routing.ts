// Định tuyến kho có nhìn tồn kho — nâng cấp bộ lọc "region" thuần theo địa chỉ.
//
// Quy tắc: 1 đơn chỉ đi kho EAST (Ontario) khi CẢ 3 đúng:
//   1. Region đích = EAST, VÀ
//   2. Mặt hàng được theo dõi ở kho EAST (= kho E có loại đó), VÀ
//   3. Tồn khả dụng kho E đủ số lượng đơn.
// Thiếu bất kỳ điều nào → đơn về kho WEST (BC, có đủ mặt hàng).
//
// Tồn khả dụng = on_hand (mặt hàng tracked) − số đã cam kết cho đơn EXPORTED đi
// kho E nhưng chưa trừ (chưa import label). Phân bổ greedy theo thứ tự cũ trước
// (FIFO) để nhất quán giữa danh sách đơn và lúc tạo batch.

import { db } from "@/lib/db";
import { orders as ordersTable, inventoryTracking } from "@/lib/db/schema";
import { eq, inArray, asc } from "drizzle-orm";
import { provinceToRegion } from "@/lib/geo/province";
import { orderWarehouse, type WarehouseCode } from "./index";

// Trạng thái đơn còn "chưa chốt kho" → được phân bổ tồn khi định tuyến.
const ASSIGNABLE_STATUSES = ["NEW", "READY", "ERROR", "ERROR_UPDATED"] as const;

interface GeoOrder {
  productId: string;
  quantity: number;
  province: string | null;
  country: string | null;
}

/** Kho thực sự của 1 đơn đã chốt: ưu tiên giá trị đã lưu, fallback theo region. */
export function effectiveWarehouse(o: {
  warehouseCode: string | null;
  province: string | null;
  country: string | null;
}): WarehouseCode {
  if (o.warehouseCode === "EAST" || o.warehouseCode === "WEST") return o.warehouseCode;
  return orderWarehouse(o.province, o.country);
}

/**
 * Tồn khả dụng kho EAST cho phân bổ MỚI = on_hand (mặt hàng tracked) − đã cam kết
 * cho đơn EXPORTED đi kho E (chưa import label nên chưa trừ).
 * Trả về Map<productId, qty>. Mặt hàng không track ở E → KHÔNG có trong map.
 */
export async function loadEastAvailable(): Promise<Map<string, number>> {
  const track = await db
    .select({
      productId: inventoryTracking.productId,
      tracked: inventoryTracking.tracked,
      onHand: inventoryTracking.onHand,
    })
    .from(inventoryTracking)
    .where(eq(inventoryTracking.warehouseCode, "EAST"));

  const avail = new Map<string, number>();
  for (const t of track) if (t.tracked) avail.set(t.productId, t.onHand);

  if (avail.size === 0) return avail;

  // Trừ phần đã cam kết cho đơn EXPORTED đi kho E (chưa trừ tồn).
  const committed = await db
    .select({
      productId: ordersTable.productId,
      quantity: ordersTable.quantity,
      province: ordersTable.province,
      country: ordersTable.country,
      warehouseCode: ordersTable.warehouseCode,
    })
    .from(ordersTable)
    .where(eq(ordersTable.status, "EXPORTED"));

  for (const c of committed) {
    const wh = effectiveWarehouse(c);
    if (wh !== "EAST") continue;
    if (avail.has(c.productId)) {
      avail.set(c.productId, (avail.get(c.productId) ?? 0) - c.quantity);
    }
  }

  return avail;
}

/**
 * Chọn kho cho 1 đơn CHƯA chốt, tiêu thụ tồn kho E greedy từ `avail`.
 * Mutate `avail` (trừ đi nếu gán EAST).
 */
export function pickWarehouse(o: GeoOrder, avail: Map<string, number>): WarehouseCode {
  if (provinceToRegion(o.province, o.country) !== "EAST") return "WEST";
  const a = avail.get(o.productId);
  if (a === undefined) return "WEST"; // kho E không trữ mặt hàng này
  if (a < o.quantity) return "WEST"; // không đủ tồn → BC
  avail.set(o.productId, a - o.quantity);
  return "EAST";
}

interface ResolvableOrder {
  uniqueKey: string;
  productId: string;
  province: string | null;
  country: string | null;
  warehouseCode: string | null;
  status: string;
}

/**
 * Resolver kho cho mọi đơn (1 lần load, dùng cho cả list + export):
 *   1. Đơn đã chốt (warehouseCode đã lưu) → dùng nguyên.
 *   2. Đơn chưa chốt (NEW/READY/ERROR…) → kết quả phân bổ greedy FIFO toàn cục
 *      (region + tồn kho E). Tính toàn cục để list & lúc tạo batch nhất quán.
 *   3. Đơn cũ đã xử lý nhưng chưa có warehouseCode → region + KIỂM TRA mặt hàng
 *      có được track ở kho E không. KHÔNG track ở E ⇒ WEST dù region=EAST
 *      (đây là chỗ trước bị sai: fallback region thuần gán nhầm EAST).
 */
export async function buildWarehouseResolver(): Promise<
  (o: ResolvableOrder) => WarehouseCode
> {
  const avail = await loadEastAvailable();
  const eastProducts = new Set(avail.keys()); // mặt hàng kho E có theo dõi

  const assignable = await db
    .select({
      uniqueKey: ordersTable.uniqueKey,
      productId: ordersTable.productId,
      quantity: ordersTable.quantity,
      province: ordersTable.province,
      country: ordersTable.country,
    })
    .from(ordersTable)
    .where(inArray(ordersTable.status, [...ASSIGNABLE_STATUSES]))
    .orderBy(asc(ordersTable.syncedAt), asc(ordersTable.uniqueKey));

  const map = new Map<string, WarehouseCode>();
  for (const o of assignable) map.set(o.uniqueKey, pickWarehouse(o, avail));

  return (o: ResolvableOrder): WarehouseCode => {
    if (o.warehouseCode === "EAST" || o.warehouseCode === "WEST") return o.warehouseCode;
    const fromMap = map.get(o.uniqueKey);
    if (fromMap) return fromMap;
    // Đơn cũ chưa gán: region + mặt hàng phải được track ở kho E mới là EAST.
    if (provinceToRegion(o.province, o.country) !== "EAST") return "WEST";
    return eastProducts.has(o.productId) ? "EAST" : "WEST";
  };
}
