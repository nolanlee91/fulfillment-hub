import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { orders, orderPayments, products, customers } from "@/lib/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });
}

/**
 * Báo cáo "Đơn CHỜ BOOK" của 1 khách: mỗi dòng = 1 KHOẢN đã có bằng chứng
 * (khách đã up ref/ảnh) nhưng CHƯA book (accountedAt null). Mọi status.
 *
 * Cột "Bằng chứng":
 *   - ETF        → ghi thẳng mã Ref (text).
 *   - non-ETF    → hyperlink "Xem ảnh" trỏ tới ảnh trên R2 (bấm là mở).
 */
export async function buildUnbookedReportXlsx(
  customerId: string,
): Promise<{ buffer: ArrayBuffer; customerName: string; count: number }> {
  const [cust] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId));
  const customerName = cust?.name ?? customerId;

  const rows = await db
    .select({
      orderId: orders.orderId,
      tracking: orders.trackingNumber,
      productName: products.name,
      name: orders.name,
      status: orders.status,
      paymentType: orderPayments.paymentType,
      refNumber: orderPayments.refNumber,
      proofUrl: orderPayments.proofUrl,
      reconciledAt: orderPayments.reconciledAt,
    })
    .from(orderPayments)
    .innerJoin(orders, eq(orderPayments.orderUniqueKey, orders.uniqueKey))
    .leftJoin(products, eq(orders.productId, products.id))
    .where(and(eq(orders.customerId, customerId), isNull(orderPayments.accountedAt)))
    .orderBy(asc(orders.orderId));

  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("Chờ book");
  s.columns = [
    { header: "Order ID", key: "orderId", width: 18 },
    { header: "Tracking", key: "tracking", width: 22 },
    { header: "Sản phẩm", key: "product", width: 18 },
    { header: "Người nhận", key: "name", width: 22 },
    { header: "Status", key: "status", width: 14 },
    { header: "Loại TT", key: "type", width: 14 },
    { header: "Bằng chứng", key: "proof", width: 34 },
    { header: "Ngày đối soát", key: "reconciled", width: 14 },
  ];

  for (const r of rows) {
    const isEtf = r.paymentType === "ETF";
    const row = s.addRow({
      orderId: r.orderId,
      tracking: r.tracking ?? "",
      product: r.productName ?? "",
      name: r.name ?? "",
      status: r.status,
      type: isEtf ? "ETF" : "non-ETF",
      proof: isEtf ? (r.refNumber ?? "") : "",
      reconciled: fmtDate(r.reconciledAt),
    });
    // non-ETF: ô Bằng chứng = link click mở ảnh.
    if (!isEtf && r.proofUrl) {
      const cell = row.getCell("proof");
      cell.value = { text: "Xem ảnh", hyperlink: r.proofUrl };
      cell.font = { color: { argb: "FF1D4ED8" }, underline: true };
    }
  }

  const total = s.addRow({ orderId: `TỔNG: ${rows.length} khoản chờ book` });
  total.font = { bold: true };
  s.getRow(1).font = { bold: true };

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { buffer, customerName, count: rows.length };
}
