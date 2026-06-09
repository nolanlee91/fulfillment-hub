/**
 * Migration: tồn kho theo từng kho.
 *   - warehouses            1 dòng / kho (code = Region: WEST | EAST)
 *   - inventory_tracking    cấu hình (kho × product): tracked, tracked_since, on_hand
 *   - inventory_movements   ledger mọi biến động (STOCK_IN / ORDER_OUT / ADJUST)
 *
 * Seed sẵn 2 kho: WEST = Kho BC, EAST = Kho Ontario.
 *
 * Idempotent: IF NOT EXISTS + ON CONFLICT DO NOTHING.
 * Chạy: npx tsx --env-file=.env.local scripts/apply-inventory-schema.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating inventory_movement_type enum...");
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE inventory_movement_type AS ENUM ('STOCK_IN', 'ORDER_OUT', 'ADJUST');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  console.log("Creating warehouses table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS warehouses (
      code        TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      region      TEXT NOT NULL,
      active      BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMP NOT NULL DEFAULT now()
    );
  `);

  console.log("Creating inventory_tracking table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_tracking (
      id                  TEXT PRIMARY KEY,
      warehouse_code      TEXT NOT NULL REFERENCES warehouses(code),
      product_id          TEXT NOT NULL REFERENCES products(id),
      tracked             BOOLEAN NOT NULL DEFAULT true,
      tracked_since       TIMESTAMP,
      on_hand             INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER,
      created_at          TIMESTAMP NOT NULL DEFAULT now(),
      updated_at          TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS inventory_tracking_wh_prod
      ON inventory_tracking (warehouse_code, product_id);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS inventory_tracking_wh_idx
      ON inventory_tracking (warehouse_code);
  `);

  console.log("Creating inventory_movements table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id              TEXT PRIMARY KEY,
      warehouse_code  TEXT NOT NULL REFERENCES warehouses(code),
      product_id      TEXT NOT NULL REFERENCES products(id),
      delta           INTEGER NOT NULL,
      type            inventory_movement_type NOT NULL,
      ref_order_key   TEXT REFERENCES orders(unique_key),
      note            TEXT,
      created_by      TEXT,
      created_at      TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS inventory_movements_wh_prod_idx
      ON inventory_movements (warehouse_code, product_id);
  `);
  // 1 đơn chỉ trừ đúng 1 lần (idempotent). NULL (STOCK_IN/ADJUST) → nhiều NULL OK.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_ref_order_unique
      ON inventory_movements (ref_order_key);
  `);

  console.log("Seeding warehouses (WEST = Kho BC, EAST = Kho Ontario)...");
  await db.execute(sql`
    INSERT INTO warehouses (code, name, region) VALUES
      ('WEST', 'Kho BC', 'WEST'),
      ('EAST', 'Kho Ontario', 'EAST')
    ON CONFLICT (code) DO NOTHING;
  `);

  const wh = await db.execute(sql`SELECT code, name, region FROM warehouses ORDER BY code;`);
  console.log("Warehouses:", wh);

  console.log("✓ Inventory schema ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
