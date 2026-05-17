"use client";

import { useEffect } from "react";
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
}: {
  order: DrawerOrder | null;
  onClose: () => void;
  role: Role;
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
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          <SectionLabel>Người nhận</SectionLabel>
          <DrawerRow label="Tên">{order.name || "—"}</DrawerRow>
          <DrawerRow label="Địa chỉ">{fullAddress || "—"}</DrawerRow>
          <DrawerRow label="Phone">
            <span className="font-mono">{order.phone || "—"}</span>
          </DrawerRow>

          <SectionLabel>Đơn hàng</SectionLabel>
          {isAdmin && <DrawerRow label="Khách">{order.customerId}</DrawerRow>}
          <DrawerRow label="Sản phẩm">{order.productName}</DrawerRow>
          <DrawerRow label="Số lượng">
            <span className="font-mono font-bold">{order.quantity}</span>
          </DrawerRow>
          <DrawerRow label="Thanh toán">
            <span className="inline-flex items-center gap-2">
              <PaymentBadge method={order.paymentMethod} />
              {order.paymentMethod === "COD" && order.codAmount && (
                <span className="font-mono text-[12px]" style={{ color: "var(--color-warning)" }}>
                  ${order.codAmount}
                </span>
              )}
            </span>
          </DrawerRow>
          {order.note && <DrawerRow label="Ghi chú">{order.note}</DrawerRow>}

          {/* Tracking — luôn hiển thị nếu có */}
          {trackingUrl && (
            <>
              <SectionLabel>Tracking</SectionLabel>
              <DrawerRow label="Số tracking">
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono hover:underline"
                  style={{ color: "var(--accent)" }}
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
              <SectionLabel>Vận hành</SectionLabel>
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
              <SectionLabel>Giao hàng</SectionLabel>
              <div
                className="rounded-lg p-3 text-[12px] leading-relaxed flex items-center gap-2"
                style={{ background: "rgba(74,222,128,0.07)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.14)" }}
              >
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                Giao thành công lúc {fmtDate(order.deliveredAt)}
              </div>
            </>
          )}

          {/* Thất bại / trả về — chỉ show khi status là FAILED hoặc không có status (trang failed) */}
          {(!order.status || order.status === "FAILED") && order.lastTrackingEvent && (
            <>
              <SectionLabel>Lý do thất bại</SectionLabel>
              <div
                className="rounded-lg p-3 text-[12px] leading-relaxed"
                style={{ background: "rgba(249,115,22,0.08)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.2)" }}
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
              <SectionLabel>Lỗi dữ liệu</SectionLabel>
              <div
                className="rounded-lg p-3 text-[12px] leading-relaxed"
                style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                {order.errorNote}
              </div>
            </>
          )}

          {/* Cần chú ý */}
          {order.attentionReason && (order.attentionNote || order.attentionAt) && (
            <>
              <SectionLabel>Cần chú ý</SectionLabel>
              {order.attentionNote && (
                <div
                  className="rounded-lg p-3 text-[12px] leading-relaxed"
                  style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                >
                  {order.attentionNote}
                </div>
              )}
              {order.attentionAt && (
                <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                  Ghi nhận lúc {fmtDate(order.attentionAt)}
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
