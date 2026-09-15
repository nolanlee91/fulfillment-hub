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

export interface ClaimableInput {
  serviceType: string | null;
  guaranteedDeliveryDate: string | null;
  deliveredAt: Date | string | null;
}

export interface ClaimAssessment {
  /** Đủ điều kiện xét: dịch vụ có bảo đảm + có mốc cam kết + đã giao. */
  eligible: boolean;
  deliveredDate: string | null;
  /** Số ngày giao muộn hơn cam kết (>0 mới là trễ). */
  daysLate: number;
  isLate: boolean;
  /** Hạn chót nộp claim — quá ngày này thì mất quyền. */
  filingDeadline: string | null;
  /** Hôm nay đã quá hạn nộp chưa. */
  expired: boolean;
  /** Còn mấy ngày lịch nữa tới hạn (âm = đã quá). */
  daysUntilDeadline: number | null;
}

export function assessClaim(
  o: ClaimableInput,
  today: string = new Date().toISOString().slice(0, 10),
): ClaimAssessment {
  const empty: ClaimAssessment = {
    eligible: false,
    deliveredDate: null,
    daysLate: 0,
    isLate: false,
    filingDeadline: null,
    expired: false,
    daysUntilDeadline: null,
  };

  if (o.serviceType !== GUARANTEED_SERVICE) return empty;
  if (!o.guaranteedDeliveryDate) return empty;

  const guaranteed = String(o.guaranteedDeliveryDate).slice(0, 10);
  const filingDeadline = addBusinessDays(guaranteed, CLAIM_WINDOW_BUSINESS_DAYS);
  const daysUntilDeadline = daysBetween(today, filingDeadline);

  if (!o.deliveredAt) {
    // Chưa giao → chưa phát sinh quyền claim giao trễ (đơn thất lạc đi đường khác).
    return {
      ...empty,
      eligible: false,
      filingDeadline,
      expired: daysUntilDeadline < 0,
      daysUntilDeadline,
    };
  }

  const deliveredDate = toLocalDateString(o.deliveredAt);
  const daysLate = daysBetween(guaranteed, deliveredDate);

  return {
    eligible: true,
    deliveredDate,
    daysLate: Math.max(0, daysLate),
    isLate: daysLate > 0,
    filingDeadline,
    expired: daysUntilDeadline < 0,
    daysUntilDeadline,
  };
}
