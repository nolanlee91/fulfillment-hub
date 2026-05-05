import { readSheet } from "../sheets/client";

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
  if (giaTienIdx > cols.phone) {
    for (let i = cols.phone + 1; i < giaTienIdx; i++) {
      qtyIndexes.push(i);
    }
  } else {
    warnings.push(`Sheet ${sheetName}: cannot detect quantity columns`);
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

    const name = String(row[cols.name] || "").trim();
    const address1 = String(row[cols.address1] || "").trim();
    const city = String(row[cols.city] || "").trim();
    const zipcode = String(row[cols.zip] || "").trim();
    const phoneRaw = String(row[cols.phone] || "").trim();
    const phoneNorm = normalizePhone(phoneRaw);

    // Payment + note
    const giaTienVal = giaTienIdx >= 0 ? parseMoney(String(row[giaTienIdx] || "")) : NaN;
    const isCOD = !isNaN(giaTienVal) && giaTienVal > 0;
    const paymentMethod: "PREPAID" | "COD" = isCOD ? "COD" : "PREPAID";
    const codAmount = isCOD ? giaTienVal : null;
    const note = ghiChuIdx >= 0 ? String(row[ghiChuIdx] || "").trim() : "";

    // Validate
    const missingFields: string[] = [];
    if (!name) missingFields.push("Name");
    if (!address1) missingFields.push("#ADDRESSLINE1");
    if (!city) missingFields.push("City");
    if (!zipcode) missingFields.push("Zipcode");
    if (!phoneRaw) {
      missingFields.push("Phone");
    } else if (!phoneNorm.valid) {
      missingFields.push("Phone (sai định dạng)");
    }

    const status = missingFields.length > 0 ? "ERROR" : "READY";
    const errorNote =
      missingFields.length > 0 ? "Missing: " + missingFields.join(", ") : "";

    orders.push({
      orderId,
      orderDate: parseDate(String(row[cols.orderDate] || "")),
      titleName: String(row[cols.titleName] || "").trim(),
      name,
      lastName: String(row[cols.lastName] || "").trim(),
      titleDept: String(row[cols.titleDept] || "").trim(),
      companyName: String(row[cols.company] || "").trim(),
      additionalAddressInfo: String(row[cols.addInfo] || "").trim(),
      addressLine1: address1,
      addressLine2: String(row[cols.address2] || "").trim(),
      city,
      province: String(row[cols.province] || "").trim(),
      zipcode,
      country: "Canada",
      phone: phoneNorm.valid ? phoneNorm.phone : phoneRaw,
      quantity: totalQty,
      paymentMethod,
      codAmount,
      note,
      status,
      errorNote,
    });
  }

  return { orders, warnings };
}
