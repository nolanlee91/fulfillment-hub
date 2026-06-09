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

/**
 * Tính kho đề xuất cho TẤT CẢ đơn chưa chốt (toàn cục, FIFO) → Map<uniqueKey, kho>.
 * Đơn đã chốt (EXPORTED trở đi) KHÔNG nằm trong map — dùng warehouseCode đã lưu.
 * Tính toàn cục để danh sách đơn và lúc tạo batch nhất quán bất kể bộ lọc đang xem.
 */
export async function computeWarehouseMap(): Promise<Map<string, WarehouseCode>> {
  const avail = await loadEastAvailable();
  const map = new Map<string, WarehouseCode>();
  if (avail.size === 0) return map; // không track gì ở E → mọi đơn về WEST (caller fallback)

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

  for (const o of assignable) {
    map.set(o.uniqueKey, pickWarehouse(o, avail));
  }
  return map;
}
