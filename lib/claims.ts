/**
 * Claim giao trễ — quy đổi ngày tháng.
 *
 * Nền tảng: dịch vụ Expedited có bảo đảm giao đúng hạn, đo theo CHUẨN GIAO CÔNG BỐ
 * (không phải theo ngày dự kiến hiển thị trên trang tra cứu — carrier tự dời số đó
 * mỗi khi họ trễ). Mốc mình dùng là `orders.guaranteed_delivery_date`: ngày cam kết
 * BẮT ĐƯỢC LẦN ĐẦU từ feed rồi khoá lại, xem lib/carrier-tracking/processor.ts.
 *
 * Hạn nộp: 30 ngày làm việc kể từ ngày cam kết. Nộp trễ một ngày cũng bị từ chối.
 */

/** Chỉ dịch vụ này mới có bảo đảm giao đúng hạn — Regular không có. */
export const GUARANTEED_SERVICE = "Expedited Parcels";

export const CLAIM_WINDOW_BUSINESS_DAYS = 30;

/**
 * Giờ dùng để quy `delivered_at` (UTC) về ngày lịch địa phương.
 *
 * Feed cho timestamp kèm múi giờ nơi quét, parser đã quy về UTC nên ngày lịch gốc
 * không còn. Lấy -7 (giờ miền Tây) là lựa chọn THẬN TRỌNG: nó cho ra ngày sớm
 * nhất có thể, nên đơn nào bị kết luận "trễ" thì trễ ở mọi múi giờ — không claim oan.
 * Đổi lại, kiện miền Đông giao lúc rạng sáng có thể bị tính lùi 1 ngày (bỏ sót,
 * không phải sai). Lệch 1 giờ giữa mùa hè/đông không đủ đổi kết quả.
 */
const CONSERVATIVE_TZ_OFFSET_HOURS = 7;

/** Timestamp UTC → "YYYY-MM-DD" theo múi giờ thận trọng. */
export function toLocalDateString(ts: Date | string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return new Date(d.getTime() - CONSERVATIVE_TZ_OFFSET_HOURS * 3600_000)
    .toISOString()
    .slice(0, 10);
}

/** Cộng n ngày LÀM VIỆC vào 1 ngày "YYYY-MM-DD" (bỏ T7/CN, không tính ngày lễ). */
export function addBusinessDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

/** Số ngày lịch giữa 2 ngày "YYYY-MM-DD" (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Số ngày LÀM VIỆC từ a tới b (không tính ngày a, có tính ngày b). Âm nếu b < a.
 * Nghịch đảo của addBusinessDays: businessDaysBetween(d, addBusinessDays(d, n)) === n.
 *
 * Cả hạn nộp lẫn chuẩn giao đều tính bằng ngày làm việc → đếm ngược cũng phải
 * cùng đơn vị, nếu không sẽ ra cảnh "hạn 30 ngày mà còn 38 ngày".
 */
export function businessDaysBetween(a: string, b: string): number {
  if (a === b) return 0;
  const forward = a < b;
  const from = new Date(`${forward ? a : b}T00:00:00Z`);
  const to = new Date(`${forward ? b : a}T00:00:00Z`);
  let count = 0;
  const cur = new Date(from);
  while (cur < to) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const w = cur.getUTCDay();
    if (w !== 0 && w !== 6) count++;
  }
  return forward ? count : -count;
}

export interface ClaimableInput {
  serviceType: string | null;
  guaranteedDeliveryDate: string | null;
  deliveredAt: Date | string | null;
  /**
   * Ngày carrier mang hàng tới lần đầu — MỐC ĐO THẬT (chuẩn giao đo tới "first
   * delivery attempt"). Thiếu thì tạm lùi về deliveredAt, nhưng khi đó kết quả
   * KHÔNG đáng tin: xem `measuredFrom` trong kết quả.
   */
  firstAttemptDate?: string | null;
}

