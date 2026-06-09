/**
 * Migration: thêm cột orders.warehouse_code — kho thực sự đóng đơn (gán lúc tạo batch).
 * Dùng để trừ tồn đúng kho khi import label (đơn East fallback về BC không trừ nhầm kho E).
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/apply-order-warehouse.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS warehouse_code TEXT;
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS orders_warehouse_idx ON orders (warehouse_code);
  `);
  console.log("✓ orders.warehouse_code ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
