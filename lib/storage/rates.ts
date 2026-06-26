/**
 * Bảng giá Lưu kho KDExpress (áp dụng từ Tháng 6, 2026).
 * Phase 1 dùng hằng số mặc định; Phase 3 sẽ chuyển sang bảng giá theo từng khách
 * (storage_agreements) seed từ các giá này.
 */
export const STORAGE_RATES = {
  currency: "CAD",
  // Phí nhận/xuất (cả nhập lẫn xuất)
  handling: { perPallet: 10, perUnit: 1 },
  // Phí lưu kho (Phase 3)
  storage: { perPalletPerWeek: 15, perPalletPerMonth: 50 },
  // Dịch vụ phát sinh (Phase 3)
  ancillary: {
    shrinkWrapPerPallet: 10,
    inventoryCountPerHour: 40,
    afterHoursLaborMultiplier: 1.5,
  },
} as const;

export type StorageUom = "PALLET" | "UNIT";

/** Phí nhận/xuất cho 1 chuyển động: nguyên pallet $10, hoặc lẻ $1/unit. */
export function handlingFee(uom: StorageUom, qty: number): number {
  const rate =
    uom === "PALLET" ? STORAGE_RATES.handling.perPallet : STORAGE_RATES.handling.perUnit;
  return rate * Math.max(0, qty);
}
