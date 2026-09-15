/**
 * Migration: cột theo dõi tiến trình nộp claim giao trễ.
 *
 * Mỗi đơn nhiều nhất 1 claim → để thẳng trên `orders`, giống cách
 * reconciled_at / accounted_at đang làm, khỏi đẻ bảng mới.
 *
 *  - claim_status   : NULL = chưa nộp | FILED | APPROVED | REJECTED
 *  - claim_filed_at : thời điểm bấm "đã nộp"
 *  - claim_amount   : số tiền carrier hoàn (điền khi có kết quả)
 *  - claim_note     : ghi chú / lý do bị từ chối
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/apply-claim-status.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS claim_status TEXT,
      ADD COLUMN IF NOT EXISTS claim_filed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS claim_amount NUMERIC(10, 2),
      ADD COLUMN IF NOT EXISTS claim_note TEXT;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS orders_claim_status_idx ON orders (claim_status);
  `);

  console.log("✓ orders: claim_status, claim_filed_at, claim_amount, claim_note ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
