/**
 * Parser cho file APT (Advanced Parcel Tracking) — pipe-delimited, 63 fields.
 *
 * Mỗi row = 1 sự kiện scan của 1 đơn. Cùng 1 tracking có thể xuất hiện nhiều lần
 * trong cùng file (nhiều event) hoặc rải rác qua nhiều file (event mới theo thời gian).
 *
 * File encoding: Windows-1252 / ISO-8859-1 (chứa ký tự Pháp: é, è, ï…). Đọc bằng latin1.
 */

export interface AptEvent {
  trackingNumber: string; // F1 — PIN
  orderRef: string; // F16 — ref #1 (orderId tham chiếu manifest)
  eventCode: string; // F12
  eventAt: Date; // F13 + F14 + F15 → UTC Date
  descriptionEn: string; // F24 — message tiếng Anh
  returnFlag: string; // F40 — A/B/R/blank
  manifestNumber: string; // F18
}

// Offset cố định (giờ trừ UTC). Bỏ qua DST cho gọn — lệch tối đa ~1h khi hiển thị,
// chấp nhận được vì timestamp này chỉ để display, không dùng để tính toán nghiệp vụ.
const TZ_OFFSET_HOURS: Record<string, number> = {
  EST: 5,
  EDT: 4,
  CST: 6,
  CDT: 5,
  MST: 7,
  MDT: 6,
  PST: 8,
  PDT: 7,
  AST: 4,
  ADT: 3,
  NST: 3.5,
  NDT: 2.5,
  UTC: 0,
  GMT: 0,
};

function parseAptDate(
  dateStr: string,
  timeStr: string,
  tz: string,
): Date | null {
  if (!/^\d{8}$/.test(dateStr) || dateStr === "00000000") return null;
  const yyyy = Number(dateStr.slice(0, 4));
  const mm = Number(dateStr.slice(4, 6)) - 1;
  const dd = Number(dateStr.slice(6, 8));

  let hh = 0;
  let min = 0;
  let ss = 0;
  if (timeStr && /^\d+$/.test(timeStr)) {
    const t = timeStr.padStart(6, "0");
    hh = Number(t.slice(0, 2));
    min = Number(t.slice(2, 4));
    ss = Number(t.slice(4, 6));
  }

  const offset = TZ_OFFSET_HOURS[tz.toUpperCase()] ?? 0;
  // Local time + offset = UTC
  return new Date(Date.UTC(yyyy, mm, dd, hh + offset, min, ss));
}

export function parseAptFile(buffer: Buffer): AptEvent[] {
  const text = buffer.toString("latin1");
  const events: AptEvent[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const f = line.split("|");
    if (f.length < 24) continue; // dòng không đủ field, skip

    const trackingNumber = (f[0] || "").trim();
    const eventCode = (f[11] || "").trim();
    const eventDate = (f[12] || "").trim();
    const eventTime = (f[13] || "").trim();
    const eventTz = (f[14] || "").trim();
    const orderRef = (f[15] || "").trim();
    const manifestNumber = (f[17] || "").trim();
    const descriptionEn = (f[23] || "").trim();
    const returnFlag = f.length > 40 ? (f[40] || "").trim() : "";

    if (!trackingNumber || !eventCode) continue;

    const eventAt = parseAptDate(eventDate, eventTime, eventTz);
    if (!eventAt) continue;

    events.push({
      trackingNumber,
      orderRef,
      eventCode,
      eventAt,
      descriptionEn,
      returnFlag,
      manifestNumber,
    });
  }

  return events;
}
