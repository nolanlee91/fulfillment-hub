// Bộ lọc Recon gộp theo pipeline đối soát → hạch toán, tách thêm trục ETF/non-ETF.
// Dùng chung cho Active Orders + Delivered.
//
// 1 lựa chọn ánh xạ ra tối đa 3 query param của /api/orders:
//   reconciled = yes|no   (đơn có ÍT NHẤT 1 khoản thanh toán chưa)
//   accounted  = yes|no   (đơn FULLY BOOKED — mọi khoản đã ghi sổ — hay chưa)
//   recpay     = ETF|NON_ETF (đơn có khoản loại ETF / non-ETF — EXISTS trên order_payments)
//
// Value scheme: "<base>" hoặc "<base>:<type>" với type = etf|nonetf.
//   base: "" | unreconciled | reconciled_unbooked | booked

export type ReconFilter = string;

/** Cấu trúc menu (dùng cho dropdown có submenu hover). */
export interface ReconMenuNode {
  value: string; // chọn trực tiếp node này
  label: string;
  children?: { value: string; label: string }[]; // submenu ETF/non-ETF
}

export const RECON_MENU: ReconMenuNode[] = [
  { value: "", label: "All" },
  { value: "unreconciled", label: "Not reconciled" },
  {
    value: "reconciled_unbooked",
    label: "Reconciled · not booked",
    children: [
      { value: "reconciled_unbooked", label: "All types" },
      { value: "reconciled_unbooked:etf", label: "ETF" },
      { value: "reconciled_unbooked:nonetf", label: "non-ETF" },
    ],
  },
  {
    value: "booked",
    label: "Booked",
    children: [
      { value: "booked", label: "All types" },
      { value: "booked:etf", label: "ETF" },
      { value: "booked:nonetf", label: "non-ETF" },
    ],
  },
];

const BASE_LABEL: Record<string, string> = {
  "": "All",
  unreconciled: "Not reconciled",
  reconciled_unbooked: "Reconciled · not booked",
  booked: "Booked",
};

const TYPE_LABEL: Record<string, string> = {
  etf: "ETF",
  nonetf: "non-ETF",
};

/** Nhãn hiển thị cho 1 value (vd "booked:etf" → "Booked — ETF"). */
export function reconFilterLabel(value: string): string {
  const [base, type] = value.split(":");
  const baseLabel = BASE_LABEL[base] ?? "All";
  return type ? `${baseLabel} — ${TYPE_LABEL[type] ?? type}` : baseLabel;
}

/** Set các query param reconciled/accounted/recpay tương ứng với lựa chọn. */
export function applyReconFilter(params: URLSearchParams, value: string): void {
  const [base, type] = value.split(":");
  switch (base) {
    case "unreconciled":
      params.set("reconciled", "no");
      break;
    case "reconciled_unbooked":
      params.set("reconciled", "yes");
      params.set("accounted", "no");
      break;
    case "booked":
      params.set("accounted", "yes");
      break;
    default:
      break;
  }
  if (type === "etf") params.set("recpay", "ETF");
  else if (type === "nonetf") params.set("recpay", "NON_ETF");
}
