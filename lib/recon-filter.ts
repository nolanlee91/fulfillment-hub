// Bộ lọc Recon gộp theo pipeline đối soát → hạch toán.
// Dùng chung cho Active Orders + Delivered.
//
// 1 dropdown ánh xạ ra 2 query param độc lập của /api/orders:
//   reconciled = yes|no (khách đã up ảnh/ref chưa)
//   accounted  = yes|no (KDExpress đã ghi sổ chưa)

export type ReconFilter = "" | "unreconciled" | "reconciled_unbooked" | "booked";

export const RECON_FILTER_OPTIONS: { value: ReconFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "unreconciled", label: "Not reconciled" },
  { value: "reconciled_unbooked", label: "Reconciled · not booked" },
  { value: "booked", label: "Booked" },
];

/** Set các query param reconciled/accounted tương ứng với lựa chọn dropdown. */
export function applyReconFilter(params: URLSearchParams, value: string): void {
  switch (value) {
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
      // "" → không lọc
      break;
  }
}
