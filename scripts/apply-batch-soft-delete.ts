/**
 * Migration: thêm cột soft-delete cho bảng batches.
 *   - deleted_at      timestamptz   Khi xóa batch
 *   - deleted_reason  text          Lý do xóa (bắt buộc nhập trên UI)
 *   - deleted_by      text          username người xóa
 *
 * Khi xóa batch: đơn còn EXPORTED revert về READY (batch_id = null),
 * batch row được giữ lại (soft-delete) để lưu lý do cho audit.
 *
 * Idempotent: dùng IF NOT EXISTS để chạy lại không lỗi.
 * Chạy: npx tsx --env-file=.env.local scripts/apply-batch-soft-delete.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Adding soft-delete columns to batches table...");

  await db.execute(sql`
    ALTER TABLE batches
      ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMP,
      ADD COLUMN IF NOT EXISTS deleted_reason TEXT,
      ADD COLUMN IF NOT EXISTS deleted_by     TEXT;
  `);

  console.log("✓ Added 3 columns");

  // Verify
  const cols = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'batches'
      AND column_name IN ('deleted_at', 'deleted_reason', 'deleted_by')
    ORDER BY column_name;
  `);
  console.log("Columns now present:", cols);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
