/**
 * One-shot script: apply schema users + sessions cho auth.
 * Chạy 1 lần, idempotent (kiểm tra tồn tại trước khi tạo).
 *
 *   npx tsx --env-file=.env.local scripts/apply-users-schema.ts
 *
 * Trên Railway: chạy qua Railway shell với env DB đã có sẵn.
 */
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("→ Tạo enum user_role (nếu chưa có)...");
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'STAFF', 'CUSTOMER');
      END IF;
    END$$;
  `);

  console.log("→ Tạo bảng users (nếu chưa có)...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id           text PRIMARY KEY,
      username     text NOT NULL,
      password_hash text NOT NULL,
      name         text NOT NULL,
      role         user_role NOT NULL,
      customer_id  text REFERENCES customers(id),
      active       boolean NOT NULL DEFAULT true,
      created_at   timestamp NOT NULL DEFAULT now(),
      last_login_at timestamp
    );
  `);

  console.log("→ Tạo unique index users_username_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (username);
  `);

  console.log("→ Tạo bảng sessions (nếu chưa có)...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id         text PRIMARY KEY,
      user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamp NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  console.log("→ Tạo index sessions_user_idx (nếu chưa có)...");
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
  `);

  console.log("✓ Hoàn thành. Kiểm tra:");
  const result = await db.execute(sql`
    SELECT table_name, column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('users', 'sessions')
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
