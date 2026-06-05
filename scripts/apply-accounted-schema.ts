/**
 * Migration: thêm cột "hạch toán" cho bảng orders.
 *   - accounted_at  timestamptz   Khi KDExpress đã hạch toán (ghi sổ) đơn
 *   - accounted_by  text          username người hạch toán
 *
 * Phân biệt với reconciled_at (đối soát = khách up ảnh/ref):
 *   reconciled = khách đã có bằng chứng thanh toán
 *   accounted  = KDExpress đã ghi sổ kế toán đơn đó
 *
 * Idempotent: IF NOT EXISTS.
 * Chạy: npx tsx --env-file=.env.local scripts/apply-accounted-schema.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding accounting columns to orders table...");

  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS accounted_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS accounted_by TEXT;
  `);

  console.log("✓ Added 2 columns");

  const cols = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name IN ('accounted_at', 'accounted_by')
    ORDER BY column_name;
  `);
  console.log("Columns now present:", cols);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
