import { db } from "../db";
import { sourceSheets, orders, syncLogs } from "../db/schema";
import { eq } from "drizzle-orm";
import { parseSheet } from "./parser";
import type { ParsedOrder } from "./parser";

export interface SyncResult {
  totalAdded: number;
  totalUpdated: number;
  totalErrors: number;
  perSheet: Array<{
    customerId: string;
    productId: string;
    sheetName: string;
    added: number;
    updated: number;
    errors: number;
    warnings: string[];
  }>;
  durationMs: number;
}

/**
 * So sánh data từ sheet với data trong DB.
 * Trả về true nếu có ÍT NHẤT 1 field thay đổi.
 */
function hasChanges(
  parsed: ParsedOrder,
  existing: typeof orders.$inferSelect,
): boolean {
  const fields: Array<[string, string]> = [
    [parsed.name || "", existing.name || ""],
    [parsed.addressLine1 || "", existing.addressLine1 || ""],
    [parsed.addressLine2 || "", existing.addressLine2 || ""],
    [parsed.city || "", existing.city || ""],
    [parsed.province || "", existing.province || ""],
    [parsed.zipcode || "", existing.zipcode || ""],
    [parsed.country || "", existing.country || ""],
    [parsed.phone || "", existing.phone || ""],
    [parsed.note || "", existing.note || ""],
  ];
  for (const [a, b] of fields) {
    if (String(a).trim() !== String(b).trim()) return true;
  }
  if (parsed.quantity !== existing.quantity) return true;
  if (parsed.paymentMethod !== existing.paymentMethod) return true;
  const parsedAmt = parsed.codAmount !== null ? Number(parsed.codAmount) : null;
  const existingAmt = existing.codAmount !== null ? Number(existing.codAmount) : null;
  if (parsedAmt !== existingAmt) return true;
  return false;
}

/**
 * Sync all sheet nguồn vào Postgres.
 *
 * Logic:
 *  - Đơn CHƯA có trong DB → INSERT mới
 *  - Đơn ĐÃ có và status = ERROR/ERROR_UPDATED → so sánh data:
 *      - Có thay đổi → UPDATE + status = ERROR_UPDATED
 *      - Không đổi → SKIP
 *  - Đơn ĐÃ có và status khác (NEW/READY/EXPORTED) → SKIP (không touch)
 */
