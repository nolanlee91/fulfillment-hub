import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import { withAuth } from "@/lib/auth/api-guard";

export const maxDuration = 60;

interface ParsedRow {
  orderId: string;
  refNumber: string;
}

/**
 * Parse Excel/CSV file → list (orderId, refNumber).
 * Chấp nhận header (case-insensitive, trim):
 *   - Order ID column: "mã đơn hàng", "order id", "orderid", "order number"
 *   - Ref column:      "mã ref", "ref number", "refnumber", "reference", "ref"
 */
async function parseRefFile(buffer: ArrayBuffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File không có sheet nào");

  const ORDER_ALIASES = ["mã đơn hàng", "order id", "orderid", "order number", "mã đơn"];
  const REF_ALIASES = ["mã ref", "ref number", "refnumber", "reference", "ref", "ref no", "mã refnumber"];

  const headerRow = sheet.getRow(1);
  let orderCol = 0;
  let refCol = 0;
  headerRow.eachCell((cell, colNumber) => {
    const v = String(cell.value || "").trim().toLowerCase();
    if (!orderCol && ORDER_ALIASES.includes(v)) orderCol = colNumber;
    if (!refCol && REF_ALIASES.includes(v)) refCol = colNumber;
  });

  if (!orderCol || !refCol) {
    throw new Error(
      "File thiếu cột bắt buộc. Cần 2 cột: 'Mã đơn hàng' và 'Mã Ref' (hoặc tương đương).",
    );
  }

  const rows: ParsedRow[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const orderId = String(row.getCell(orderCol).value || "").trim();
    const refNumber = String(row.getCell(refCol).value || "").trim();
    if (!orderId || !refNumber) continue;
    rows.push({ orderId, refNumber });
  }
  return rows;
}

/**
 * Upload file Ref đối soát.
 * CUSTOMER role: chỉ match đơn của customer mình (security).
 * STAFF/SUPER_ADMIN: match toàn bộ DB (giúp khách up hộ).
 */
export const POST = withAuth(
  async (req, user) => {
    try {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: "Chưa upload file" },
          { status: 400 },
        );
      }

      const customerId = user.customerId;
      if (!customerId) {
        return NextResponse.json(
          { success: false, error: "Account is not linked to a customer" },
          { status: 400 },
        );
      }

      // Parse file
      const buffer = await file.arrayBuffer();
      let rows: ParsedRow[];
      try {
        rows = await parseRefFile(buffer);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }

      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "File không có dòng nào hợp lệ" },
          { status: 400 },
        );
      }

      // Map orderId → refNumber (dedup, lấy entry cuối nếu duplicate)
      const refByOrderId: Record<string, string> = {};
      for (const r of rows) refByOrderId[r.orderId] = r.refNumber;
      const orderIds = Object.keys(refByOrderId);

      // Load orders matching — CUSTOMER chỉ thấy đơn của customer mình
      const dbOrders = await db
        .select({
          uniqueKey: orders.uniqueKey,
          orderId: orders.orderId,
          paymentMethod: orders.paymentMethod,
          accountedAt: orders.accountedAt,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.orderId, orderIds),
            eq(orders.customerId, customerId),
          ),
        );

      // Phân loại:
      //  - COD: bỏ qua (đối soát chỉ áp prepaid)
      //  - Đã hạch toán (accountedAt != null): KHÔNG ghi đè — kế toán đã chốt sổ,
      //    chỉ cảnh báo để khách biết không sửa được. Muốn sửa phải nhờ KDExpress.
      //  - Còn lại: ghi đè Ref bình thường.
      const matched: Array<{ uniqueKey: string; orderId: string; refNumber: string }> = [];
      const skippedCOD: string[] = [];
      const skippedBooked: string[] = [];
      for (const o of dbOrders) {
        if (o.paymentMethod === "COD") {
          skippedCOD.push(o.orderId);
          continue;
        }
        if (o.accountedAt) {
          skippedBooked.push(o.orderId);
          continue;
        }
        matched.push({
          uniqueKey: o.uniqueKey,
          orderId: o.orderId,
          refNumber: refByOrderId[o.orderId],
        });
      }

      const matchedOrderIds = new Set(dbOrders.map((d) => d.orderId));
      const unmatched = orderIds.filter((oid) => !matchedOrderIds.has(oid));

      // Update DB — chỉ các đơn chưa hạch toán
      const now = new Date();
      for (const m of matched) {
        await db
          .update(orders)
          .set({
            paymentType: "ETF",
            refNumber: m.refNumber,
            reconciledAt: now,
            updatedAt: now,
          })
          .where(eq(orders.uniqueKey, m.uniqueKey));
      }

      return NextResponse.json({
        success: true,
        totalInFile: rows.length,
        matched: matched.length,
        unmatched: unmatched.length,
        unmatchedOrderIds: unmatched.slice(0, 50), // cap để response không quá to
        skippedCOD: skippedCOD.length,
        skippedBooked: skippedBooked.length,
        skippedBookedOrderIds: skippedBooked.slice(0, 50),
        message: `Đối soát: ${matched.length} đơn khớp${unmatched.length > 0 ? `, ${unmatched.length} đơn không khớp` : ""}${skippedBooked.length > 0 ? `, ${skippedBooked.length} đơn ĐÃ hạch toán nên không ghi đè` : ""}${skippedCOD.length > 0 ? ` (bỏ qua ${skippedCOD.length} đơn COD)` : ""}.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Reconciliation upload error:", error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["CUSTOMER"] },
);
