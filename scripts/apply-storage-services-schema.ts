/**
 * Migration: phân loại dịch vụ khách + rate lưu kho riêng từng khách.
 *   - customers += fulfillment_enabled (default true) + storage_enabled (default false)
 *   - enum storage_basis (WEEK / MONTH)
 *   - storage_customer_rates: rate riêng từng khách (seed theo bảng giá June 2026)
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/apply-storage-services-schema.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding service flags to customers...");
  await db.execute(sql`
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS fulfillment_enabled BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS storage_enabled BOOLEAN NOT NULL DEFAULT false;
  `);

  console.log("Creating storage_basis enum...");
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE storage_basis AS ENUM ('WEEK', 'MONTH');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  console.log("Creating storage_customer_rates table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS storage_customer_rates (
      customer_id        TEXT PRIMARY KEY REFERENCES customers(id),
      handling_per_pallet NUMERIC(10,2) NOT NULL DEFAULT 10,
      handling_per_unit   NUMERIC(10,2) NOT NULL DEFAULT 1,
      storage_per_week    NUMERIC(10,2) NOT NULL DEFAULT 15,
      storage_per_month   NUMERIC(10,2) NOT NULL DEFAULT 50,
      basis               storage_basis NOT NULL DEFAULT 'MONTH',
      updated_at          TIMESTAMP NOT NULL DEFAULT now()
    );
  `);

  const cols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name IN ('fulfillment_enabled', 'storage_enabled')
    ORDER BY column_name;
  `);
  console.log("Customer flags:", cols);
  console.log("✓ Storage services schema ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