export async function syncAllSheets(triggeredBy: string = "manual"): Promise<SyncResult> {
  const startedAt = new Date();

  // 1. Cấu hình sources
  const sources = await db
    .select()
    .from(sourceSheets)
    .where(eq(sourceSheets.active, true));

  if (sources.length === 0) {
    throw new Error("No active source sheets configured. Run `npm run seed` first.");
  }

  // 2. Parallel parse 13 sheet
  const parseResults = await Promise.allSettled(
    sources.map(async (source) => {
      const result = await parseSheet(source.spreadsheetId, source.sheetName);
      return { source, ...result };
    }),
  );

  // 3. Đọc tất cả đơn hiện có để check tồn tại + status
  const existingOrders = await db.select().from(orders);
  const existingMap: Record<string, typeof orders.$inferSelect> = {};
  for (const o of existingOrders) {
    existingMap[o.uniqueKey] = o;
  }

  // 4. Build INSERT + UPDATE lists
  const perSheet: SyncResult["perSheet"] = [];
  const rowsToInsert: typeof orders.$inferInsert[] = [];
  const rowsToUpdate: Array<{
    uniqueKey: string;
    parsed: ParsedOrder;
  }> = [];

  for (const r of parseResults) {
    if (r.status === "rejected") {
      perSheet.push({
        customerId: "?",
        productId: "?",
        sheetName: "?",
        added: 0,
        updated: 0,
        errors: 0,
        warnings: [`Failed: ${r.reason?.message ?? r.reason}`],
      });
      continue;
    }

    const { source, orders: parsed, warnings } = r.value;
    let added = 0;
    let updated = 0;
    let errors = 0;

    for (const order of parsed) {
      const uniqueKey = `${source.customerId}_${source.productId}_${order.orderId}`;
      const existing = existingMap[uniqueKey];

      if (!existing) {
        // INSERT new
        rowsToInsert.push({
          uniqueKey,
          orderId: order.orderId,
          customerId: source.customerId,
          productId: source.productId,
          orderDate: order.orderDate,
          titleName: order.titleName,
          name: order.name,
          lastName: order.lastName,
          titleDept: order.titleDept,
          companyName: order.companyName,
          additionalAddressInfo: order.additionalAddressInfo,
          addressLine1: order.addressLine1,
          addressLine2: order.addressLine2,
          city: order.city,
          province: order.province,
          zipcode: order.zipcode,
          country: order.country,
          phone: order.phone,
          quantity: order.quantity,
          paymentMethod: order.paymentMethod,
          codAmount: order.codAmount !== null ? String(order.codAmount) : null,
          note: order.note,
          status: order.status,
          errorNote: order.errorNote,
          syncedAt: startedAt,
          updatedAt: startedAt,
        });
        added++;
        if (order.status === "ERROR") errors++;
      } else {
        // ĐÃ có trong DB
        const isErrorState =
          existing.status === "ERROR" || existing.status === "ERROR_UPDATED";
        if (!isErrorState) continue; // skip READY/NEW/EXPORTED

        // Check có data thay đổi không
        if (!hasChanges(order, existing)) continue;

        // Có thay đổi → UPDATE
        rowsToUpdate.push({ uniqueKey, parsed: order });
        updated++;
      }
    }

    perSheet.push({
      customerId: source.customerId,
      productId: source.productId,
      sheetName: source.sheetName,
      added,
      updated,
      errors,
      warnings,
    });
  }

  // 5. Bulk INSERT (chunk 500)
  for (let i = 0; i < rowsToInsert.length; i += 500) {
    const chunk = rowsToInsert.slice(i, i + 500);
    await db.insert(orders).values(chunk).onConflictDoNothing();
  }

  // 6. UPDATE đơn ERROR có data mới → ERROR_UPDATED
  for (const u of rowsToUpdate) {
    await db
      .update(orders)
      .set({
        name: u.parsed.name,
        addressLine1: u.parsed.addressLine1,
        addressLine2: u.parsed.addressLine2,
        city: u.parsed.city,
        province: u.parsed.province,
        zipcode: u.parsed.zipcode,
        country: u.parsed.country,
        phone: u.parsed.phone,
        quantity: u.parsed.quantity,
        // Cập nhật thông tin phụ
        titleName: u.parsed.titleName,
        lastName: u.parsed.lastName,
        titleDept: u.parsed.titleDept,
        companyName: u.parsed.companyName,
        additionalAddressInfo: u.parsed.additionalAddressInfo,
        paymentMethod: u.parsed.paymentMethod,
        codAmount: u.parsed.codAmount !== null ? String(u.parsed.codAmount) : null,
        note: u.parsed.note,
        // State change
        status: "ERROR_UPDATED",
        errorNote: "Đã cập nhật thông tin từ sheet, cần Validate lại",
        // Reset tracking metadata cũ (vì đơn này coi như mới, sẽ tạo batch mới)
        batchId: null,
        trackingNumber: null,
        trackingUrl: null,
        shippingCarrier: null,
        shipDate: null,
        updatedAt: startedAt,
      })
      .where(eq(orders.uniqueKey, u.uniqueKey));
  }

  const totalAdded = rowsToInsert.length;
  const totalUpdated = rowsToUpdate.length;
  const totalErrors = rowsToInsert.filter((r) => r.status === "ERROR").length;

  // 7. Sync log
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  await db.insert(syncLogs).values({
    id: `sync_${startedAt.getTime()}`,
    startedAt,
    completedAt,
    totalAdded,
    totalErrors,
    details: JSON.stringify({ perSheet, totalUpdated }),
    triggeredBy,
  });

  return {
    totalAdded,
    totalUpdated,
    totalErrors,
    perSheet,
    durationMs,
  };
}
