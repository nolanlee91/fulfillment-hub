/**
 * P1 pallet trộn: tạo bảng storage_pallet_items + cột pallet_item_id (movements,
 * pickup_request_items) + backfill 1 item/pallet cũ (giữ dữ liệu hiện tại chạy tiếp).
 * Chạy: npx tsx --env-file=.env.local scripts/apply-storage-pallet-items.ts
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  storagePallets,
  storagePalletItems,
  storageMovements,
  storagePickupRequestItems,
} from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

async function main() {
  // 1) DDL (idempotent)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS storage_pallet_items (
      id text PRIMARY KEY,
      pallet_id text NOT NULL REFERENCES storage_pallets(id),
      product_name text NOT NULL,
      unit_count integer NOT NULL DEFAULT 0,
      initial_units integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS storage_pallet_items_pallet_idx ON storage_pallet_items(pallet_id);`);
  await db.execute(sql`ALTER TABLE storage_movements ADD COLUMN IF NOT EXISTS pallet_item_id text REFERENCES storage_pallet_items(id);`);
  await db.execute(sql`ALTER TABLE storage_pickup_request_items ADD COLUMN IF NOT EXISTS pallet_item_id text REFERENCES storage_pallet_items(id);`);
  console.log("✓ DDL xong");

  // 2) Backfill: mỗi pallet chưa có item → tạo 1 item từ cache productName/unitCount
  const pallets = await db.select().from(storagePallets);
  const existing = await db
    .select({ palletId: storagePalletItems.palletId })
    .from(storagePalletItems);
  const have = new Set(existing.map((i) => i.palletId));

  const map = new Map<string, string>(); // palletId → itemId
  let created = 0;
  for (const p of pallets) {
    if (have.has(p.id)) continue;
    const itemId = randomUUID();
    await db.insert(storagePalletItems).values({
      id: itemId,
      palletId: p.id,
      productName: p.productName,
      unitCount: p.unitCount,
      initialUnits: p.initialUnits,
    });
    map.set(p.id, itemId);
    created++;
  }
  console.log(`✓ tạo ${created} pallet_items (1/pallet cũ)`);

  // 3) Backfill FK cho movements + request_items (pallet cũ chỉ 1 item → gán được)
  let mv = 0;
  let ri = 0;
  for (const [palletId, itemId] of map) {
    const r1 = await db
      .update(storageMovements)
      .set({ palletItemId: itemId })
      .where(and(eq(storageMovements.palletId, palletId), isNull(storageMovements.palletItemId)))
      .returning({ id: storageMovements.id });
    const r2 = await db
      .update(storagePickupRequestItems)
      .set({ palletItemId: itemId })
      .where(and(eq(storagePickupRequestItems.palletId, palletId), isNull(storagePickupRequestItems.palletItemId)))
      .returning({ id: storagePickupRequestItems.id });
    mv += r1.length;
    ri += r2.length;
  }
  console.log(`✓ backfill ${mv} movements + ${ri} request_items`);
  console.log("✓ DONE");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
