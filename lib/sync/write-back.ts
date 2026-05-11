import { db } from "@/lib/db";
import { orders, sourceSheets, boxes, products } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { readSheet, writeRange } from "@/lib/sheets/client";

const LB_TO_KG = 0.453592;

/** Header names user phải thêm vào sheet (case-insensitive). */
const HEADER_TRACKING_NUMBER = "tracking number";
const HEADER_TRACKING_URL = "tracking url";
const HEADER_SHIP_DATE = "ngày đóng hàng";
const HEADER_CARRIER = "đơn vị vận chuyển";
const HEADER_WEIGHT = "cân nặng (kg)";
const HEADER_ORDER_ID = "mã đơn hàng";

const REQUIRED_HEADERS = [
  HEADER_TRACKING_NUMBER,
  HEADER_TRACKING_URL,
  HEADER_SHIP_DATE,
  HEADER_CARRIER,
  HEADER_WEIGHT,
] as const;

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
export async function syncTrackingToSheet(uniqueKey: string): Promise<SyncResult> {
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
    const data = await readSheet(cfg.spreadsheetId, cfg.sheetName);
    if (data.length < 2) continue;

    const header = data[0].map(normalizeHeader);
    const findCol = (name: string) => header.findIndex((h) => h === name);

    const colOrderId = findCol(HEADER_ORDER_ID);
    const colTracking = findCol(HEADER_TRACKING_NUMBER);
    const colTrackingUrl = findCol(HEADER_TRACKING_URL);
    const colShipDate = findCol(HEADER_SHIP_DATE);
    const colCarrier = findCol(HEADER_CARRIER);
    const colWeight = findCol(HEADER_WEIGHT);

    // Skip nếu thiếu cột (user phải thêm trước)
    const missing: string[] = [];
    if (colOrderId === -1) missing.push(HEADER_ORDER_ID);
    if (colTracking === -1) missing.push(HEADER_TRACKING_NUMBER);
    if (colTrackingUrl === -1) missing.push(HEADER_TRACKING_URL);
    if (colShipDate === -1) missing.push(HEADER_SHIP_DATE);
    if (colCarrier === -1) missing.push(HEADER_CARRIER);
    if (colWeight === -1) missing.push(HEADER_WEIGHT);
    if (missing.length > 0) {
      return {
        success: false,
        skipped: true,
        uniqueKey,
        reason: `Sheet ${cfg.sheetName} thiếu cột: ${missing.join(", ")}`,
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

    // Build write payload — 1 update per column (vì các cột không liền kề nhau)
    const rowNum = rowIndex + 1; // A1 1-indexed
    const updates: Array<{ range: string; value: string | number }> = [
      { range: `${colLetter(colTracking)}${rowNum}`, value: order.trackingNumber },
      { range: `${colLetter(colTrackingUrl)}${rowNum}`, value: order.trackingUrl ?? "" },
      { range: `${colLetter(colShipDate)}${rowNum}`, value: fmtShipDate(order.shipDate) },
      { range: `${colLetter(colCarrier)}${rowNum}`, value: order.shippingCarrier ?? "" },
      { range: `${colLetter(colWeight)}${rowNum}`, value: weightKg },
    ];

    for (const u of updates) {
      await writeRange(cfg.spreadsheetId, `'${cfg.sheetName}'!${u.range}`, [[u.value]]);
    }

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
