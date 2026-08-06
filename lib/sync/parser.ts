import { readSheet } from "../sheets/client";
import { ITEM_SPLIT, normSplitHeader } from "./item-split";

/**
 * Cấu trúc output sau khi parse 1 sheet.
 */
export interface ParsedOrder {
  orderId: string;
  orderDate: Date | null;
  titleName: string;
  name: string;
  lastName: string;
  titleDept: string;
  companyName: string;
  additionalAddressInfo: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  zipcode: string;
  country: string;
  phone: string;
  quantity: number;
  // Tab nhiều mặt hàng: chia số lượng từng loại {variantProductId: qty}. NULL nếu tab
  // 1 mặt hàng bình thường. quantity vẫn là TỔNG.
  itemBreakdown: Record<string, number> | null;
  paymentMethod: "PREPAID" | "COD";
  codAmount: number | null;
  note: string;
  // Validation result
  status: "READY" | "ERROR";
  errorNote: string;
}

export interface ParseResult {
  orders: ParsedOrder[];
  warnings: string[];
}

/**
 * Normalize header để so sánh (lowercase, bỏ khoảng trắng dư, bỏ \n).
 */
function normalizeHeader(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse Vietnamese date "DD/MM/YYYY" hoặc "D/M/YYYY".
 */
function parseDate(value: string): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize phone: strip non-digit; nếu 11 số bắt đầu bằng 1 → bỏ prefix.
 * Trả về 10-digit string nếu hợp lệ, hoặc raw digits nếu không đủ 10 (để báo lỗi).
 */
function normalizePhone(raw: string): { phone: string; valid: boolean } {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return { phone: digits, valid: digits.length === 10 };
}

/**
 * Số điện thoại DỰ PHÒNG khi SĐT khách nhập SAI/THIẾU → đơn không bị chặn vì phone
 * (nhà vận chuyển vẫn cần 1 số hợp lệ để in nhãn). Áp cho MỌI khách.
 */
export const FALLBACK_PHONE = "6048373662";

/** Trả về SĐT 10 số hợp lệ; sai/thiếu → dùng FALLBACK_PHONE. */
export function resolvePhone(raw: string): string {
  const { phone, valid } = normalizePhone(raw);
  return valid ? phone : FALLBACK_PHONE;
}

/**
 * Chuẩn hoá text từ sheet cho nhãn/CSV: NFKC đưa ký tự Unicode "điệu" (chữ toán học
 * 𝑹𝒐𝒔𝒂, full-width, ligature…) về ASCII/dạng chuẩn để không bị "??" khi in nhãn.
 * Tiếng Việt có dấu KHÔNG bị ảnh hưởng (giữ nguyên: "Nguyễn" → "Nguyễn").
 */
export function cleanText(v: unknown): string {
  return String(v ?? "").normalize("NFKC").trim();
}

/**
 * Parse số tiền từ Sheet (có thể có ký tự "$", ",", khoảng trắng).
 * Trả về NaN nếu không hợp lệ hoặc rỗng.
 */
function parseMoney(raw: string): number {
  const s = String(raw || "").trim();
  if (!s) return NaN;
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return NaN;
  return Number(cleaned);
}

/**
 * Đọc 1 sheet và parse thành array of orders.
 * Skip dòng:
 *  - Không có Mã đơn hàng
 *  - Đã có Tracking Number
 */
export async function parseSheet(
  spreadsheetId: string,
  sheetName: string,
  productId?: string,
): Promise<ParseResult> {
  const data = await readSheet(spreadsheetId, sheetName);
  const warnings: string[] = [];

  if (data.length < 2) {
    return { orders: [], warnings: [`Sheet ${sheetName}: empty`] };
  }

  const header = data[0].map(normalizeHeader);
  const findCol = (name: string) => header.findIndex((h) => h === name.toLowerCase());

  // Required columns
  const cols = {
    tracking: findCol("tracking number"),
    orderId: findCol("mã đơn hàng"),
    orderDate: findCol("ngày lên đơn"),
    titleName: findCol("#titlename"),
    name: findCol("name"),
    lastName: findCol("#lastname"),
    titleDept: findCol("#title/dept"),
    company: findCol("#companyname"),
    addInfo: findCol("#additionaladdressinformation"),
    address1: findCol("#addressline1"),
    address2: findCol("#addressline2"),
    city: findCol("city"),
    province: findCol("#province/state"),
    zip: findCol("zipcode"),
    country: findCol("country"),
    phone: findCol("phone"),
  };

  // Check required headers
  const requiredCols: { [key: string]: number } = {
    "Tracking Number": cols.tracking,
    "Mã đơn hàng": cols.orderId,
    "Name": cols.name,
    "#ADDRESSLINE1": cols.address1,
    "City": cols.city,
    "Zipcode": cols.zip,
    "Phone": cols.phone,
  };
  const missing = Object.entries(requiredCols)
    .filter(([, idx]) => idx === -1)
    .map(([k]) => k);

  if (missing.length > 0) {
    warnings.push(`Sheet ${sheetName}: missing columns [${missing.join(", ")}]`);
    return { orders: [], warnings };
  }

  // Identify quantity columns (giữa "phone" và "giá tiền")
  const qtyIndexes: number[] = [];
  const giaTienIdx = header.findIndex((h) => h.startsWith("giá tiền"));
  const ghiChuIdx = header.findIndex((h) => h.startsWith("ghi chú"));
  // Một số khách (vd nhiều mặt hàng / KDE đóng hàng) đánh dấu COD ở cột riêng
  // "Payment Method" thay vì ghi trong Ghi chú. Khách cũ không có cột này → bỏ qua.
  const paymentMethodIdx = header.findIndex((h) => h.startsWith("payment method"));
  if (giaTienIdx > cols.phone) {
    for (let i = cols.phone + 1; i < giaTienIdx; i++) {
      qtyIndexes.push(i);
    }
  } else {
    warnings.push(`Sheet ${sheetName}: cannot detect quantity columns`);
  }

  // Tab nhiều mặt hàng (vd Baku Serum + Cream): map cột theo header → variantId
  // để tính breakdown riêng từng loại. Chỉ áp khi productId có trong ITEM_SPLIT.
  const splitCfg = productId ? ITEM_SPLIT[productId] : undefined;
  const splitCols: { idx: number; variantId: string }[] = [];
  if (splitCfg) {
    for (const c of splitCfg) {
      const idx = header.findIndex((h) => h === normSplitHeader(c.header));
      if (idx === -1) {
        warnings.push(`Sheet ${sheetName}: khong thay cot "${c.header}" cho ${c.variantId}`);
      } else {
        splitCols.push({ idx, variantId: c.variantId });
      }
    }
  }

  // Parse rows
  const orders: ParsedOrder[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const orderId = String(row[cols.orderId] || "").trim();
    if (!orderId) continue;

    const tracking = String(row[cols.tracking] || "").trim();
    if (tracking !== "") continue; // skip nếu đã có tracking

    // Tính tổng quantity
    let totalQty = 0;
    for (const idx of qtyIndexes) {
      const v = Number(row[idx]);
      if (!isNaN(v) && v > 0) totalQty += v;
    }

    // Chia số lượng từng loại (tab nhiều mặt hàng)
    let itemBreakdown: Record<string, number> | null = null;
    if (splitCols.length > 0) {
      const bd: Record<string, number> = {};
      for (const { idx, variantId } of splitCols) {
        const v = Number(row[idx]);
        if (!isNaN(v) && v > 0) bd[variantId] = (bd[variantId] || 0) + v;
      }
      if (Object.keys(bd).length > 0) itemBreakdown = bd;
    }

    const name = cleanText(row[cols.name]);
    const companyName = cleanText(row[cols.company]);
    const address1 = cleanText(row[cols.address1]);
    const city = cleanText(row[cols.city]);
    const zipcode = String(row[cols.zip] || "").trim();
    const phoneRaw = String(row[cols.phone] || "").trim();
    // SĐT sai/thiếu → tự điền số dự phòng (không báo lỗi phone nữa).
    const phone = resolvePhone(phoneRaw);

    // Payment + note
    const note = ghiChuIdx >= 0 ? String(row[ghiChuIdx] || "").trim() : "";
    const paymentMethodCell =
      paymentMethodIdx >= 0 ? String(row[paymentMethodIdx] || "").trim() : "";
    const giaTienVal = giaTienIdx >= 0 ? parseMoney(String(row[giaTienIdx] || "")) : NaN;
    const isCOD =
      note.toLowerCase().includes("cod") ||
      paymentMethodCell.toLowerCase().includes("cod");
    const paymentMethod: "PREPAID" | "COD" = isCOD ? "COD" : "PREPAID";
    const codAmount = isCOD && !isNaN(giaTienVal) && giaTienVal > 0 ? giaTienVal : null;

    // Validate
    const missingFields: string[] = [];
    if (!name) missingFields.push("Name");
    if (!companyName) missingFields.push("#COMPANYNAME");
    if (!address1) missingFields.push("#ADDRESSLINE1");
    if (!city) missingFields.push("City");
    if (!zipcode) missingFields.push("Zipcode");
    // Phone KHÔNG còn là điều kiện ERROR: sai/thiếu đã tự thay bằng FALLBACK_PHONE.

    const status = missingFields.length > 0 ? "ERROR" : "READY";
    const errorNote =
      missingFields.length > 0 ? "Missing: " + missingFields.join(", ") : "";

    orders.push({
      orderId,
      orderDate: parseDate(String(row[cols.orderDate] || "")),
      titleName: cleanText(row[cols.titleName]),
      name,
      lastName: cleanText(row[cols.lastName]),
      titleDept: cleanText(row[cols.titleDept]),
      companyName,
      additionalAddressInfo: cleanText(row[cols.addInfo]),
      addressLine1: address1,
      addressLine2: cleanText(row[cols.address2]),
      city,
      province: cleanText(row[cols.province]),
      zipcode,
      country: "Canada",
      phone,
      quantity: totalQty,
      itemBreakdown,
      paymentMethod,
      codAmount,
      note,
      status,
      errorNote,
    });
  }

  return { orders, warnings };
}
