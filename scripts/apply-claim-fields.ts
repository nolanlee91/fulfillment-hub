/**
 * Migration: 4 cột phục vụ claim giao trễ (On-Time Delivery Guarantee).
 *
 *  - service_type              : loại dịch vụ từ feed (F19). Chỉ "Expedited Parcels"
 *                                mới có bảo đảm giao đúng hạn.
 *  - guaranteed_delivery_date  : ngày cam kết giao (F40) — LẤY LẦN ĐẦU, KHÓA LUÔN.
 *                                Carrier dời ngày này về sau (event 1200/1203); nếu
 *                                ghi đè thì mọi đơn trễ đều hoá "đúng hạn" và danh
 *                                sách claim vĩnh viễn rỗng.
 *  - edd_current               : ngày dự kiến MỚI NHẤT (để thấy đã bị dời tới đâu).
 *  - edd_change_count          : số lần carrier dời ngày — bằng chứng họ tự thừa
 *                                nhận không giữ được lịch.
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/apply-claim-fields.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS service_type TEXT,
      ADD COLUMN IF NOT EXISTS guaranteed_delivery_date DATE,
      ADD COLUMN IF NOT EXISTS edd_current DATE,
      ADD COLUMN IF NOT EXISTS edd_change_count INTEGER NOT NULL DEFAULT 0;
  `);

  // Lọc đơn trễ = so guaranteed_delivery_date với delivered_at → index cột mốc.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS orders_guaranteed_date_idx
      ON orders (guaranteed_delivery_date);
  `);

  console.log("✓ orders: service_type, guaranteed_delivery_date, edd_current, edd_change_count ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
