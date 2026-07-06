/**
 * Thêm 2 cột customer-confirm vào storage_pickup_requests (xác nhận 2 phía).
 * Chạy: npx tsx --env-file=.env.local scripts/apply-storage-customer-confirm.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    ALTER TABLE storage_pickup_requests
      ADD COLUMN IF NOT EXISTS customer_confirmed_by text,
      ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamp;
  `);
  console.log("✓ Added customer_confirmed_by + customer_confirmed_at");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
