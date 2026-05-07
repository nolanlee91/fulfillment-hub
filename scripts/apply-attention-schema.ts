/**
 * One-shot script: apply schema delta cho attention fields.
 * Chạy 1 lần, idempotent (kiểm tra tồn tại trước khi tạo).
 *
 *   npx tsx --env-file=.env.local scripts/apply-attention-schema.ts
 */
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("→ Tạo enum attention_reason (nếu chưa có)...");
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attention_reason') THEN
        CREATE TYPE attention_reason AS ENUM ('ADDRESS_ERROR', 'DELAYED', 'NOTICE_CARD', 'STUCK');
      END IF;
    END$$;
  `);

  console.log("→ Add cột attention_reason / attention_at / attention_note (nếu chưa có)...");
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS attention_reason attention_reason,
      ADD COLUMN IF NOT EXISTS attention_at timestamp,
      ADD COLUMN IF NOT EXISTS attention_note text;
  `);

  console.log("→ Tạo index orders_attention_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS orders_attention_idx ON orders (attention_reason);
  `);

  console.log("✓ Hoàn thành. Kiểm tra:");
  const result = await db.execute(sql`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name LIKE 'attention%'
    ORDER BY ordinal_position;
  `);
  for (const row of (result as unknown as { column_name: string; data_type: string; udt_name: string; is_nullable: string }[])) {
    console.log(`  ${row.column_name}: ${row.udt_name} (nullable=${row.is_nullable})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Lỗi:", err);
  process.exit(1);
});
