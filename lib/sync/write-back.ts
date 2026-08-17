import { db } from "@/lib/db";
import { orders, sourceSheets, boxes, products } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { readSheet, writeBatch } from "@/lib/sheets/client";

const LB_TO_KG = 0.453592;

/** Header names user phải thêm vào sheet (case-insensitive, chấp nhận alias). */
const HEADER_TRACKING_NUMBER = ["tracking number"];
const HEADER_TRACKING_URL = ["tracking url"];
const HEADER_SHIP_DATE = ["ngày đóng hàng"];
const HEADER_CARRIER = ["đơn vị vận chuyển"];
const HEADER_WEIGHT = ["cân nặng (kg)", "cân nặng"];
const HEADER_ORDER_ID = ["mã đơn hàng"];

const REQUIRED_HEADERS = {
  trackingNumber: HEADER_TRACKING_NUMBER,
  trackingUrl: HEADER_TRACKING_URL,
  shipDate: HEADER_SHIP_DATE,
  carrier: HEADER_CARRIER,
  weight: HEADER_WEIGHT,
} as const;

export interface BatchSyncResult {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  skipReasons: Record<string, number>;
  failSamples: string[];
}

function normalizeHeader(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function colLetter(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function fmtShipDate(d: Date | null): string {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${mon}/${d.getFullYear()}`;
}

interface HeaderInfo {
  colOrderId: number;
  colTracking: number;
  colTrackingUrl: number;
  colShipDate: number;
  colCarrier: number;
  colWeight: number;
  missingReason: string | null;
}

function detectHeaders(headerRow: string[], sheetName: string): HeaderInfo {
  const header = headerRow.map(normalizeHeader);
  /**
   * Tìm column. Match theo 2 chiến lược:
   *   1. Exact match với 1 alias trong list
   *   2. Prefix match (header.startsWith(alias)) — chấp nhận suffix khác
   */
  const findCol = (aliases: readonly string[]) => {
    const exact = header.findIndex((h) => aliases.includes(h));
    if (exact !== -1) return exact;
    return header.findIndex((h) => aliases.some((a) => h.startsWith(a)));
  };
  const colOrderId = findCol(HEADER_ORDER_ID);
  const colTracking = findCol(HEADER_TRACKING_NUMBER);
  const colTrackingUrl = findCol(HEADER_TRACKING_URL);
  const colShipDate = findCol(HEADER_SHIP_DATE);
  const colCarrier = findCol(HEADER_CARRIER);
  const colWeight = findCol(HEADER_WEIGHT);
  const missing: string[] = [];
  if (colOrderId === -1) missing.push(HEADER_ORDER_ID[0]);
  if (colTracking === -1) missing.push(HEADER_TRACKING_NUMBER[0]);
  if (colTrackingUrl === -1) missing.push(HEADER_TRACKING_URL[0]);
  if (colShipDate === -1) missing.push(HEADER_SHIP_DATE[0]);
  if (colCarrier === -1) missing.push(HEADER_CARRIER[0]);
  if (colWeight === -1) missing.push(HEADER_WEIGHT[0]);
  return {
    colOrderId,
    colTracking,
    colTrackingUrl,
    colShipDate,
    colCarrier,
    colWeight,
    missingReason: missing.length
      ? `Sheet ${sheetName} thiếu cột: ${missing.join(", ")} | Headers thực tế: [${header.filter(Boolean).join(" | ")}]`
      : null,
  };
}

/**
 * Đẩy tracking info của 1 BATCH đơn về các sheet nguồn.
 *
 * Tối ưu: gom toàn bộ cell updates của cùng 1 spreadsheet vào duy nhất 1
 * `writeBatch` API call (thay vì 1 call/đơn). 100 đơn cùng 1 sheet = 1 API call
 * ~1-2s thay vì 100 call ~60-100s. Tránh được timeout của Next.js handler
 * (maxDuration=60) và giảm risk quota Google Sheets.
 *
 * Logic per-order:
 *  - Tìm source_sheets cho cặp (customerId, productId)
 *  - Đọc sheet (cache theo spreadsheet+tab → 1 read/sheet)
 *  - Validate headers (cache theo sheet)
 *  - Tìm row khớp orderId → build 5 cell updates → gom vào bucket spreadsheet
 *
 * Sau khi plan xong tất cả đơn:
 *  - Flush từng spreadsheet bằng 1 batchUpdate
 *  - Trên success: UPDATE orders.syncedToSheetAt cho tất cả uniqueKey trong group
 *
 * Lưu ý: nếu writeBatch của 1 spreadsheet fail (vd: protected range, permission),
 * TẤT CẢ đơn của spreadsheet đó đều bị tính failed — đây là tradeoff vs.
 * tốc độ. Trước đây fail per-order nhưng vẫn ra cùng kết quả vì lý do fail
 * thường là sheet-wide.
 */
export async function syncTrackingBatch(
  uniqueKeys: string[],
): Promise<BatchSyncResult> {
  const result: BatchSyncResult = {
    total: uniqueKeys.length,
    synced: 0,
    skipped: 0,
    failed: 0,
    skipReasons: {},
    failSamples: [],
  };
  if (uniqueKeys.length === 0) return result;

  const addSkip = (reason: string) => {
    result.skipped += 1;
    result.skipReasons[reason] = (result.skipReasons[reason] || 0) + 1;
  };
  const addFail = (uk: string, reason: string) => {
    result.failed += 1;
    if (result.failSamples.length < 5) result.failSamples.push(`${uk}: ${reason}`);
  };

  // 1. Fetch all orders + box + product trong 1 query
  const ordersData = await db
    .select({
      uniqueKey: orders.uniqueKey,
      orderId: orders.orderId,
      customerId: orders.customerId,
      productId: orders.productId,
      trackingNumber: orders.trackingNumber,
      trackingUrl: orders.trackingUrl,
      shippingCarrier: orders.shippingCarrier,
      shipDate: orders.shipDate,
      quantity: orders.quantity,
      boxCode: orders.boxCode,
      emptyWeightLb: boxes.emptyWeightLb,
      unitWeightLb: products.unitWeightLb,
    })
    .from(orders)
    .leftJoin(boxes, eq(orders.boxCode, boxes.code))
    .leftJoin(products, eq(orders.productId, products.id))
    .where(inArray(orders.uniqueKey, uniqueKeys));

  const ordersByKey = new Map<string, (typeof ordersData)[number]>();
  for (const o of ordersData) ordersByKey.set(o.uniqueKey, o);

  // 2. Filter các đơn có tracking
  const ordersWithTracking: (typeof ordersData)[number][] = [];
  for (const uk of uniqueKeys) {
    const o = ordersByKey.get(uk);
    if (!o) {
      addFail(uk, "Order not found");
      continue;
    }
    if (!o.trackingNumber) {
      addSkip("Chưa có tracking number");
      continue;
    }
    ordersWithTracking.push(o);
  }
  if (ordersWithTracking.length === 0) return result;

  // 3. Fetch all source_sheets liên quan trong 1 query
  const customerIds = [...new Set(ordersWithTracking.map((o) => o.customerId))];
  const productIds = [...new Set(ordersWithTracking.map((o) => o.productId))];
  const sheetCfgs = await db
    .select({
      customerId: sourceSheets.customerId,
      productId: sourceSheets.productId,
      spreadsheetId: sourceSheets.spreadsheetId,
      sheetName: sourceSheets.sheetName,
    })
    .from(sourceSheets)
    .where(
      and(
        inArray(sourceSheets.customerId, customerIds),
        inArray(sourceSheets.productId, productIds),
        eq(sourceSheets.active, true),
      ),
    );
  const cfgByPair = new Map<string, typeof sheetCfgs>();
  for (const cfg of sheetCfgs) {
    const k = `${cfg.customerId}|${cfg.productId}`;
    const list = cfgByPair.get(k) ?? [];
    list.push(cfg);
    cfgByPair.set(k, list);
  }

  // 4. Plan updates — group by spreadsheet
  type PlannedUpdate = { range: string; value: string | number };
  const updatesBySpreadsheet = new Map<string, PlannedUpdate[]>();
  const keysBySpreadsheet = new Map<string, string[]>();
  const sheetReadCache = new Map<string, string[][]>();
  const headerCache = new Map<string, HeaderInfo>();

  for (const o of ordersWithTracking) {
    const cfgs = cfgByPair.get(`${o.customerId}|${o.productId}`) ?? [];
    if (cfgs.length === 0) {
      addSkip(`Không tìm thấy source_sheet cho ${o.customerId}/${o.productId}`);
      continue;
    }

    let matched = false;
    let lastSkipReason: string | null = null;

    for (const cfg of cfgs) {
      const cacheKey = `${cfg.spreadsheetId}|${cfg.sheetName}`;
      let data = sheetReadCache.get(cacheKey);
      if (!data) {
        try {
          data = await readSheet(cfg.spreadsheetId, cfg.sheetName);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          addFail(o.uniqueKey, `read ${cfg.sheetName}: ${msg}`);
          matched = true; // không thử sheet khác — counted as failed
          break;
        }
        sheetReadCache.set(cacheKey, data);
      }
      if (data.length < 2) {
        lastSkipReason = `Sheet ${cfg.sheetName} không có data`;
        continue;
      }

      let hdr = headerCache.get(cacheKey);
      if (!hdr) {
        hdr = detectHeaders(data[0], cfg.sheetName);
        headerCache.set(cacheKey, hdr);
      }
      if (hdr.missingReason) {
        lastSkipReason = hdr.missingReason;
        continue;
      }

      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][hdr.colOrderId] || "").trim() === o.orderId) {
          rowIndex = i;
          break;
        }
      }
      if (rowIndex === -1) {
        lastSkipReason = "Không tìm thấy row khớp orderId";
        continue;
      }

      const lb =
        Number(o.emptyWeightLb ?? 0) + o.quantity * Number(o.unitWeightLb ?? 0);
      const weightKg = lb > 0 ? Number((lb * LB_TO_KG).toFixed(2)) : "";
      const rowNum = rowIndex + 1;
      const sheetRef = `'${cfg.sheetName}'`;
      // Prefix tracking number bằng `'` để Sheets ép kiểu text — tránh 16
      // chữ số bị parse thành scientific notation (mất precision).
      const planned: PlannedUpdate[] = [
        { range: `${sheetRef}!${colLetter(hdr.colTracking)}${rowNum}`, value: `'${o.trackingNumber}` },
        {
          range: `${sheetRef}!${colLetter(hdr.colTrackingUrl)}${rowNum}`,
          // EST/COD file không có cột URL → DB null → fallback build Canada Post URL.
          value:
            o.trackingUrl ||
            `https://www.canadapost.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(o.trackingNumber!)}`,
        },
        { range: `${sheetRef}!${colLetter(hdr.colShipDate)}${rowNum}`, value: fmtShipDate(o.shipDate) },
        { range: `${sheetRef}!${colLetter(hdr.colCarrier)}${rowNum}`, value: o.shippingCarrier ?? "" },
        { range: `${sheetRef}!${colLetter(hdr.colWeight)}${rowNum}`, value: weightKg },
      ];
      const bucket = updatesBySpreadsheet.get(cfg.spreadsheetId) ?? [];
      bucket.push(...planned);
      updatesBySpreadsheet.set(cfg.spreadsheetId, bucket);
      const keys = keysBySpreadsheet.get(cfg.spreadsheetId) ?? [];
      keys.push(o.uniqueKey);
      keysBySpreadsheet.set(cfg.spreadsheetId, keys);
      matched = true;
      break;
    }

    if (!matched) {
      addSkip(
        lastSkipReason ??
          "Không tìm thấy row khớp orderId trong các sheet ứng viên",
      );
    }
  }

  // 5. Flush từng spreadsheet bằng 1 batchUpdate
  for (const [spreadsheetId, updates] of updatesBySpreadsheet) {
    const keys = keysBySpreadsheet.get(spreadsheetId) ?? [];
    try {
      await writeBatch(spreadsheetId, updates);
      if (keys.length > 0) {
        await db
          .update(orders)
          .set({ syncedToSheetAt: new Date() })
          .where(inArray(orders.uniqueKey, keys));
      }
      result.synced += keys.length;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const uk of keys) addFail(uk, msg);
    }
  }

  return result;
}

