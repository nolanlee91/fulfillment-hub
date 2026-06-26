/**
 * Migration Phase 1 module Lưu kho (3PL):
 *   - enum storage_pallet_status / storage_movement_type / storage_uom
 *   - storage_pallets   : mỗi pallet 1 record (1 SKU/pallet), tồn unit hiện tại
 *   - storage_movements : ledger nhập/xuất unit (audit + phí nhận/xuất)
 *
 * Idempotent: IF NOT EXISTS + DO $$ ... duplicate_object.
 * Chạy: npx tsx --env-file=.env.local scripts/apply-storage-schema.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating storage enums...");
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE storage_pallet_status AS ENUM ('IN_STORAGE', 'PICKED_UP', 'DISPOSED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE storage_movement_type AS ENUM ('RECEIVE_IN', 'PICKUP_OUT', 'ADJUST');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE storage_uom AS ENUM ('PALLET', 'UNIT');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);

  console.log("Creating storage_pallets table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS storage_pallets (
      id             TEXT PRIMARY KEY,
      pallet_code    TEXT NOT NULL,
      customer_id    TEXT NOT NULL REFERENCES customers(id),
      warehouse_code TEXT NOT NULL REFERENCES warehouses(code),
      product_name   TEXT NOT NULL,
      unit_count     INTEGER NOT NULL DEFAULT 0,
      initial_units  INTEGER NOT NULL DEFAULT 0,
      status         storage_pallet_status NOT NULL DEFAULT 'IN_STORAGE',
      received_at    TIMESTAMP NOT NULL DEFAULT now(),
      picked_up_at   TIMESTAMP,
      photo_url      TEXT,
      note           TEXT,
      created_by     TEXT,
      created_at     TIMESTAMP NOT NULL DEFAULT now(),
      updated_at     TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS storage_pallets_code_unique ON storage_pallets (pallet_code);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS storage_pallets_customer_idx ON storage_pallets (customer_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS storage_pallets_status_idx ON storage_pallets (status);
  `);

  console.log("Creating storage_movements table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS storage_movements (
      id          TEXT PRIMARY KEY,
      pallet_id   TEXT NOT NULL REFERENCES storage_pallets(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      type        storage_movement_type NOT NULL,
      units       INTEGER NOT NULL,
      uom         storage_uom NOT NULL,
      occurred_at TIMESTAMP NOT NULL DEFAULT now(),
      note        TEXT,
      created_by  TEXT,
      created_at  TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS storage_movements_pallet_idx ON storage_movements (pallet_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS storage_movements_customer_idx ON storage_movements (customer_id);
  `);

  const cols = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('storage_pallets', 'storage_movements') ORDER BY table_name;
  `);
  console.log("Tables present:", cols);
  console.log("✓ Storage schema ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
