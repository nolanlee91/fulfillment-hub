"use client";

/**
 * Ô "Recon" 2 trạng thái cho bảng đơn:
 *   Đối soát (reconciled, khách up ảnh/ref) / Hạch toán (accounted, KDExpress ghi sổ)
 * - Icon đối soát: read-only (do khách).
 * - Icon hạch toán: STAFF/SUPER_ADMIN bấm để toggle (canToggle); CUSTOMER chỉ xem.
 */
export function ReconCell({
  order,
  canToggle,
  onToggleAccounted,
}: {
  order: {
    reconciledAt: string | null;
    paymentType?: string | null;
    accountedAt: string | null;
    accountedBy?: string | null;
  };
  canToggle: boolean;
  onToggleAccounted: () => void;
}) {
  const reconciled = !!order.reconciledAt;
  const accounted = !!order.accountedAt;

  return (
    <div className="flex items-center justify-center gap-1">
      {/* Đối soát */}
      <span
        title={
          reconciled
            ? `Đã đối soát${order.paymentType ? ` (${order.paymentType})` : ""}`
            : "Chưa đối soát"
        }
        className="inline-flex"
      >
        {reconciled ? (
          <span
            className="material-symbols-outlined text-[17px]"
            style={{ color: "#16a34a", fontVariationSettings: '"FILL" 1' }}
          >
            check_circle
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </span>

      <span style={{ color: "var(--text-muted)" }}>/</span>

      {/* Hạch toán */}
      {canToggle ? (
        <button
          onClick={onToggleAccounted}
          className="inline-flex items-center transition-opacity hover:opacity-70"
          title={
            accounted
              ? `Đã hạch toán${order.accountedBy ? ` bởi ${order.accountedBy}` : ""} — bấm để bỏ`
              : "Chưa hạch toán — bấm để đánh dấu"
          }
        >
          <span
            className="material-symbols-outlined text-[17px]"
            style={{
              color: accounted ? "#16a34a" : "var(--text-muted)",
              fontVariationSettings: accounted ? '"FILL" 1' : undefined,
            }}
          >
            {accounted ? "check_circle" : "radio_button_unchecked"}
          </span>
        </button>
      ) : (
        <span title={accounted ? "Đã hạch toán" : "Chưa hạch toán"} className="inline-flex">
          {accounted ? (
            <span
              className="material-symbols-outlined text-[17px]"
              style={{ color: "#16a34a", fontVariationSettings: '"FILL" 1' }}
            >
              check_circle
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )}
        </span>
      )}
    </div>
  );
}
