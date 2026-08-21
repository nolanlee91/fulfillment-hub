// Cấu hình tab chứa NHIỀU mặt hàng trong 1 kiện.
//
// Một số khách bán 1 nhãn nhưng nhiều biến thể (vd Baku = Retinol Serum + Cream),
// mỗi biến thể 1 CỘT số lượng riêng trên cùng 1 tab. Đơn ship chung 1 kiện/1 label
// nên KHÔNG tách được thành 2 product/2 tab — nhưng tồn kho cần trừ riêng từng loại.
//
// Cách hoạt động: đơn vẫn là product "gốc" (source.productId) để đóng gói/tính hộp;
// parser đọc thêm các cột dưới đây, lưu {variantId: qty} vào orders.item_breakdown;
// lúc import label, tồn kho trừ theo TỪNG variantId (xem lib/inventory).
//
// KEY = productId gốc của tab (source_sheets.product_id).
// header = tên cột trên sheet (so khớp sau khi normalize: lowercase, gộp khoảng trắng).
// variantId = product tồn kho riêng (phải tồn tại trong bảng products).

export interface ItemSplitColumn {
  header: string;
  variantId: string;
}

export const ITEM_SPLIT: Record<string, ItemSplitColumn[]> = {
  baku: [
    { header: "retinol serum", variantId: "baku_serum" },
    { header: "retinol cream", variantId: "baku_cream" },
  ],
};

// Product mà ô số lượng ghi kiểu "N <mô tả combo>" thay vì số thuần — vd THC bán
// theo combo: ô ghi "1 TMS + 1 X2" (= 1 THC), "2 TMS + 2 X2" (= 2 THC). Parser lấy
// SỐ ĐẦU TIÊN làm số lượng thay vì Number(ô) (sẽ ra NaN).
export const QTY_LEADING_NUMBER = new Set<string>(["thc"]);

/** Số lượng từ 1 ô: product combo → lấy số đầu; còn lại → Number thuần (>0). */
export function parseQtyCell(productId: string | undefined, raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (productId && QTY_LEADING_NUMBER.has(productId)) {
    const m = s.match(/\d+/);
    return m ? Number(m[0]) : 0;
  }
  const v = Number(s);
  return !isNaN(v) && v > 0 ? v : 0;
}

/** Chuẩn hoá header giống parser (lowercase, bỏ \n, gộp khoảng trắng). */
export function normSplitHeader(v: string): string {
  return String(v || "")
    .toLowerCase()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
