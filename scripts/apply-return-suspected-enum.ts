/**
 * Migration: thêm giá trị 'RETURN_SUSPECTED' vào enum attention_reason.
 * Dùng cho heuristic "có chuyển động vận chuyển SAU ngày giao → nghi hàng trả về"
 * (Canada Post luồng giao vào parcel locker rồi thu hồi không phát mã RTS).
 *
 * Idempotent: ADD VALUE IF NOT EXISTS.
 * Chạy: npx tsx --env-file=.env.local scripts/apply-return-suspected-enum.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TYPE attention_reason ADD VALUE IF NOT EXISTS 'RETURN_SUSPECTED';`);
  console.log("✓ attention_reason += RETURN_SUSPECTED");

  const vals = await db.execute(sql`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'attention_reason'
    ORDER BY e.enumsortorder;
  `);
  console.log("Giá trị enum hiện tại:", vals);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
