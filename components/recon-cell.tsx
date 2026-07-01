"use client";

/**
 * Ô "Recon" 2 trạng thái cho bảng đơn:
 *   Đối soát (reconciled, khách up ảnh/ref) / Hạch toán (accounted, KDExpress ghi sổ)
 * - Icon đối soát: read-only (do khách). = đơn có ÍT NHẤT 1 khoản.
 * - Icon hạch toán: = đơn FULLY BOOKED (mọi khoản đã book). STAFF/SUPER_ADMIN bấm
 *   để toggle book/unbook TẤT CẢ khoản (canToggle); book từng khoản riêng làm trong drawer.
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
            ? `Reconciled${order.paymentType ? ` (${order.paymentType})` : ""}`
            : "Not reconciled"
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
              ? `All payments booked${order.accountedBy ? ` (last by ${order.accountedBy})` : ""} — click to unbook all`
              : "Not fully booked — click to book all payments"
          }
        >
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
        </button>
      ) : (
        <span title={accounted ? "Booked" : "Not booked"} className="inline-flex">
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
