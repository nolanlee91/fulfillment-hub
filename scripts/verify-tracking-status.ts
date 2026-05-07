/**
 * Verify kết quả reprocess: check distribution status + attention_reason
 *
 *   npx tsx --env-file=.env.local scripts/verify-tracking-status.ts
 */
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("\n=== Distribution status (đơn có tracking_number) ===");
  const byStatus = await db.execute(sql`
    SELECT status::text AS status, COUNT(*)::int AS n
    FROM orders
    WHERE tracking_number IS NOT NULL
    GROUP BY status
    ORDER BY n DESC
  `);
  for (const row of (byStatus as unknown as { status: string; n: number }[])) {
    console.log(`  ${row.status.padEnd(20)} ${row.n}`);
  }

  console.log("\n=== Distribution attention_reason ===");
  const byAttention = await db.execute(sql`
    SELECT COALESCE(attention_reason::text, '(null)') AS reason, COUNT(*)::int AS n
    FROM orders
    WHERE tracking_number IS NOT NULL
    GROUP BY attention_reason
    ORDER BY n DESC
  `);
  for (const row of (byAttention as unknown as { reason: string; n: number }[])) {
    console.log(`  ${row.reason.padEnd(20)} ${row.n}`);
  }

  console.log("\n=== Sample 3 đơn có attention != null ===");
  const samples = await db.execute(sql`
    SELECT order_id, status::text AS status, attention_reason::text AS reason, attention_note, attention_at
    FROM orders
    WHERE attention_reason IS NOT NULL
    ORDER BY attention_at DESC
    LIMIT 3
  `);
  for (const row of (samples as unknown as { order_id: string; status: string; reason: string; attention_note: string; attention_at: Date }[])) {
    console.log(`  ${row.order_id} | ${row.status} | ${row.reason} | ${row.attention_note}`);
  }

  console.log("\n=== Sample 3 đơn FAILED gần nhất (kiểm tra returnFlag R/A/B đã đúng) ===");
  const failed = await db.execute(sql`
    SELECT order_id, status::text AS status, last_tracking_event, last_tracking_at
    FROM orders
    WHERE status = 'FAILED' AND tracking_number IS NOT NULL
    ORDER BY last_tracking_at DESC
    LIMIT 3
  `);
  for (const row of (failed as unknown as { order_id: string; status: string; last_tracking_event: string; last_tracking_at: Date }[])) {
    console.log(`  ${row.order_id} | ${row.last_tracking_event}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
