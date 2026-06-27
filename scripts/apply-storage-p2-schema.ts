/**
 * Migration Phase 2 Lưu kho: yêu cầu lấy hàng của khách.
 *   - enum storage_request_status (PENDING / DONE / CANCELLED)
 *   - storage_pickup_requests        : 1 yêu cầu của khách
 *   - storage_pickup_request_items   : dòng item (pallet + units yêu cầu/đã chốt)
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/apply-storage-p2-schema.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating storage_request_status enum...");
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE storage_request_status AS ENUM ('PENDING', 'DONE', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  console.log("Creating storage_pickup_requests table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS storage_pickup_requests (
      id             TEXT PRIMARY KEY,
      customer_id    TEXT NOT NULL REFERENCES customers(id),
      status         storage_request_status NOT NULL DEFAULT 'PENDING',
      requested_date TIMESTAMP,
      note           TEXT,
      created_by     TEXT,
      confirmed_by   TEXT,
      confirmed_at   TIMESTAMP,
      created_at     TIMESTAMP NOT NULL DEFAULT now(),
      updated_at     TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS storage_requests_customer_idx ON storage_pickup_requests (customer_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS storage_requests_status_idx ON storage_pickup_requests (status);
  `);

  console.log("Creating storage_pickup_request_items table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS storage_pickup_request_items (
      id              TEXT PRIMARY KEY,
      request_id      TEXT NOT NULL REFERENCES storage_pickup_requests(id),
      pallet_id       TEXT NOT NULL REFERENCES storage_pallets(id),
      units           INTEGER NOT NULL,
      uom             storage_uom NOT NULL,
      confirmed_units INTEGER,
      created_at      TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS storage_request_items_request_idx ON storage_pickup_request_items (request_id);
  `);

  const t = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('storage_pickup_requests', 'storage_pickup_request_items') ORDER BY table_name;
  `);
  console.log("Tables present:", t);
  console.log("✓ Storage P2 schema ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