/**
 * Ghi 1 ghi chú (vd "Hủy trước khi pick up") vào cột Tracking URL của 1 đơn trên
 * sheet nguồn — dùng khi huỷ đơn trước lúc carrier pickup. Chỉ đụng ô Tracking URL,
 * giữ nguyên các cột khác. Trả về {ok, reason}.
 */
export async function writeSheetTrackingUrlNote(
  uniqueKey: string,
  noteText: string,
): Promise<{ ok: boolean; reason?: string }> {
  const [o] = await db
    .select({
      orderId: orders.orderId,
      customerId: orders.customerId,
      productId: orders.productId,
    })
    .from(orders)
    .where(eq(orders.uniqueKey, uniqueKey));
  if (!o) return { ok: false, reason: "Order not found" };

  const cfgs = await db
    .select({
      spreadsheetId: sourceSheets.spreadsheetId,
      sheetName: sourceSheets.sheetName,
    })
    .from(sourceSheets)
    .where(
      and(
        eq(sourceSheets.customerId, o.customerId),
        eq(sourceSheets.productId, o.productId),
        eq(sourceSheets.active, true),
      ),
    );
  if (cfgs.length === 0) return { ok: false, reason: "Không có source_sheet" };

  let lastReason = "Không tìm thấy row";
  for (const cfg of cfgs) {
    let data: string[][];
    try {
      data = await readSheet(cfg.spreadsheetId, cfg.sheetName);
    } catch (e) {
      lastReason = `read ${cfg.sheetName}: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    if (data.length < 2) continue;
    const hdr = detectHeaders(data[0], cfg.sheetName);
    if (hdr.missingReason) {
      lastReason = hdr.missingReason;
      continue;
    }
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][hdr.colOrderId] || "").trim() === o.orderId) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) continue;

    const rowNum = rowIndex + 1;
    try {
      await writeBatch(cfg.spreadsheetId, [
        {
          range: `'${cfg.sheetName}'!${colLetter(hdr.colTrackingUrl)}${rowNum}`,
          value: noteText,
        },
      ]);
      return { ok: true };
    } catch (e) {
      lastReason = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, reason: lastReason };
}

export { REQUIRED_HEADERS };
