import { db } from "@/lib/db";
import { orders, sourceSheets, boxes, products } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
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

export interface SyncResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  uniqueKey: string;
}

function normalizeHeader(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert column index (0-based) → A1 column letter. */
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

/**
 * Đẩy tracking info của 1 đơn về sheet nguồn.
 *
 * Skip nếu:
 *  - Đơn chưa có trackingNumber
 *  - Không tìm thấy source_sheets cho cặp (customerId, productId)
 *  - Sheet không có đủ 5 cột header cần thiết
 *  - Sheet không có row khớp orderId
 *
 * Set orders.syncedToSheetAt = NOW khi sync thành công.
 */
/**
 * Cache key: `${spreadsheetId}|${sheetName}`. Value: data 2D array.
 * Caller share Map giữa nhiều syncTrackingToSheet calls để tránh re-read
 * cùng 1 sheet (Google Sheets API limit 60 reads/phút).
 */
export type SheetCache = Map<string, string[][]>;

export async function syncTrackingToSheet(
  uniqueKey: string,
  sheetCache?: SheetCache,
): Promise<SyncResult> {
  // 1. Lấy order + box + product để tính weight
  const rows = await db
    .select({
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
    .where(eq(orders.uniqueKey, uniqueKey))
    .limit(1);
  const order = rows[0];

  if (!order) {
    return { success: false, uniqueKey, reason: "Order not found" };
  }
  if (!order.trackingNumber) {
    return {
      success: false,
      skipped: true,
      uniqueKey,
      reason: "Chưa có tracking number",
    };
  }

  // 2. Tìm source_sheet
  const sheetsCfg = await db
    .select({
      spreadsheetId: sourceSheets.spreadsheetId,
      sheetName: sourceSheets.sheetName,
    })
    .from(sourceSheets)
    .where(
      and(
        eq(sourceSheets.customerId, order.customerId),
        eq(sourceSheets.productId, order.productId),
        eq(sourceSheets.active, true),
      ),
    );

  if (sheetsCfg.length === 0) {
    return {
      success: false,
      skipped: true,
      uniqueKey,
      reason: `Không tìm thấy source_sheet cho ${order.customerId}/${order.productId}`,
    };
  }

  // Compute weight kg
  const lb =
    Number(order.emptyWeightLb ?? 0) + order.quantity * Number(order.unitWeightLb ?? 0);
  const weightKg = lb > 0 ? Number((lb * LB_TO_KG).toFixed(2)) : "";

  // 3. Try từng source_sheet (thường chỉ 1)
  for (const cfg of sheetsCfg) {
    const cacheKey = `${cfg.spreadsheetId}|${cfg.sheetName}`;
    let data = sheetCache?.get(cacheKey);
    if (!data) {
      data = await readSheet(cfg.spreadsheetId, cfg.sheetName);
      sheetCache?.set(cacheKey, data);
    }
    if (data.length < 2) continue;

    const header = data[0].map(normalizeHeader);
    /**
     * Tìm column. Match theo 2 chiến lược:
     *   1. Exact match với 1 alias trong list
     *   2. Prefix match (header.startsWith(alias)) — chấp nhận suffix khác
     *      vd "cân nặng" alias sẽ match "cân nặng (kg)", "cân nặng (g)", v.v.
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

    // Skip nếu thiếu cột (user phải thêm trước)
    const missing: string[] = [];
    if (colOrderId === -1) missing.push(HEADER_ORDER_ID[0]);
    if (colTracking === -1) missing.push(HEADER_TRACKING_NUMBER[0]);
    if (colTrackingUrl === -1) missing.push(HEADER_TRACKING_URL[0]);
    if (colShipDate === -1) missing.push(HEADER_SHIP_DATE[0]);
    if (colCarrier === -1) missing.push(HEADER_CARRIER[0]);
    if (colWeight === -1) missing.push(HEADER_WEIGHT[0]);
    if (missing.length > 0) {
      return {
        success: false,
        skipped: true,
        uniqueKey,
        reason: `Sheet ${cfg.sheetName} thiếu cột: ${missing.join(", ")} | Headers thực tế: [${header.filter(Boolean).join(" | ")}]`,
      };
    }

    // Tìm row khớp orderId
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][colOrderId] || "").trim() === order.orderId) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex === -1) {
      // Có thể đơn ở sheet khác (cùng customer, khác product)
      continue;
    }

    // Build write payload — 5 cell trên cùng row, gom 1 batchUpdate call
    const rowNum = rowIndex + 1; // A1 1-indexed
    const sheetRef = `'${cfg.sheetName}'`;
    const updates = [
      { range: `${sheetRef}!${colLetter(colTracking)}${rowNum}`, value: order.trackingNumber },
      { range: `${sheetRef}!${colLetter(colTrackingUrl)}${rowNum}`, value: order.trackingUrl ?? "" },
      { range: `${sheetRef}!${colLetter(colShipDate)}${rowNum}`, value: fmtShipDate(order.shipDate) },
      { range: `${sheetRef}!${colLetter(colCarrier)}${rowNum}`, value: order.shippingCarrier ?? "" },
      { range: `${sheetRef}!${colLetter(colWeight)}${rowNum}`, value: weightKg },
    ];

    await writeBatch(cfg.spreadsheetId, updates);

    // Mark synced
    await db
      .update(orders)
      .set({ syncedToSheetAt: new Date() })
      .where(eq(orders.uniqueKey, uniqueKey));

    return { success: true, uniqueKey };
  }

  return {
    success: false,
    skipped: true,
    uniqueKey,
    reason: "Không tìm thấy row khớp orderId trong các sheet ứng viên",
  };
}

/** Re-export header names để UI hiển thị hướng dẫn nếu cần. */
export { REQUIRED_HEADERS };
