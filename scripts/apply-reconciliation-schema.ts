/**
 * Migration: thêm 4 column reconciliation vào bảng orders.
 *   - payment_type        text          ETF / BANK_TRANSFER / CHEQUE / MONEY_ORDER
 *   - ref_number          text          Mã Ref từ email noti (chỉ ETF)
 *   - payment_proof_url   text          URL ảnh chứng từ (non-ETF, Phase 2)
 *   - reconciled_at       timestamptz   Khi đối soát thành công
 *
 * Idempotent: dùng IF NOT EXISTS để chạy lại không lỗi.
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding reconciliation columns to orders table...");

  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_type      TEXT,
      ADD COLUMN IF NOT EXISTS ref_number        TEXT,
      ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
      ADD COLUMN IF NOT EXISTS reconciled_at     TIMESTAMP;
  `);

  console.log("✓ Added 4 columns");

  // Index để query đơn chưa đối soát theo customer
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS orders_unreconciled_idx
      ON orders (customer_id)
      WHERE reconciled_at IS NULL;
  `);

  console.log("✓ Added orders_unreconciled_idx");

  // Verify
  const cols = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name IN ('payment_type', 'ref_number', 'payment_proof_url', 'reconciled_at')
    ORDER BY column_name;
  `);
  console.log("\nVerified columns:");
  console.table(cols);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
