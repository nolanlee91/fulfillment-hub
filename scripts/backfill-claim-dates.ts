/**
 * Backfill ngày cam kết giao (claim giao trễ) từ các file APT còn trên SFTP.
 *
 * SFTP chỉ giữ file khoảng 2 tuần → đây là TẤT CẢ những gì cứu được cho đơn cũ.
 * Đơn cũ hơn khoảng đó vĩnh viễn không có ngày cam kết (file đã bị xoá).
 *
 * KHÁC với cron pull-apt: script này CHỈ điền 4 cột claim, KHÔNG đụng tới
 * status / delivered_at / attention — tránh việc chạy lại file cũ làm rối trạng
 * thái đơn đang đúng.
 *
 * Idempotent: guaranteed_delivery_date đã có thì giữ nguyên, không ghi đè.
 *
 * Chạy: npx tsx --env-file=.env.local scripts/backfill-claim-dates.ts
 */
import SftpClient from "ssh2-sftp-client";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { parseAptFile } from "@/lib/carrier-tracking/parser-apt";

interface EddPoint {
  at: number; // eventAt.getTime()
  edd: string; // "YYYY-MM-DD"
}

function toIsoDate(yyyymmdd: string): string | null {
  if (!/^20\d{6}$/.test(yyyymmdd)) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

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
    .sort((a, b) => (a.modifyTime || 0) - (b.modifyTime || 0)); // CŨ → MỚI

  console.log(`Tìm thấy ${files.length} file trên SFTP`);
  console.log(
    `Khoảng thời gian: ${new Date(files[0]?.modifyTime || 0).toISOString().slice(0, 10)}` +
      ` → ${new Date(files[files.length - 1]?.modifyTime || 0).toISOString().slice(0, 10)}\n`,
  );

  // tracking → chuỗi EDD theo thời gian + loại dịch vụ
  const points = new Map<string, EddPoint[]>();
  const service = new Map<string, string>();
  let totalEvents = 0;

  for (let i = 0; i < files.length; i++) {
    const buf = (await sftp.get(`${folder}/${files[i].name}`)) as Buffer;
    for (const ev of parseAptFile(buf)) {
      totalEvents++;
      if (ev.serviceType) service.set(ev.trackingNumber, ev.serviceType);
      const iso = toIsoDate(ev.expectedDeliveryDate);
      if (!iso) continue;
      if (!points.has(ev.trackingNumber)) points.set(ev.trackingNumber, []);
      points.get(ev.trackingNumber)!.push({ at: ev.eventAt.getTime(), edd: iso });
    }
    if ((i + 1) % 50 === 0) console.log(`  ... đọc ${i + 1}/${files.length} file`);
  }
  await sftp.end();

  console.log(`\nĐọc xong: ${totalEvents} event, ${points.size} mã vận đơn có ngày cam kết\n`);

  // Gom theo tracking: ngày đầu tiên (theo thời gian event), ngày cuối, số lần dời
  const summary = new Map<
    string,
    { first: string; last: string; changes: number; service: string | null }
  >();
  for (const [tn, list] of points) {
    list.sort((a, b) => a.at - b.at);
    let changes = 0;
    for (let i = 1; i < list.length; i++) if (list[i].edd !== list[i - 1].edd) changes++;
    summary.set(tn, {
      first: list[0].edd,
      last: list[list.length - 1].edd,
      changes,
      service: service.get(tn) ?? null,
    });
  }

  // Chỉ động tới đơn có thật trong app
  const tns = [...summary.keys()];
  const found: Array<{
    uniqueKey: string;
    trackingNumber: string | null;
    guaranteedDeliveryDate: string | null;
  }> = [];
  for (let i = 0; i < tns.length; i += 500) {
    const chunk = tns.slice(i, i + 500);
    const rows = await db
      .select({
        uniqueKey: orders.uniqueKey,
        trackingNumber: orders.trackingNumber,
        guaranteedDeliveryDate: orders.guaranteedDeliveryDate,
      })
      .from(orders)
      .where(inArray(orders.trackingNumber, chunk));
    found.push(...rows);
  }

  console.log(`Khớp với đơn trong app: ${found.length}/${tns.length}\n`);

  let filled = 0;
  let skippedHasDate = 0;
  for (const ord of found) {
    const s = summary.get(ord.trackingNumber!);
    if (!s) continue;

    const update: Record<string, unknown> = {
      serviceType: s.service,
      eddCurrent: s.last,
      eddChangeCount: s.changes,
      updatedAt: new Date(),
    };

    if (ord.guaranteedDeliveryDate) {
      skippedHasDate++; // đã có mốc → giữ nguyên, không bao giờ ghi đè
    } else {
      update.guaranteedDeliveryDate = s.first;
      filled++;
    }

    await db.update(orders).set(update).where(eq(orders.uniqueKey, ord.uniqueKey));
  }

  console.log(`✓ Điền ngày cam kết mới: ${filled} đơn`);
  console.log(`  Giữ nguyên (đã có sẵn): ${skippedHasDate} đơn`);

  const stillEmpty = await db
    .select({ uniqueKey: orders.uniqueKey })
    .from(orders)
    .where(and(isNull(orders.guaranteedDeliveryDate), eq(orders.status, "DELIVERED")));
  console.log(`  Đơn DELIVERED vẫn chưa có ngày cam kết (file đã bị xoá khỏi SFTP): ${stillEmpty.length}`);

  process.exit(0);
}

main().catch((e) => {
  console.error("ERR:", e?.message || e);
  process.exit(1);
});
