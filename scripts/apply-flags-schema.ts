/**
 * One-shot script: apply schema flags + flag_messages cho chức năng đơn gắn cờ.
 * Chạy 1 lần, idempotent (kiểm tra tồn tại trước khi tạo).
 *
 *   npx tsx --env-file=.env.local scripts/apply-flags-schema.ts
 *
 * Trên Railway: chạy qua Railway shell với env DB đã có sẵn.
 */
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("→ Tạo enum flag_color (nếu chưa có)...");
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flag_color') THEN
        CREATE TYPE flag_color AS ENUM ('red', 'yellow');
      END IF;
    END$$;
  `);

  console.log("→ Tạo bảng flags (nếu chưa có)...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flags (
      id               text PRIMARY KEY,
      order_unique_key text NOT NULL REFERENCES orders(unique_key) ON DELETE CASCADE,
      current_color    flag_color,
      created_by       text NOT NULL REFERENCES users(id),
      created_at       timestamp NOT NULL DEFAULT now(),
      resolved_by      text REFERENCES users(id),
      resolved_at      timestamp,
      last_message_at  timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log("→ Tạo unique index flags_order_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS flags_order_idx ON flags (order_unique_key);
  `);

  console.log("→ Tạo index flags_color_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS flags_color_idx ON flags (current_color);
  `);

  console.log("→ Tạo index flags_last_message_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS flags_last_message_idx ON flags (last_message_at);
  `);

  console.log("→ Tạo bảng flag_messages (nếu chưa có)...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS flag_messages (
      id         text PRIMARY KEY,
      flag_id    text NOT NULL REFERENCES flags(id) ON DELETE CASCADE,
      user_id    text NOT NULL REFERENCES users(id),
      user_role  user_role NOT NULL,
      user_name  text NOT NULL,
      content    text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log("→ Tạo index flag_messages_flag_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS flag_messages_flag_idx ON flag_messages (flag_id);
  `);

  console.log("→ Tạo index flag_messages_created_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS flag_messages_created_idx ON flag_messages (created_at);
  `);

  console.log("✓ Hoàn thành. Kiểm tra:");
  const result = await db.execute(sql`
    SELECT table_name, column_name, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('flags', 'flag_messages')
    ORDER BY table_name, ordinal_position;
  `);
  for (const row of (result as unknown as { table_name: string; column_name: string; udt_name: string; is_nullable: string }[])) {
    console.log(`  ${row.table_name}.${row.column_name}: ${row.udt_name} (nullable=${row.is_nullable})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Lỗi:", err);
  process.exit(1);
});
