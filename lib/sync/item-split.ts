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

/** Chuẩn hoá header giống parser (lowercase, bỏ \n, gộp khoảng trắng). */
export function normSplitHeader(v: string): string {
  return String(v || "")
    .toLowerCase()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