export interface ClaimAssessment {
  /** Đủ điều kiện xét: dịch vụ có bảo đảm + có mốc cam kết + đã giao. */
  eligible: boolean;
  deliveredDate: string | null;
  /** Số ngày LỊCH giao muộn hơn cam kết (>0 mới là trễ) — cái người nhận cảm nhận. */
  daysLate: number;
  /**
   * Số ngày LÀM VIỆC trễ — dùng để xếp ưu tiên nộp. Đơn vắt qua cuối tuần trông
   * nặng theo ngày lịch nhưng thực chất chỉ trễ 1 ngày làm việc, khả năng bị từ
   * chối cao, không nên nộp trước mấy đơn trễ nặng.
   */
  businessDaysLate: number;
  isLate: boolean;
  /** Hạn chót nộp claim — quá ngày này thì mất quyền. */
  filingDeadline: string | null;
  /** Hôm nay đã quá hạn nộp chưa. */
  expired: boolean;
  /** Còn mấy ngày LÀM VIỆC nữa tới hạn (âm = đã quá) — cùng đơn vị với quy định. */
  businessDaysUntilDeadline: number | null;
  /**
   * Mốc đã dùng để đo trễ:
   *   "attempt"   — ngày carrier mang hàng tới. ĐÚNG, nộp claim được.
   *   "delivered" — không có dữ liệu lần giao đầu, phải tạm lấy ngày hàng được
   *                 nhận. CÓ THỂ TRỄ OAN nếu khách ra bưu cục lấy muộn → phải
   *                 tự kiểm tra lịch sử tracking trước khi nộp.
   */
  measuredFrom: "attempt" | "delivered" | null;
  /** Ngày dùng làm mốc đo (theo measuredFrom). */
  measuredDate: string | null;
}

export function assessClaim(
  o: ClaimableInput,
  today: string = new Date().toISOString().slice(0, 10),
): ClaimAssessment {
  const empty: ClaimAssessment = {
    eligible: false,
    deliveredDate: null,
    daysLate: 0,
    businessDaysLate: 0,
    isLate: false,
    filingDeadline: null,
    expired: false,
    businessDaysUntilDeadline: null,
    measuredFrom: null,
    measuredDate: null,
  };

  if (o.serviceType !== GUARANTEED_SERVICE) return empty;
  if (!o.guaranteedDeliveryDate) return empty;

  const guaranteed = String(o.guaranteedDeliveryDate).slice(0, 10);
  const filingDeadline = addBusinessDays(guaranteed, CLAIM_WINDOW_BUSINESS_DAYS);
  const businessDaysUntilDeadline = businessDaysBetween(today, filingDeadline);
  const expired = today > filingDeadline;

  if (!o.deliveredAt) {
    // Chưa giao → chưa phát sinh quyền claim giao trễ (đơn thất lạc đi đường khác).
    return {
      ...empty,
      eligible: false,
      filingDeadline,
      expired,
      businessDaysUntilDeadline,
    };
  }

  const deliveredDate = toLocalDateString(o.deliveredAt);

  // Đo tới LẦN GIAO ĐẦU TIÊN, không phải lúc hàng được nhận. Carrier để giấy báo
  // đúng hẹn rồi khách 5 ngày sau mới ra bưu cục lấy → carrier KHÔNG trễ.
  const measuredFrom = o.firstAttemptDate ? "attempt" : "delivered";
  const measuredDate = o.firstAttemptDate ?? deliveredDate;
  const daysLate = daysBetween(guaranteed, measuredDate);

  return {
    eligible: true,
    deliveredDate,
    daysLate: Math.max(0, daysLate),
    businessDaysLate: Math.max(0, businessDaysBetween(guaranteed, measuredDate)),
    isLate: daysLate > 0,
    filingDeadline,
    expired,
    businessDaysUntilDeadline,
    measuredFrom,
    measuredDate,
  };
}
