"use client";

import { useEffect, useState } from "react";
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

function ReconciliationSection({
  order,
  role,
  onUpdate,
}: {
  order: DrawerOrder;
  role: Role;
  onUpdate?: () => void;
}) {
  // Customer chỉ upload ảnh — không phân biệt type ở UI. Default "BANK_TRANSFER" gửi API
  // để admin biết kiểu chung (có thể đổi thủ công nếu cần audit sau).
  const paymentType = "BANK_TRANSFER" as const;
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hạch toán (accounted) — local override sau khi toggle để view cập nhật ngay.
  const [localAccountedAt, setLocalAccountedAt] = useState<string | null | undefined>(undefined);
  const [accBusy, setAccBusy] = useState(false);
  // Lightbox zoom ảnh chứng từ (không mở link ngoài).
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  /** Local override sau khi upload/delete trong drawer hiện tại — để view refresh ngay không cần F5/reopen. */
  const [localState, setLocalState] = useState<{
    paymentType: string | null;
    paymentProofUrl: string | null;
    refNumber: string | null;
    reconciledAt: string | null;
  } | null>(null);

  // Effective values: local override (nếu user vừa upload/delete) hoặc prop từ parent
  const eff = localState ?? {
    paymentType: order.paymentType ?? null,
    paymentProofUrl: order.paymentProofUrl ?? null,
    refNumber: order.refNumber ?? null,
    reconciledAt: order.reconciledAt ?? null,
  };
  const reconciled = !!(eff.refNumber || eff.paymentProofUrl || eff.reconciledAt);
  const effAccountedAt =
    localAccountedAt !== undefined ? localAccountedAt : order.accountedAt ?? null;

  async function toggleAccounted() {
    setAccBusy(true);
    setError(null);
    try {
      const next = !effAccountedAt;
      const res = await fetch(`/api/orders/${encodeURIComponent(order.uniqueKey)}/accounted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounted: next }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalAccountedAt(data.accountedAt);
        onUpdate?.();
      } else {
        setError(data.error || "Update failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAccBusy(false);
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
      const res = await fetch(`/api/orders/${encodeURIComponent(order.uniqueKey)}/payment-proof`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setFile(null);
        setLocalState({
          paymentType: data.paymentType,
          paymentProofUrl: data.paymentProofUrl,
          refNumber: null,
          reconciledAt: data.reconciledAt,
        });
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

  async function runDelete() {
    if (!confirm("Remove reconciliation for this order? Proof image will be deleted.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.uniqueKey)}/payment-proof`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setLocalState({
          paymentType: null,
          paymentProofUrl: null,
          refNumber: null,
          reconciledAt: null,
        });
        onUpdate?.();
      } else {
        setError(data.error || "Delete failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  // Đã reconciled — 2 line gọn: ETF (ref) + Non-ETF (proof image)
  if (reconciled) {
    const isAdmin = role !== "CUSTOMER";
    return (
      <>
        <SectionLabel>Reconciliation</SectionLabel>
        <DrawerRow label="ETF">
          {eff.refNumber ? (
            <span className="font-mono">{eff.refNumber}</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )}
        </DrawerRow>
        <DrawerRow label="Non-ETF">
          {eff.paymentProofUrl ? (
            <button
              type="button"
              onClick={() => setZoomUrl(eff.paymentProofUrl)}
              className="inline-flex items-center gap-2 cursor-zoom-in"
              title="Bấm để phóng to"
            >
              <img
                src={eff.paymentProofUrl}
                alt="Payment proof"
                className="h-10 w-10 object-cover rounded border"
                style={{ borderColor: "var(--border)" }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {eff.paymentType ?? ""}
              </span>
            </button>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>—</span>
          )}
        </DrawerRow>
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
        <DrawerRow label="Booked">
          {isAdmin ? (
            <button
              onClick={toggleAccounted}
              disabled={accBusy}
              className="inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Mark this order as booked"
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{
                  color: effAccountedAt ? "#16a34a" : "var(--text-muted)",
                  fontVariationSettings: effAccountedAt ? '"FILL" 1' : undefined,
                }}
              >
                {effAccountedAt ? "check_circle" : "radio_button_unchecked"}
              </span>
              <span
                className="text-[12px] font-semibold"
                style={{ color: effAccountedAt ? "#15803d" : "var(--accent)" }}
              >
                {accBusy ? "..." : effAccountedAt ? "Booked" : "Mark booked"}
              </span>
            </button>
          ) : effAccountedAt ? (
            <span className="inline-flex items-center gap-1" style={{ color: "#15803d" }}>
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ fontVariationSettings: '"FILL" 1' }}
              >
                check_circle
              </span>
              Booked
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Not booked</span>
          )}
        </DrawerRow>
        {isAdmin && (
          <div className="py-1">
            <button
              onClick={runDelete}
              disabled={deleting}
              className="text-[11px] inline-flex items-center gap-1 transition-colors disabled:opacity-50"
              style={{ color: "#dc2626" }}
            >
              <span className="material-symbols-outlined text-[13px]">delete</span>
              {deleting ? "Removing..." : "Remove"}
            </button>
            {error && (
              <span className="ml-2 text-[11px]" style={{ color: "#dc2626" }}>
                {error}
              </span>
            )}
          </div>
        )}
      </>
    );
  }

  // Chưa reconciled — CUSTOMER thấy 2 line: ETF (read-only —) + Non-ETF (file picker + Upload inline)
  if (role === "CUSTOMER") {
    return (
      <>
        <SectionLabel>Reconciliation</SectionLabel>
        <DrawerRow label="ETF">
          <span style={{ color: "var(--text-muted)" }}>—</span>
        </DrawerRow>
        <DrawerRow label="Non-ETF">
          <div className="flex items-center gap-2 w-full">
            <label
              className="flex-1 cursor-pointer px-3 py-1.5 rounded text-[11px] truncate transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                color: file ? "var(--text-primary)" : "var(--text-muted)",
              }}
              title={file?.name}
            >
              {file ? file.name : "Choose file"}
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
          {error && (
            <p className="mt-1 text-[10px]" style={{ color: "#dc2626" }}>
              {error}
            </p>
          )}
        </DrawerRow>
      </>
    );
  }

  // STAFF/SUPER_ADMIN, chưa reconciled — không hiện gì (để section gọn cho phần kế toán xem)
  return null;
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
