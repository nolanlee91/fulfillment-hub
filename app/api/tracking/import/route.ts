import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, batches } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";

export const maxDuration = 60;

interface ParsedTrackingRow {
  orderId: string;
  trackingNumber: string;
  trackingUrl: string;
  shippingCarrier: string;
  shipDate: Date | null;
}

/**
 * Parse Excel file ClickShip → list tracking entries.
 * Tìm các cột: Order Number, Tracking Number, Tracking URL, Shipping Carrier, Ship Date.
 */
async function parseClickshipFile(buffer: ArrayBuffer): Promise<ParsedTrackingRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File không có sheet nào");

  const headerRow = sheet.getRow(1);
  const headerMap: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    const value = String(cell.value || "").trim().toLowerCase();
    headerMap[value] = colNumber;
  });

  const orderCol = headerMap["order number"];
  const trackingCol = headerMap["tracking number"];
  const trackingUrlCol = headerMap["tracking url"];
  const carrierCol = headerMap["shipping carrier"];
  const shipDateCol = headerMap["ship date"];

  if (!orderCol || !trackingCol) {
    throw new Error(
      "File thiếu cột 'Order Number' hoặc 'Tracking Number'. Đây có phải file xuất từ kênh tạo label không?",
    );
  }

  const rows: ParsedTrackingRow[] = [];
  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const orderId = String(row.getCell(orderCol).value || "").trim();
    const tracking = String(row.getCell(trackingCol).value || "").trim();

    if (!orderId || !tracking) continue;

    let shipDate: Date | null = null;
    if (shipDateCol) {
      const v = row.getCell(shipDateCol).value;
      if (v instanceof Date) shipDate = v;
      else if (typeof v === "string" && v.trim()) shipDate = new Date(v);
    }

    rows.push({
      orderId,
      trackingNumber: tracking,
      trackingUrl: trackingUrlCol
        ? String(row.getCell(trackingUrlCol).value || "").trim()
        : "",
      shippingCarrier: carrierCol
        ? String(row.getCell(carrierCol).value || "").trim()
        : "",
      shipDate,
    });
  }

  return rows;
}

/**
 * Parse 1 dòng CSV (handle quoted fields với "" escape).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuote = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ",") {
        fields.push(cur);
        cur = "";
      } else if (c === '"') {
        inQuote = true;
      } else {
        cur += c;
      }
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * Parse file CSV EST trả về → list tracking entries.
 * Filter dòng BEHALF_OF_CUSTOMER_NAME = KDEXPRESS (skip đơn EXT của khách khác).
 * Match CUSTOMER_ORDER_ITEM_ID ↔ orders.orderId, lấy BAR_CODE_ID làm tracking number.
 */
