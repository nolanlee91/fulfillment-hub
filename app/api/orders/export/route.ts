import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { orders, customers, products } from "@/lib/db/schema";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { provinceToRegion, isRegion } from "@/lib/geo/province";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PageKind = "processing" | "delivered" | "failed";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Mới",
  READY: "Sẵn sàng",
  ERROR: "Lỗi",
  ERROR_UPDATED: "Đã cập nhật",
  EXPORTED: "Đã upload/chờ label",
  LABEL_CREATED: "Đã có label",
  IN_TRANSIT: "Đang vận chuyển",
  DELIVERED: "Đã giao",
  FAILED: "Thất bại",
};

const ATTENTION_LABELS: Record<string, string> = {
  ADDRESS_ERROR: "Sai địa chỉ",
  DELAYED: "Delay",
  NOTICE_CARD: "Notice card",
  STUCK: "Không cập nhật",
};

const PAGE_META: Record<PageKind, { sheetName: string; filename: string }> = {
  processing: { sheetName: "Đơn đang xử lý", filename: "orders-processing" },
  delivered: { sheetName: "Đơn đã giao", filename: "orders-delivered" },
  failed: { sheetName: "Đơn thất bại", filename: "orders-failed" },
};

function fmtDateVN(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTrackingUrl(trackingUrl: string | null, trackingNumber: string | null): string | null {
  if (trackingUrl) return trackingUrl;
  if (trackingNumber) {
    return `https://www.canadapost.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(trackingNumber)}`;
  }
  return null;
}

export const GET = withAuth(
  async (req, user) => {
    const { searchParams } = new URL(req.url);
    const page = (searchParams.get("page") || "processing") as PageKind;
    if (!["processing", "delivered", "failed"].includes(page)) {
      return NextResponse.json(
        { success: false, error: "page phải là processing | delivered | failed" },
        { status: 400 },
      );
    }
    const isCustomer = user.role === "CUSTOMER";

    const status = searchParams.get("status"); // chỉ áp dụng cho processing
    const customerId = searchParams.get("customer");
    const productId = searchParams.get("product");
    const payment = searchParams.get("payment");
    const attention = searchParams.get("attention");
    const region = searchParams.get("region"); // WEST | EAST | UNKNOWN | null
    const reconciled = searchParams.get("reconciled"); // "yes" | "no" | null
    const search = searchParams.get("search");

    const conditions = [];

    // CUSTOMER auto filter
    if (isCustomer) {
      if (!user.customerId) {
        return NextResponse.json(
          {
            success: false,
            error: "Tài khoản chưa được gán khách hàng — liên hệ quản trị viên",
          },
          { status: 500 },
        );
      }
      conditions.push(eq(orders.customerId, user.customerId));
    } else if (customerId) {
      conditions.push(eq(orders.customerId, customerId));
    }

    // Page-specific status filter
    if (page === "delivered") {
      conditions.push(eq(orders.status, "DELIVERED"));
    } else if (page === "failed") {
      conditions.push(eq(orders.status, "FAILED"));
    } else {
      // processing: excludeTerminal
      conditions.push(ne(orders.status, "DELIVERED"));
      conditions.push(ne(orders.status, "FAILED"));
      if (status) {
        const list = status.split(",") as Array<
          "READY" | "ERROR" | "ERROR_UPDATED" | "NEW" | "EXPORTED" | "LABEL_CREATED" | "IN_TRANSIT"
        >;
        if (list.length === 1) {
          conditions.push(eq(orders.status, list[0]));
        } else {
          conditions.push(or(...list.map((s) => eq(orders.status, s)))!);
        }
      }
    }

    if (productId) conditions.push(eq(orders.productId, productId));
    if (payment === "PREPAID" || payment === "COD") {
      conditions.push(eq(orders.paymentMethod, payment));
    }
    if (page === "processing" && attention) {
      if (attention === "any") {
        conditions.push(sql`${orders.attentionReason} IS NOT NULL`);
      } else if (["ADDRESS_ERROR", "DELAYED", "NOTICE_CARD", "STUCK"].includes(attention)) {
        conditions.push(
          eq(
            orders.attentionReason,
            attention as "ADDRESS_ERROR" | "DELAYED" | "NOTICE_CARD" | "STUCK",
          ),
        );
      }
    }
    if (reconciled === "yes") {
      conditions.push(sql`${orders.reconciledAt} IS NOT NULL`);
    } else if (reconciled === "no") {
      conditions.push(sql`${orders.reconciledAt} IS NULL`);
    }
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      conditions.push(
        or(
          sql`lower(${orders.orderId}) like ${s}`,
          sql`lower(${orders.name}) like ${s}`,
          sql`lower(${orders.phone}) like ${s}`,
          sql`lower(${orders.zipcode}) like ${s}`,
        ),
      );
    }

    const allRows = await db
      .select({
        orderId: orders.orderId,
        customerId: orders.customerId,
        customerName: customers.name,
        productId: orders.productId,
        productName: products.name,
        name: orders.name,
        addressLine1: orders.addressLine1,
        addressLine2: orders.addressLine2,
        city: orders.city,
        province: orders.province,
        zipcode: orders.zipcode,
        country: orders.country,
        phone: orders.phone,
        quantity: orders.quantity,
        paymentMethod: orders.paymentMethod,
        codAmount: orders.codAmount,
        note: orders.note,
        status: orders.status,
        boxCode: orders.boxCode,
        batchId: orders.batchId,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
        deliveredAt: orders.deliveredAt,
        lastTrackingEvent: orders.lastTrackingEvent,
        lastTrackingAt: orders.lastTrackingAt,
        attentionReason: orders.attentionReason,
        attentionAt: orders.attentionAt,
        attentionNote: orders.attentionNote,
        errorNote: orders.errorNote,
        orderDate: orders.orderDate,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.syncedAt))
      .limit(5000);

    // Lọc theo khu vực (suy từ tỉnh người nhận) để khớp với bộ lọc Region trên UI.
    const rows = isRegion(region)
      ? allRows.filter((r) => provinceToRegion(r.province, r.country) === region)
      : allRows;

    // Build XLSX
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Fulfillment Hub";
    workbook.created = new Date();

    const meta = PAGE_META[page];
    const sheet = workbook.addWorksheet(meta.sheetName);

    // Define columns based on role + page
    type Col = {
      header: string;
      key: string;
      width: number;
      get: (r: (typeof rows)[number]) => string | number | { text: string; hyperlink: string } | null;
      numFmt?: string;
    };

    const cols: Col[] = [];
    cols.push({ header: "Order ID", key: "orderId", width: 18, get: (r) => r.orderId });
    if (!isCustomer) {
      cols.push({
        header: "Khách",
        key: "customer",
        width: 18,
        get: (r) => r.customerName ?? r.customerId,
      });
    }
    cols.push({
      header: "Sản phẩm",
      key: "product",
      width: 22,
      get: (r) => r.productName ?? r.productId,
    });
    cols.push({ header: "Tên nhận", key: "name", width: 24, get: (r) => r.name ?? "" });
    cols.push({
      header: "Địa chỉ",
      key: "address",
      width: 36,
      get: (r) =>
        [r.addressLine1, r.addressLine2].filter(Boolean).join(" / "),
    });
    cols.push({ header: "City", key: "city", width: 16, get: (r) => r.city ?? "" });
    cols.push({ header: "Province", key: "province", width: 10, get: (r) => r.province ?? "" });
    cols.push({ header: "Zipcode", key: "zipcode", width: 12, get: (r) => r.zipcode ?? "" });
    cols.push({ header: "Country", key: "country", width: 10, get: (r) => r.country ?? "" });
    // Phone là text để giữ số 0 đầu
    cols.push({ header: "Phone", key: "phone", width: 14, get: (r) => r.phone ?? "" });
    cols.push({ header: "SL", key: "quantity", width: 6, get: (r) => r.quantity });
    cols.push({
      header: "Thanh toán",
      key: "payment",
      width: 11,
      get: (r) => (r.paymentMethod === "COD" ? "COD" : "Thường"),
    });
    cols.push({
      header: "COD amount",
      key: "codAmount",
      width: 12,
      get: (r) => (r.codAmount ? Number(r.codAmount) : ""),
    });
    if (!isCustomer) {
      cols.push({ header: "Box", key: "box", width: 8, get: (r) => r.boxCode ?? "" });
    }

    if (page === "processing") {
      cols.push({
        header: "Trạng thái",
        key: "status",
        width: 22,
        get: (r) => STATUS_LABELS[r.status] ?? r.status,
      });
      cols.push({
        header: "Cần chú ý",
        key: "attention",
        width: 16,
        get: (r) => (r.attentionReason ? ATTENTION_LABELS[r.attentionReason] : ""),
      });
      cols.push({
        header: "Ghi chú cần chú ý",
        key: "attentionNote",
        width: 30,
        get: (r) => r.attentionNote ?? "",
      });
    }

    if (!isCustomer) {
      cols.push({ header: "Batch", key: "batch", width: 22, get: (r) => r.batchId ?? "" });
    }

    cols.push({
      header: "Tracking",
      key: "tracking",
      width: 22,
      get: (r) => {
        const url = buildTrackingUrl(r.trackingUrl, r.trackingNumber);
        if (!r.trackingNumber) return "";
        if (url) return { text: r.trackingNumber, hyperlink: url };
        return r.trackingNumber;
      },
    });

    if (page === "delivered") {
      cols.push({
        header: "Giao lúc",
        key: "deliveredAt",
        width: 18,
        get: (r) => fmtDateVN(r.deliveredAt),
      });
    }

    if (page === "failed") {
      cols.push({
        header: "Lý do (event cuối)",
        key: "lastEvent",
        width: 36,
        get: (r) => r.lastTrackingEvent ?? "",
      });
      cols.push({
        header: "Lúc",
        key: "lastAt",
        width: 18,
        get: (r) => fmtDateVN(r.lastTrackingAt),
      });
    }

    cols.push({ header: "Ghi chú đơn", key: "note", width: 24, get: (r) => r.note ?? "" });
    cols.push({
      header: "Ngày đơn",
      key: "orderDate",
      width: 14,
      get: (r) => (r.orderDate ? new Date(r.orderDate).toLocaleDateString("vi-VN") : ""),
    });

    sheet.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));

    // Header style
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F1115" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 22;

    // Data rows
    for (const r of rows) {
      const rowData: Record<string, unknown> = {};
      for (const c of cols) {
        const v = c.get(r);
        rowData[c.key] = v;
      }
      const added = sheet.addRow(rowData);
      // Phone column ép format text
      const phoneCol = cols.findIndex((c) => c.key === "phone");
      if (phoneCol >= 0) {
        added.getCell(phoneCol + 1).numFmt = "@";
      }
      // Tracking hyperlink: ExcelJS tự xử khi value là { text, hyperlink }
      const trackingCol = cols.findIndex((c) => c.key === "tracking");
      if (trackingCol >= 0) {
        const cell = added.getCell(trackingCol + 1);
        if (typeof cell.value === "object" && cell.value && "hyperlink" in cell.value) {
          cell.font = { color: { argb: "FF2563EB" }, underline: true };
        }
      }
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;

    const today = new Date().toISOString().slice(0, 10);
    const filename = `${meta.filename}-${today}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
