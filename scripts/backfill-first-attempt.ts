/**
 * Backfill orders.first_attempt_date từ các file APT còn trên SFTP.
 *
 * Mốc đo chuẩn giao là LẦN GIAO ĐẦU TIÊN, không phải lúc hàng được nhận. Đơn để
 * giấy báo rồi khách mấy hôm sau mới ra bưu cục lấy thì `delivered_at` ghi ngày
 * khách lấy — đo bằng nó làm 15/37 đơn bị tính trễ oan (đo thật 2026-09-15).
 *
 * Chỉ điền 1 cột, không đụng status/delivered_at. Giữ ngày SỚM NHẤT bắt được.
 *
 * Chạy: npx tsx --env-file=.env.local scripts/backfill-first-attempt.ts
 */
import SftpClient from "ssh2-sftp-client";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { parseAptFile } from "@/lib/carrier-tracking/parser-apt";
import { DELIVERY_ATTEMPT_CODES, DELIVERED_CODES } from "@/lib/carrier-tracking/event-codes";
import { toLocalDateString } from "@/lib/claims";

async function main() {
  const host = process.env.APT_SFTP_HOST;
  const user = process.env.APT_SFTP_USER;
  const password = process.env.APT_SFTP_PASSWORD;
  if (!host || !user || !password) throw new Error("Thiếu env SFTP");

  const folder = process.env.APT_SFTP_FOLDER || "/APT";
  const sftp = new SftpClient();
  await sftp.connect({
    host,
    port: Number(process.env.APT_SFTP_PORT || "22"),
    username: user,
    password,
    readyTimeout: 30_000,
  });

  const files = (await sftp.list(folder))
    .filter((f) => f.type === "-")
    .sort((a, b) => (a.modifyTime || 0) - (b.modifyTime || 0));
  console.log(`Đọc ${files.length} file APT...`);

  const firstAttempt = new Map<string, string>();
  for (let i = 0; i < files.length; i++) {
    const buf = (await sftp.get(`${folder}/${files[i].name}`)) as Buffer;
    for (const ev of parseAptFile(buf)) {
      if (!DELIVERY_ATTEMPT_CODES.has(ev.eventCode) && !DELIVERED_CODES.has(ev.eventCode)) {
        continue;
      }
      const d = toLocalDateString(ev.eventAt);
      const cur = firstAttempt.get(ev.trackingNumber);
      if (!cur || d < cur) firstAttempt.set(ev.trackingNumber, d);
    }
    if ((i + 1) % 100 === 0) console.log(`  ... ${i + 1}/${files.length}`);
  }
  await sftp.end();

  console.log(`\nCó ngày giao đầu tiên cho ${firstAttempt.size} mã vận đơn\n`);

  const tns = [...firstAttempt.keys()];
  const found: Array<{ uniqueKey: string; trackingNumber: string | null; firstAttemptDate: string | null }> = [];
  for (let i = 0; i < tns.length; i += 500) {
    const rows = await db
      .select({
        uniqueKey: orders.uniqueKey,
        trackingNumber: orders.trackingNumber,
        firstAttemptDate: orders.firstAttemptDate,
      })
      .from(orders)
      .where(inArray(orders.trackingNumber, tns.slice(i, i + 500)));
    found.push(...rows);
  }
  console.log(`Khớp với đơn trong app: ${found.length}/${tns.length}`);

  let filled = 0;
  let moved = 0;
  for (const ord of found) {
    const d = firstAttempt.get(ord.trackingNumber!)!;
    if (ord.firstAttemptDate === d) continue;
    // Chỉ ghi khi chưa có, hoặc tìm được ngày SỚM HƠN.
    if (ord.firstAttemptDate && ord.firstAttemptDate <= d) continue;
    if (ord.firstAttemptDate) moved++;
    else filled++;
    await db
      .update(orders)
      .set({ firstAttemptDate: d, updatedAt: new Date() })
      .where(eq(orders.uniqueKey, ord.uniqueKey));
  }

  console.log(`✓ Điền mới: ${filled} đơn | cập nhật về ngày sớm hơn: ${moved} đơn`);

  const missing = await db
    .select({ uniqueKey: orders.uniqueKey })
    .from(orders)
    .where(isNotNull(orders.guaranteedDeliveryDate));
  const withAttempt = await db
    .select({ uniqueKey: orders.uniqueKey })
    .from(orders)
    .where(isNotNull(orders.firstAttemptDate));
  console.log(
    `  Đơn có ngày cam kết: ${missing.length} | trong đó có ngày giao đầu: ${withAttempt.length}`,
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e?.message || e);
  process.exit(1);
});
