import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { storagePallets, storageMovements, customers, storageCustomerRates } from "@/lib/db/schema";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA");
}

interface Rate {
  handlingPerPallet: number;
  handlingPerUnit: number;
  storagePerWeek: number;
  storagePerMonth: number;
  basis: "WEEK" | "MONTH";
}
// Fallback theo bảng giá June 2026 nếu khách chưa có rate row.
const DEFAULT_RATE: Rate = {
  handlingPerPallet: 10,
  handlingPerUnit: 1,
  storagePerWeek: 15,
  storagePerMonth: 50,
  basis: "MONTH",
};

export interface ReportRange {
  from: Date;
  to: Date;
  customerId?: string;
}

/**
 * Báo cáo Excel Lưu kho theo kỳ. Áp RATE RIÊNG từng khách (storage_customer_rates)
 * để tự tính tiền:
 *   - Sheet "Storage": phí lưu kho = số ngày trong kỳ × (rate/tuần÷7 hoặc /tháng÷30).
 *   - Sheet "Movements": phí nhận/xuất = $/pallet hoặc số unit × $/unit.
 */
export async function buildStorageReportXlsx(range: ReportRange): Promise<ArrayBuffer> {
  const { from, to, customerId } = range;

  const custRows = await db.select({ id: customers.id, name: customers.name }).from(customers);
  const custName: Record<string, string> = {};
  for (const c of custRows) custName[c.id] = c.name;

  const rateRows = await db.select().from(storageCustomerRates);
  const rateMap: Record<string, Rate> = {};
  for (const r of rateRows) {
    rateMap[r.customerId] = {
      handlingPerPallet: Number(r.handlingPerPallet),
      handlingPerUnit: Number(r.handlingPerUnit),
      storagePerWeek: Number(r.storagePerWeek),
      storagePerMonth: Number(r.storagePerMonth),
      basis: r.basis,
    };
  }
  const rateFor = (cid: string): Rate => rateMap[cid] ?? DEFAULT_RATE;

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
  const moveConds = [gte(storageMovements.occurredAt, from), lte(storageMovements.occurredAt, to)];
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
    { header: "Units on hand", key: "onhand", width: 14 },
    { header: "Received date", key: "recvDate", width: 14 },
    { header: "Picked up date", key: "puDate", width: 14 },
    { header: "Days in period", key: "days", width: 14 },
    { header: "Basis", key: "basis", width: 10 },
    { header: "Rate (CAD)", key: "rate", width: 12 },
    { header: "Storage amount", key: "amount", width: 16 },
  ];
  let storageTotal = 0;
  for (const p of pallets) {
    const r = rateFor(p.customerId);
    const start = Math.max(new Date(p.receivedAt).getTime(), from.getTime());
    const end = Math.min(p.pickedUpAt ? new Date(p.pickedUpAt).getTime() : to.getTime(), to.getTime());
    const days = Math.max(0, Math.round((end - start) / DAY_MS));
    const perDay = r.basis === "WEEK" ? r.storagePerWeek / 7 : r.storagePerMonth / 30;
    const amount = round2(days * perDay);
    storageTotal += amount;
    sA.addRow({
      customer: custName[p.customerId] ?? p.customerId,
      pallet: p.palletCode,
      product: p.productName,
      onhand: p.unitCount,
      recvDate: fmtDate(p.receivedAt),
      puDate: fmtDate(p.pickedUpAt),
      days,
      basis: r.basis === "WEEK" ? "Weekly" : "Monthly",
      rate: r.basis === "WEEK" ? r.storagePerWeek : r.storagePerMonth,
      amount,
    });
  }
  sA.addRow({ days: "TOTAL", amount: round2(storageTotal) });
  sA.getRow(1).font = { bold: true };
  sA.lastRow!.font = { bold: true };

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
    { header: "Fee (CAD)", key: "fee", width: 12 },
  ];
  let handlingTotal = 0;
  for (const m of moves) {
    const r = rateFor(m.customerId);
    const units = Math.abs(m.units);
    const fee = round2(m.uom === "PALLET" ? r.handlingPerPallet : units * r.handlingPerUnit);
    handlingTotal += fee;
    sB.addRow({
      date: fmtDate(m.occurredAt),
      customer: custName[m.customerId] ?? m.customerId,
      pallet: m.palletCode ?? "",
      product: m.productName ?? "",
      type: m.type === "RECEIVE_IN" ? "Receive" : m.type === "PICKUP_OUT" ? "Pickup" : "Adjust",
      units,
      uom: m.uom,
      fee,
    });
  }
  sB.addRow({ uom: "TOTAL", fee: round2(handlingTotal) });
  sB.getRow(1).font = { bold: true };
  sB.lastRow!.font = { bold: true };

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
