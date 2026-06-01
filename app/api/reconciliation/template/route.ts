import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * Tải template Excel — 2 cột (Order ID + Ref Number) + 2 sample row hướng dẫn.
 * CUSTOMER role.
 */
export const GET = withAuth(
  async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Reconciliation");

    // Header
    sheet.columns = [
      { header: "Order ID", key: "orderId", width: 24 },
      { header: "Ref Number", key: "refNumber", width: 30 },
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 22;

    // Sample rows (italic gray — anh xóa khi điền data thật)
    sheet.addRow({ orderId: "FitABC123", refNumber: "REF20260529001" });
    sheet.addRow({ orderId: "BakXYZ789", refNumber: "REF20260529002" });

    for (let i = 2; i <= 3; i++) {
      const row = sheet.getRow(i);
      row.font = { italic: true, color: { argb: "FF6B7280" }, size: 10 };
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="reconciliation-template.xlsx"',
      },
    });
  },
  { roles: ["CUSTOMER"] },
);
