/**
 * One-shot: TRUNCATE bảng tracking_files để init-pull-apt.ts có thể reprocess
 * tất cả 356 file APT. Bảng orders KHÔNG bị xóa — chỉ reset lịch sử dedup file.
 *
 *   npx tsx --env-file=.env.local scripts/truncate-tracking-files.ts
 */
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const before = await db.execute(sql`SELECT COUNT(*)::int AS n FROM tracking_files`);
  const beforeCount = (before as unknown as { n: number }[])[0].n;
  console.log(`Trước TRUNCATE: ${beforeCount} row trong tracking_files`);

  await db.execute(sql`TRUNCATE TABLE tracking_files`);

  const after = await db.execute(sql`SELECT COUNT(*)::int AS n FROM tracking_files`);
  const afterCount = (after as unknown as { n: number }[])[0].n;
  console.log(`Sau TRUNCATE: ${afterCount} row`);
  console.log("✓ Reset xong, sẵn sàng reprocess.");

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
