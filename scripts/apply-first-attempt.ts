/**
 * Migration: cột orders.first_attempt_date — ngày carrier MANG HÀNG TỚI lần đầu.
 *
 * Chuẩn giao công bố đo tới "the first delivery attempt", KHÔNG đo tới lúc hàng
 * được nhận. Đơn để giấy báo rồi khách 5 ngày sau mới ra bưu cục lấy thì carrier
 * KHÔNG trễ — nhưng `delivered_at` lại ghi ngày khách lấy.
 *
 * Đo bằng delivered_at làm 15/37 đơn bị tính trễ oan (đo thật 2026-09-15).
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/apply-first-attempt.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS first_attempt_date DATE;
  `);
  console.log("✓ orders.first_attempt_date ready");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
