"use client";

import { useCallback, useEffect, useState } from "react";
import {
  StatusBadge,
  AttentionBadge,
  PaymentBadge,
  type OrderStatus,
  type AttentionReason,
  type PaymentMethod,
} from "@/components/ui";

type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";

export interface DrawerOrder {
  uniqueKey: string;
  orderId: string;
  customerId: string;
  productName: string;
  name: string;
  addressLine1: string | null;
  city: string;
  province: string | null;
  zipcode: string;
  country: string | null;
  phone: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  codAmount: string | null;
  note?: string | null;
  // Tracking
  trackingNumber: string | null;
  trackingUrl: string | null;
  // Processing-only fields (orders page)
  status?: OrderStatus;
  boxCode?: string | null;
  errorNote?: string | null;
  batchId?: string | null;
  attentionReason?: AttentionReason | null;
  attentionAt?: string | null;
  attentionNote?: string | null;
  // Delivered-specific
  deliveredAt?: string | null;
  // Failed-specific
  lastTrackingEvent?: string | null;
  lastTrackingAt?: string | null;
  // Đối soát (kế toán)
  paymentType?: string | null;
  refNumber?: string | null;
  paymentProofUrl?: string | null;
  reconciledAt?: string | null;
  accountedAt?: string | null;
  accountedBy?: string | null;
}

function buildTrackingUrl(o: Pick<DrawerOrder, "trackingUrl" | "trackingNumber">): string | null {
  if (o.trackingUrl) return o.trackingUrl;
  if (o.trackingNumber) {
    return `https://www.canadapost.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(o.trackingNumber)}`;
  }
  return null;
}

function DrawerRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "" || children === "—") {
    return null;
  }
  return (
    <div className="flex gap-3 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.12em] shrink-0 w-24 pt-0.5"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span className="text-[13px] flex-1 leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {children}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] mt-5 mb-1" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

interface DrawerPayment {
  id: string;
  paymentType: string;
  refNumber: string | null;
  proofUrl: string | null;
  reconciledAt: string;
  accountedAt: string | null;
  accountedBy: string | null;
  createdAt: string;
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  ETF: "ETF",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  MONEY_ORDER: "Money order",
};

function ReconciliationSection({
  order,
  role,
  onUpdate,
}: {
  order: DrawerOrder;
  role: Role;
  onUpdate?: () => void;
}) {
  const isAdmin = role !== "CUSTOMER";
  // Customer up ảnh non-ETF — default "BANK_TRANSFER" gửi API (kiểu chung).
  const paymentType = "BANK_TRANSFER" as const;

  const [payments, setPayments] = useState<DrawerPayment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(order.uniqueKey)}/payments`,
      );
      const data = await res.json();
      if (data.success) setPayments(data.payments);
      else setError(data.error || "Load failed");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [order.uniqueKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleBooked(p: DrawerPayment) {
    setBusyId(p.id);
    setError(null);
    try {
      const next = !p.accountedAt;
      const res = await fetch(
        `/api/orders/${encodeURIComponent(order.uniqueKey)}/payments/${encodeURIComponent(p.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accounted: next }),
        },
      );
      const data = await res.json();
      if (data.success) {
        await load();
        onUpdate?.();
      } else {
        setError(data.error || "Update failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function removePayment(p: DrawerPayment) {
    const what = p.refNumber ? `ref ${p.refNumber}` : "this proof";
    if (!confirm(`Remove ${what}? This cannot be undone.`)) return;
    setBusyId(p.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(order.uniqueKey)}/payments/${encodeURIComponent(p.id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.success) {
        await load();
        onUpdate?.();
      } else {
        setError(data.error || "Delete failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function runUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("paymentType", paymentType);
      fd.append("file", file);
      const res = await fetch(
        `/api/orders/${encodeURIComponent(order.uniqueKey)}/payment-proof`,
        { method: "POST", body: fd },
      );
      const data = await res.json();
      if (data.success) {
        setFile(null);
        await load();
        onUpdate?.();
      } else {
        setError(data.error || "Upload failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const total = payments?.length ?? 0;
  const bookedCount = payments?.filter((p) => p.accountedAt).length ?? 0;

  return (
    <>
      <SectionLabel>
        Reconciliation
        {total > 0 && (
          <span
            className="ml-2 normal-case tracking-normal font-medium"
            style={{ color: bookedCount === total ? "#15803d" : "var(--text-muted)" }}
          >
            · Booked {bookedCount}/{total}
          </span>
        )}
      </SectionLabel>

      {loading && !payments && (
        <p className="text-[12px] py-2" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      )}

      {payments && payments.length === 0 && (
        <DrawerRow label="Status">
          <span style={{ color: "var(--text-muted)" }}>Not reconciled</span>
        </DrawerRow>
      )}

      {payments &&
        payments.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 py-2.5 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            {/* Type + nội dung (ref hoặc ảnh) */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}
              >
                {PAYMENT_TYPE_LABEL[p.paymentType] ?? p.paymentType}
              </span>
              {p.refNumber ? (
                <span className="font-mono text-[12px] truncate" title={p.refNumber}>
                  {p.refNumber}
                </span>
              ) : p.proofUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomUrl(p.proofUrl)}
                  className="inline-flex items-center cursor-zoom-in shrink-0"
                  title="Bấm để phóng to"
                >
                  <img
                    src={p.proofUrl}
                    alt="Payment proof"
                    className="h-9 w-9 object-cover rounded border"
                    style={{ borderColor: "var(--border)" }}
                  />
                </button>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>—</span>
              )}
            </div>

            {/* Booked toggle (admin) / badge (customer) */}
            {isAdmin ? (
              <button
                onClick={() => toggleBooked(p)}
                disabled={busyId === p.id}
                className="inline-flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
                title={p.accountedAt ? `Booked${p.accountedBy ? ` by ${p.accountedBy}` : ""} — click to undo` : "Mark this payment booked"}
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{
                    color: p.accountedAt ? "#16a34a" : "var(--text-muted)",
                    fontVariationSettings: p.accountedAt ? '"FILL" 1' : undefined,
                  }}
                >
                  {p.accountedAt ? "check_circle" : "radio_button_unchecked"}
                </span>
                <span
                  className="text-[11px] font-semibold"
                  style={{ color: p.accountedAt ? "#15803d" : "var(--accent)" }}
                >
                  {busyId === p.id ? "..." : p.accountedAt ? "Booked" : "Book"}
                </span>
              </button>
            ) : p.accountedAt ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] shrink-0"
                style={{ color: "#15803d" }}
              >
                <span
                  className="material-symbols-outlined text-[15px]"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  check_circle
                </span>
                Booked
              </span>
            ) : (
              <span className="text-[11px] shrink-0" style={{ color: "var(--text-muted)" }}>
                Not booked
              </span>
            )}

            {/* Delete (admin) */}
            {isAdmin && (
              <button
                onClick={() => removePayment(p)}
                disabled={busyId === p.id}
                className="inline-flex items-center transition-colors disabled:opacity-50 shrink-0"
                style={{ color: "#dc2626" }}
                title="Remove this payment"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
              </button>
            )}
          </div>
        ))}

      {/* Customer: thêm ảnh chứng từ non-ETF (append). ETF up qua trang Reconciliation. */}
      {role === "CUSTOMER" && (
        <div className="flex items-center gap-2 w-full py-2.5">
          <label
            className="flex-1 cursor-pointer px-3 py-1.5 rounded text-[11px] truncate transition-colors"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              color: file ? "var(--text-primary)" : "var(--text-muted)",
            }}
            title={file?.name ?? "Add payment proof (non-ETF)"}
          >
            {file ? file.name : "Add proof image (non-ETF)"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <button
            onClick={runUpload}
            disabled={!file || uploading}
            className="px-3 py-1.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-40 shrink-0"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            {uploading ? "..." : "Upload"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-[11px]" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}

      {zoomUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.8)", zIndex: 100, cursor: "zoom-out" }}
          onClick={() => setZoomUrl(null)}
        >
          <img
            src={zoomUrl}
            alt="Payment proof"
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function OrderDrawer({
  order,
  onClose,
  role,
  onUpdate,
}: {
  order: DrawerOrder | null;
  onClose: () => void;
  role: Role;
  /** Gọi sau khi drawer thay đổi data (vd upload proof) — parent refetch */
  onUpdate?: () => void;
}) {
  const isAdmin = role !== "CUSTOMER";

  useEffect(() => {
    if (!order) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onClose]);

  if (!order) return null;

  const trackingUrl = buildTrackingUrl(order);
  const fullAddress = [
    order.addressLine1,
    order.city,
    order.province,
    order.zipcode,
    order.country && order.country !== "CA" ? order.country : null,
  ].filter(Boolean).join(", ");

  const hasOpsSection = isAdmin && (order.boxCode || order.batchId);

  return (
    <>
      {/* Backdrop */}
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <aside className="drawer-panel">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {order.orderId}
            </span>
            {order.status && <StatusBadge status={order.status} />}
            {order.attentionReason && <AttentionBadge reason={order.attentionReason} />}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-tertiary)] shrink-0 ml-3"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          <SectionLabel>Recipient</SectionLabel>
          <DrawerRow label="Name">{order.name || "—"}</DrawerRow>
          <DrawerRow label="Address">{fullAddress || "—"}</DrawerRow>
          <DrawerRow label="Phone">
            <span className="font-mono">{order.phone || "—"}</span>
          </DrawerRow>

          <SectionLabel>Order</SectionLabel>
          {isAdmin && <DrawerRow label="Customer">{order.customerId}</DrawerRow>}
          <DrawerRow label="Product">{order.productName}</DrawerRow>
          <DrawerRow label="Quantity">
            <span className="font-mono font-bold">{order.quantity}</span>
          </DrawerRow>
          <DrawerRow label="Payment">
            <span className="inline-flex items-center gap-2">
              <PaymentBadge method={order.paymentMethod} />
              {order.paymentMethod === "COD" && order.codAmount && (
                <span className="font-mono text-[12px]" style={{ color: "var(--color-warning)" }}>
                  ${order.codAmount}
                </span>
              )}
            </span>
          </DrawerRow>
          {order.note && <DrawerRow label="Note">{order.note}</DrawerRow>}

          {/* Tracking — luôn hiển thị nếu có */}
          {trackingUrl && (
            <>
              <SectionLabel>Tracking</SectionLabel>
              <DrawerRow label="Tracking No.">
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tracking-link"
                >
                  {order.trackingNumber ?? "Track"}
                  <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                </a>
              </DrawerRow>
            </>
          )}

          {/* Vận hành (admin) — box + batch, chỉ khi có */}
          {hasOpsSection && (
            <>
              <SectionLabel>Operations</SectionLabel>
              <DrawerRow label="Box">
                {order.boxCode ? (
                  <span
                    className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}
                  >
                    {order.boxCode}
                  </span>
                ) : "—"}
              </DrawerRow>
              <DrawerRow label="Batch">
                {order.batchId ? (
                  <span className="font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {order.batchId}
                  </span>
                ) : "—"}
              </DrawerRow>
            </>
          )}

          {/* Giao hàng thành công */}
          {order.deliveredAt && (
            <>
              <SectionLabel>Delivery</SectionLabel>
              <div
                className="rounded-lg p-3 text-[12px] leading-relaxed flex items-center gap-2"
                style={{ background: "rgba(22, 163, 74, 0.08)", color: "#15803d", border: "1px solid rgba(22, 163, 74, 0.18)" }}
              >
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                Delivered at {fmtDate(order.deliveredAt)}
              </div>
            </>
          )}

          {/* Thất bại / trả về — chỉ show khi status là FAILED hoặc không có status (trang failed) */}
          {(!order.status || order.status === "FAILED") && order.lastTrackingEvent && (
            <>
              <SectionLabel>Failure Reason</SectionLabel>
              <div
                className="rounded-lg p-3 text-[12px] leading-relaxed"
                style={{ background: "rgba(249,115,22,0.08)", color: "#c2410c", border: "1px solid rgba(249,115,22,0.2)" }}
              >
                {order.lastTrackingEvent}
                {order.lastTrackingAt && (
                  <p className="text-[11px] mt-1 opacity-70">{fmtDate(order.lastTrackingAt)}</p>
                )}
              </div>
            </>
          )}

          {/* Lỗi dữ liệu */}
          {order.errorNote && (
            <>
              <SectionLabel>Data Error</SectionLabel>
              <div
                className="rounded-lg p-3 text-[12px] leading-relaxed"
                style={{ background: "rgba(220, 38, 38, 0.08)", color: "#b91c1c", border: "1px solid rgba(220, 38, 38, 0.20)" }}
              >
                {order.errorNote}
              </div>
            </>
          )}

          {/* Reconciliation — show for PREPAID orders. CUSTOMER thấy form upload nếu chưa reconcile */}
          {order.paymentMethod === "PREPAID" && (
            <ReconciliationSection
              order={order}
              role={role}
              onUpdate={onUpdate}
            />
          )}

          {/* Cần chú ý */}
          {order.attentionReason && (order.attentionNote || order.attentionAt) && (
            <>
              <SectionLabel>Attention</SectionLabel>
              {order.attentionNote && (
                <div
                  className="rounded-lg p-3 text-[12px] leading-relaxed"
                  style={{ background: "rgba(251,191,36,0.08)", color: "#a16207", border: "1px solid rgba(251,191,36,0.2)" }}
                >
                  {order.attentionNote}
                </div>
              )}
              {order.attentionAt && (
                <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                  Flagged at {fmtDate(order.attentionAt)}
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t shrink-0" style={{ borderColor: "var(--border)" }}>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Key: <span className="font-mono">{order.uniqueKey}</span>
          </p>
        </div>
      </aside>
    </>
  );
}
