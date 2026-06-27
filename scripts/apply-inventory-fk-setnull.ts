/**
 * Fix: FK inventory_movements.ref_order_key → orders.unique_key đang NO ACTION,
 * chặn xóa đơn đã trừ kho (LABEL_CREATED có ORDER_OUT). Đổi sang ON DELETE SET NULL:
 * xóa đơn tự gỡ liên kết, GIỮ movement làm audit (tồn không đổi).
 *
 * Robust: tìm tên constraint thực rồi drop, add lại với SET NULL.
 * Chạy: npx tsx --env-file=.env.local scripts/apply-inventory-fk-setnull.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Dropping old FK + re-adding with ON DELETE SET NULL...");
  await db.execute(sql`
    DO $$
    DECLARE c text;
    BEGIN
      SELECT conname INTO c
        FROM pg_constraint
       WHERE conrelid = 'inventory_movements'::regclass
         AND contype = 'f'
         AND conkey = ARRAY[(
           SELECT attnum FROM pg_attribute
            WHERE attrelid = 'inventory_movements'::regclass
              AND attname = 'ref_order_key'
         )];
      IF c IS NOT NULL THEN
        EXECUTE 'ALTER TABLE inventory_movements DROP CONSTRAINT ' || quote_ident(c);
      END IF;
    END $$;
  `);
  await db.execute(sql`
    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_ref_order_key_fkey
      FOREIGN KEY (ref_order_key) REFERENCES orders(unique_key) ON DELETE SET NULL;
  `);

  const check = await db.execute(sql`
    SELECT conname, confdeltype FROM pg_constraint
     WHERE conrelid = 'inventory_movements'::regclass AND contype = 'f'
       AND conname = 'inventory_movements_ref_order_key_fkey';
  `);
  // confdeltype 'n' = SET NULL
  console.log("FK now:", check);
  console.log("✓ Done (confdeltype 'n' = SET NULL)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
