import { db } from "../db";
import { sourceSheets, orders, syncLogs, customers, products } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { parseSheet } from "./parser";

export interface SyncResult {
  totalAdded: number;
  totalErrors: number;
  perSheet: Array<{
    customerId: string;
    productId: string;
    sheetName: string;
    added: number;
    errors: number;
    warnings: string[];
  }>;
  durationMs: number;
}

/**
 * Sync all 13 sheet nguồn vào Postgres orders table.
 *
 * Flow:
 *  1. Đọc bảng source_sheets từ DB → list 13 sheet
 *  2. Parallel parse 13 sheet
 *  3. Build orders array, skip dòng đã có unique_key trong DB
 *  4. Insert vào orders
 *  5. Ghi sync_logs
 */
export async function syncAllSheets(triggeredBy: string = "manual"): Promise<SyncResult> {
  const startedAt = new Date();

  // 1. Đọc cấu hình sources từ DB
  const sources = await db
    .select()
    .from(sourceSheets)
    .where(eq(sourceSheets.active, true));

  if (sources.length === 0) {
    throw new Error("No active source sheets configured. Run `npm run seed` first.");
  }

  // 2. Parallel parse
  const parseResults = await Promise.allSettled(
    sources.map(async (source) => {
      const result = await parseSheet(source.spreadsheetId, source.sheetName);
      return {
        source,
        ...result,
      };
    }),
  );

  // 3. Đọc các unique_key đã tồn tại trong DB
  const existingKeys = new Set(
    (await db.select({ uniqueKey: orders.uniqueKey }).from(orders)).map(
      (r) => r.uniqueKey,
    ),
  );

  // 4. Build rows + insert
  const perSheet: SyncResult["perSheet"] = [];
  const allRowsToInsert: typeof orders.$inferInsert[] = [];

  for (const r of parseResults) {
    if (r.status === "rejected") {
      perSheet.push({
        customerId: "?",
        productId: "?",
        sheetName: "?",
        added: 0,
        errors: 0,
        warnings: [`Failed: ${r.reason?.message ?? r.reason}`],
      });
      continue;
    }

    const { source, orders: parsed, warnings } = r.value;
    let added = 0;
    let errors = 0;

    for (const order of parsed) {
      const uniqueKey = `${source.customerId}_${source.productId}_${order.orderId}`;
      if (existingKeys.has(uniqueKey)) continue;

      allRowsToInsert.push({
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
        status: order.status,
        errorNote: order.errorNote,
        syncedAt: startedAt,
        updatedAt: startedAt,
      });

      existingKeys.add(uniqueKey);
      added++;
      if (order.status === "ERROR") errors++;
    }

    perSheet.push({
      customerId: source.customerId,
      productId: source.productId,
      sheetName: source.sheetName,
      added,
      errors,
      warnings,
    });
  }

  // 5. Bulk insert (chunk 500 để tránh quá tải)
  const totalAdded = allRowsToInsert.length;
  const totalErrors = allRowsToInsert.filter((r) => r.status === "ERROR").length;

  for (let i = 0; i < allRowsToInsert.length; i += 500) {
    const chunk = allRowsToInsert.slice(i, i + 500);
    await db.insert(orders).values(chunk).onConflictDoNothing();
  }

  // 6. Sync log
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  await db.insert(syncLogs).values({
    id: `sync_${startedAt.getTime()}`,
    startedAt,
    completedAt,
    totalAdded,
    totalErrors,
    details: JSON.stringify(perSheet),
    triggeredBy,
  });

  return {
    totalAdded,
    totalErrors,
    perSheet,
    durationMs,
  };
}
