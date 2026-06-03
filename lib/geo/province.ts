// Chuẩn hoá tỉnh (province) + phân vùng khu vực fulfillment.
//
// Khu vực dùng để quyết định đơn nào làm ở khu nào trước khi tạo batch:
//  - WEST: kho cũ (BC) lo — từ BC đến hết Manitoba.
//  - EAST: kho mới lo — từ Manitoba "hất sang" phía đông.
// Lãnh thổ chia theo kinh độ so với Manitoba: YT/NT phía Tây → WEST,
// NU (Nunavut) phần đông dân nằm phía đông Manitoba → EAST.
//
// File này là nguồn duy nhất cho việc chuẩn hoá tỉnh — dùng chung cho cả
// lọc đơn (Active Orders) lẫn export.

export const CA_PROVINCE_MAP: Record<string, string> = {
  "british columbia": "BC",
  "ontario": "ON",
  "quebec": "QC",
  "québec": "QC",
  "alberta": "AB",
  "manitoba": "MB",
  "new brunswick": "NB",
  "nouveau-brunswick": "NB",
  "newfoundland and labrador": "NL",
  "newfoundland": "NL",
  "terre-neuve-et-labrador": "NL",
  "nova scotia": "NS",
  "nouvelle-écosse": "NS",
  "northwest territories": "NT",
  "territoires du nord-ouest": "NT",
  "nunavut": "NU",
  "prince edward island": "PE",
  "île-du-prince-édouard": "PE",
  "saskatchewan": "SK",
  "yukon": "YT",
};

export function normalizeProvince(p: string | null): string {
  if (!p) return "";
  // Strip ký tự khách hay nhầm: dấu chấm, phẩy, nháy, slash...
  // Giữ letter (kể cả tiếng Pháp có dấu), space, dash — dash cần để match
  // tên Pháp như "île-du-prince-édouard" trong CA_PROVINCE_MAP.
  const cleaned = p
    .replace(/[^a-zA-ZÀ-ÿ\s\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  // "B C" / "B.C." → compact "BC" để nhận diện code 2 chữ
  const compact = cleaned.replace(/\s+/g, "");
  if (/^[a-zA-Z]{2}$/.test(compact)) return compact.toUpperCase();
  const lower = cleaned.toLowerCase();
  if (CA_PROVINCE_MAP[lower]) return CA_PROVINCE_MAP[lower];
  return compact.toUpperCase().slice(0, 2);
}

export type Region = "WEST" | "EAST" | "UNKNOWN";

// Mã tỉnh 2 chữ → khu vực.
export const PROVINCE_REGION: Record<string, Exclude<Region, "UNKNOWN">> = {
  // West: kho cũ (BC) lo — BC → Manitoba
  BC: "WEST",
  AB: "WEST",
  SK: "WEST",
  MB: "WEST",
  YT: "WEST",
  NT: "WEST",
  // East: từ Manitoba hất sang
  ON: "EAST",
  QC: "EAST",
  NB: "EAST",
  NS: "EAST",
  PE: "EAST",
  NL: "EAST",
  NU: "EAST",
};

export const REGION_LABELS: Record<Exclude<Region, "UNKNOWN">, string> = {
  WEST: "West (BC–MB)",
  EAST: "East (ON–NL)",
};

/** Phân đơn về khu vực dựa trên tỉnh người nhận. Ngoài Canada / không rõ tỉnh → UNKNOWN. */
export function provinceToRegion(
  province: string | null,
  country?: string | null,
): Region {
  const c = country?.trim();
  if (c && !/^(ca|can|canada)$/i.test(c)) return "UNKNOWN";
  const code = normalizeProvince(province);
  return PROVINCE_REGION[code] ?? "UNKNOWN";
}

/** True nếu chuỗi là một region hợp lệ (dùng để validate query param). */
export function isRegion(v: string | null): v is Region {
  return v === "WEST" || v === "EAST" || v === "UNKNOWN";
}