function parseEstFile(buffer: ArrayBuffer): ParsedTrackingRow[] {
  // BOM strip
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const behalfCol = idx("BEHALF_OF_CUSTOMER_NAME");
  const barcodeCol = idx("BAR_CODE_ID");
  const orderItemCol = idx("CUSTOMER_ORDER_ITEM_ID");
  const mailingDateCol = idx("MAILING_DATE");

  if (behalfCol < 0 || barcodeCol < 0 || orderItemCol < 0) {
    throw new Error(
      "File EST thiếu cột BEHALF_OF_CUSTOMER_NAME / BAR_CODE_ID / CUSTOMER_ORDER_ITEM_ID",
    );
  }

  const rows: ParsedTrackingRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const behalf = (fields[behalfCol] || "").trim().toUpperCase();
    if (behalf !== "KDEXPRESS") continue;

    const orderId = (fields[orderItemCol] || "").trim();
    const tracking = (fields[barcodeCol] || "").trim();
    if (!orderId || !tracking) continue;

    let shipDate: Date | null = null;
    if (mailingDateCol >= 0) {
      const raw = (fields[mailingDateCol] || "").trim();
      const m = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (m) {
        shipDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
    }

    rows.push({
      orderId,
      trackingNumber: tracking,
      trackingUrl: "",
      shippingCarrier: "Canada Post",
      shipDate,
    });
  }

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const batchId = formData.get("batchId") as string | null;

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: "Chưa upload file" },
        { status: 400 },
      );
    }

    if (!batchId) {
      return NextResponse.json(
        { success: false, error: "Chưa chọn batch để đối soát" },
        { status: 400 },
      );
    }

    // 1. Load batch để biết platform
    const [batch] = await db
      .select({ id: batches.id, platform: batches.platform })
      .from(batches)
      .where(eq(batches.id, batchId));

    if (!batch) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy batch ${batchId}` },
        { status: 404 },
      );
    }

    const platform = batch.platform || "CLICKSHIP";

    // 2. Parse file theo platform
    const buffer = await file.arrayBuffer();
    const trackingRows =
      platform === "EST"
        ? parseEstFile(buffer)
        : await parseClickshipFile(buffer);

    if (trackingRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            platform === "EST"
              ? "File EST không có dòng nào của KDEXPRESS"
              : "File không có dòng tracking nào",
        },
        { status: 400 },
      );
    }

    // 3. Lấy tất cả đơn trong batch
    const ordersInBatch = await db
      .select({
        uniqueKey: orders.uniqueKey,
        orderId: orders.orderId,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.batchId, batchId));

    if (ordersInBatch.length === 0) {
      return NextResponse.json(
        { success: false, error: `Batch ${batchId} không có đơn nào` },
        { status: 404 },
      );
    }

    // Map orderId → uniqueKey (chỉ trong batch này)
    const orderIdToKey: Record<string, string> = {};
    for (const o of ordersInBatch) {
      orderIdToKey[o.orderId] = o.uniqueKey;
    }

    // 3. Tách thành 3 nhóm:
    //   - matched: trong file ClickShip + có trong batch → cập nhật tracking
    //   - notInBatch: trong file ClickShip nhưng không thuộc batch này → bỏ qua
    //   - missingFromFile: trong batch nhưng không có trong file → ClickShip rejected
    const matchedKeys: string[] = [];
    const notInBatch: string[] = [];
    const updates: Array<{
      uniqueKey: string;
      trackingNumber: string;
      trackingUrl: string;
      shippingCarrier: string;
      shipDate: Date | null;
    }> = [];

    for (const t of trackingRows) {
      const uniqueKey = orderIdToKey[t.orderId];
      if (!uniqueKey) {
        notInBatch.push(t.orderId);
        continue;
      }
      matchedKeys.push(uniqueKey);
      updates.push({
        uniqueKey,
        trackingNumber: t.trackingNumber,
        trackingUrl: t.trackingUrl,
        shippingCarrier: t.shippingCarrier,
        shipDate: t.shipDate,
      });
    }

    const matchedSet = new Set(matchedKeys);
    const missingFromFile = ordersInBatch
      .filter((o) => !matchedSet.has(o.uniqueKey))
      .map((o) => o.uniqueKey);

    // 4. Update DB — đơn có tracking → status LABEL_CREATED
    const now = new Date();
    for (const u of updates) {
      await db
        .update(orders)
        .set({
          status: "LABEL_CREATED",
          trackingNumber: u.trackingNumber,
          trackingUrl: u.trackingUrl || null,
          shippingCarrier: u.shippingCarrier || null,
          shipDate: u.shipDate,
          updatedAt: now,
        })
        .where(eq(orders.uniqueKey, u.uniqueKey));
    }

    // 5. Đơn không có tracking → status ERROR + note (chung chung, không lộ nhà cung cấp)
    if (missingFromFile.length > 0) {
      await db
        .update(orders)
        .set({
          status: "ERROR",
          errorNote: "Không tạo được label - cần kiểm tra lại",
          updatedAt: now,
        })
        .where(inArray(orders.uniqueKey, missingFromFile));
    }

    return NextResponse.json({
      success: true,
      batchId,
      totalInFile: trackingRows.length,
      totalInBatch: ordersInBatch.length,
      matched: matchedKeys.length,
      rejected: missingFromFile.length,
      notInBatch: notInBatch.length,
      message: `Đã import: ${matchedKeys.length} đơn có tracking, ${missingFromFile.length} đơn rejected${notInBatch.length > 0 ? `, ${notInBatch.length} đơn không thuộc batch này (bỏ qua)` : ""}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Import tracking error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
