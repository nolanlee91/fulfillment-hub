/**
 * Phase C-2: Init pull tất cả file APT từ Canada Post sFTP về DB.
 *
 * Chạy local 1 lần để khởi tạo lịch sử (~576 file). Sau đó cron production
 * sẽ pull file mới (1 file mỗi 15 phút).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/init-pull-apt.ts                # full pull
 *   npx tsx --env-file=.env.local scripts/init-pull-apt.ts --limit 2      # test với 2 file đầu
 *   npx tsx --env-file=.env.local scripts/init-pull-apt.ts --dry-run      # list không download
 *
 * Yêu cầu .env.local:
 *   APT_SFTP_HOST=securetransfer.canadapost.ca
 *   APT_SFTP_PORT=22
 *   APT_SFTP_USER=APT_xxxxxxxxx
 *   APT_SFTP_PASSWORD=xxxx
 *   APT_SFTP_FOLDER=/APT  (hoặc APT, hoặc /)
 *   DATABASE_URL=postgresql://...
 *
 * Có thể stop/resume bất cứ lúc nào — script dedup qua tracking_files.filename PK.
 */
import SftpClient from "ssh2-sftp-client";
import { db } from "../lib/db";
import { trackingFiles } from "../lib/db/schema";
import { parseAptFile } from "../lib/carrier-tracking/parser-apt";
import { processAptEvents } from "../lib/carrier-tracking/processor";

interface Args {
  limit: number | null;
  dryRun: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Number(args[i + 1]);
      i++;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }
  return { limit, dryRun };
}

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

async function main() {
  const { limit, dryRun } = parseArgs();

  const host = envOrThrow("APT_SFTP_HOST");
  const port = Number(process.env.APT_SFTP_PORT || "22");
  const user = envOrThrow("APT_SFTP_USER");
  const password = envOrThrow("APT_SFTP_PASSWORD");
  const folder = process.env.APT_SFTP_FOLDER || "/APT";

  console.log(`🔌 Connecting to ${host}:${port} as ${user}...`);

  const sftp = new SftpClient();
  await sftp.connect({
    host,
    port,
    username: user,
    password,
    readyTimeout: 30_000,
  });

  console.log(`✓ Connected. Listing ${folder}...`);

  const list = await sftp.list(folder);
  // Lọc file thật (không phải directory), sort cũ → mới theo modify time
  const files = list
    .filter((f) => f.type === "-")
    .sort((a, b) => a.modifyTime - b.modifyTime);

  console.log(`✓ Found ${files.length} files trên SFTP`);
  if (files.length === 0) {
    await sftp.end();
    console.log("Không có file để xử lý.");
    return;
  }

  // Query tracking_files để biết file nào đã xử lý
  const processed = await db.select({ filename: trackingFiles.filename }).from(trackingFiles);
  const processedSet = new Set(processed.map((p) => p.filename));

  const pending = files.filter((f) => !processedSet.has(f.name));
  console.log(`✓ ${pending.length} file CHƯA xử lý (${files.length - pending.length} đã có trong DB)`);

  const toProcess = limit !== null ? pending.slice(0, limit) : pending;
  console.log(
    `→ Sẽ xử lý ${toProcess.length} file${limit !== null ? ` (giới hạn --limit ${limit})` : ""}${dryRun ? " [DRY RUN]" : ""}`,
  );

  if (toProcess.length === 0) {
    await sftp.end();
    return;
  }

  const startedAll = Date.now();
  let successCount = 0;
  let errorCount = 0;
  const totals = { events: 0, trackings: 0, matched: 0, updated: 0, unmatched: 0 };

  for (let i = 0; i < toProcess.length; i++) {
    const f = toProcess[i];
    const remotePath = `${folder.replace(/\/$/, "")}/${f.name}`;
    const tag = `[${i + 1}/${toProcess.length}]`;

    try {
      if (dryRun) {
        console.log(`${tag} ${f.name} (${f.size} bytes, ${new Date(f.modifyTime).toISOString()}) — skip [dry-run]`);
        continue;
      }

      const startedFile = Date.now();
      const buffer = (await sftp.get(remotePath)) as Buffer;
      const events = parseAptFile(buffer);

      if (events.length === 0) {
        console.log(`${tag} ${f.name} — 0 event hợp lệ, skip insert`);
        // Vẫn insert tracking_files để dedup lần sau
        await db
          .insert(trackingFiles)
          .values({ filename: f.name, source: "APT", totalRows: 0, totalUpdated: 0 })
          .onConflictDoNothing();
        successCount++;
        continue;
      }

      const result = await processAptEvents(events);

      await db
        .insert(trackingFiles)
        .values({
          filename: f.name,
          source: "APT",
          totalRows: result.totalEventsInFile,
          totalUpdated: result.totalUpdated,
        })
        .onConflictDoNothing();

      totals.events += result.totalEventsInFile;
      totals.trackings += result.totalTrackings;
      totals.matched += result.totalMatched;
      totals.updated += result.totalUpdated;
      totals.unmatched += result.totalUnmatched;

      const ms = Date.now() - startedFile;
      console.log(
        `${tag} ${f.name} — ${result.totalEventsInFile} events, match ${result.totalMatched}/${result.totalTrackings}, updated ${result.totalUpdated} (${ms}ms)`,
      );
      successCount++;
    } catch (err) {
      errorCount++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} ${f.name} — ERROR: ${msg}`);
    }
  }

  await sftp.end();

  const totalMs = Date.now() - startedAll;
  console.log("\n========================================");
  console.log(`Hoàn thành: ${successCount} success, ${errorCount} error`);
  console.log(`Tổng: ${totals.events} events, ${totals.matched} match, ${totals.updated} đơn cập nhật`);
  console.log(`Unmatched (tracking không có trong DB): ${totals.unmatched}`);
  console.log(`Thời gian: ${(totalMs / 1000).toFixed(1)}s`);
  console.log("========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Script failed:", err);
    process.exit(1);
  });
