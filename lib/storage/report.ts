import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { storagePallets, storageMovements, customers } from "@/lib/db/schema";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";

const DAY_MS = 86_400_000;

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA");
}

export interface ReportRange {
  from: Date;
  to: Date;
  customerId?: string;
}

/**
 * Báo cáo Excel Lưu kho theo kỳ (KHÔNG có cột giá — kế toán tự áp rate từng khách).
 *   - Sheet "Storage": 1 dòng / pallet có mặt trong kỳ (để tính phí lưu kho).
 *   - Sheet "Movements": 1 dòng / nhập-xuất trong kỳ (để tính phí nhận/xuất).
 */
export async function buildStorageReportXlsx(range: ReportRange): Promise<ArrayBuffer> {
  const { from, to, customerId } = range;

  const custRows = await db.select({ id: customers.id, name: customers.name }).from(customers);
  const custName: Record<string, string> = {};
  for (const c of custRows) custName[c.id] = c.name;

  // --- Sheet A: pallet có mặt trong kỳ (overlap [from,to]) ---
  const palletConds = [
    lte(storagePallets.receivedAt, to),
    or(isNull(storagePallets.pickedUpAt), gte(storagePallets.pickedUpAt, from))!,
  ];
  if (customerId) palletConds.push(eq(storagePallets.customerId, customerId));
  const pallets = await db
    .select()
    .from(storagePallets)
    .where(and(...palletConds))
    .orderBy(asc(storagePallets.customerId), asc(storagePallets.palletCode));

  // --- Sheet B: movement trong kỳ ---
  const moveConds = [
    gte(storageMovements.occurredAt, from),
    lte(storageMovements.occurredAt, to),
  ];
  if (customerId) moveConds.push(eq(storageMovements.customerId, customerId));
  const moves = await db
    .select({
      occurredAt: storageMovements.occurredAt,
      customerId: storageMovements.customerId,
      type: storageMovements.type,
      units: storageMovements.units,
      uom: storageMovements.uom,
      palletCode: storagePallets.palletCode,
      productName: storagePallets.productName,
    })
    .from(storageMovements)
    .leftJoin(storagePallets, eq(storageMovements.palletId, storagePallets.id))
    .where(and(...moveConds))
    .orderBy(asc(storageMovements.occurredAt));

  const workbook = new ExcelJS.Workbook();

  // Sheet Storage
  const sA = workbook.addWorksheet("Storage");
  sA.columns = [
    { header: "Customer", key: "customer", width: 22 },
    { header: "Pallet", key: "pallet", width: 16 },
    { header: "Product", key: "product", width: 20 },
    { header: "Units received", key: "received", width: 14 },
    { header: "Units on hand", key: "onhand", width: 14 },
    { header: "Received date", key: "recvDate", width: 14 },
    { header: "Picked up date", key: "puDate", width: 14 },
    { header: "Days in period", key: "days", width: 14 },
  ];
  for (const p of pallets) {
    const start = Math.max(new Date(p.receivedAt).getTime(), from.getTime());
    const end = Math.min(
      p.pickedUpAt ? new Date(p.pickedUpAt).getTime() : to.getTime(),
      to.getTime(),
    );
    const days = Math.max(0, Math.round((end - start) / DAY_MS));
    sA.addRow({
      customer: custName[p.customerId] ?? p.customerId,
      pallet: p.palletCode,
      product: p.productName,
      received: p.initialUnits,
      onhand: p.unitCount,
      recvDate: fmtDate(p.receivedAt),
      puDate: fmtDate(p.pickedUpAt),
      days,
    });
  }
  sA.getRow(1).font = { bold: true };

  // Sheet Movements
  const sB = workbook.addWorksheet("Movements");
  sB.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Customer", key: "customer", width: 22 },
    { header: "Pallet", key: "pallet", width: 16 },
    { header: "Product", key: "product", width: 20 },
    { header: "Type", key: "type", width: 12 },
    { header: "Units", key: "units", width: 10 },
    { header: "UoM", key: "uom", width: 10 },
  ];
  for (const m of moves) {
    sB.addRow({
      date: fmtDate(m.occurredAt),
      customer: custName[m.customerId] ?? m.customerId,
      pallet: m.palletCode ?? "",
      product: m.productName ?? "",
      type: m.type === "RECEIVE_IN" ? "Receive" : m.type === "PICKUP_OUT" ? "Pickup" : "Adjust",
      units: Math.abs(m.units),
      uom: m.uom,
    });
  }
  sB.getRow(1).font = { bold: true };

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
