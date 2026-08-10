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

    // Sheet hướng dẫn: khóa tra có thể là Order ID HOẶC Tracking Number.
    const guide = workbook.addWorksheet("Hướng dẫn");
    guide.columns = [{ header: "", key: "t", width: 90 }];
    const lines = [
      "Cách điền file đối soát:",
      "",
      "• Cột khóa: dùng MỘT trong hai — 'Order ID' HOẶC 'Tracking Number'.",
      "   - Quen theo mã đơn: giữ cột 'Order ID'.",
      "   - Theo dõi bằng tracking: đổi tên cột đầu thành 'Tracking Number'.",
      "• Cột 'Ref Number': bắt buộc (mã e-transfer).",
      "",
      "LƯU Ý tracking: số tracking dài dễ bị Excel đổi thành 1.03136E+15 (mất số).",
      "→ Giữ cột tracking ở dạng TEXT, hoặc xuất/lưu file CSV, đừng để Excel tự convert.",
      "→ App sẽ báo lỗi và bỏ qua các dòng tracking sai định dạng.",
    ];
    lines.forEach((t, i) => {
      const r = guide.addRow({ t });
      if (i === 0) r.font = { bold: true, size: 12 };
    });

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
