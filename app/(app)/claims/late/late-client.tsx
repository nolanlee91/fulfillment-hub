"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { Dropdown } from "@/components/ui/dropdown";
import { Button, FilterBar, FilterField } from "@/components/ui";

type ClaimStatus = "FILED" | "APPROVED" | "REJECTED" | null;

interface ClaimRow {
  uniqueKey: string;
  orderId: string;
  customerId: string;
  customerName: string | null;
  productName: string | null;
  name: string | null;
  city: string | null;
  province: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  guaranteedDeliveryDate: string | null;
  eddCurrent: string | null;
  eddChangeCount: number;
  deliveredAt: string | null;
  claimStatus: ClaimStatus;
  claimAmount: string | null;
  claimNote: string | null;
  claim: {
    deliveredDate: string | null;
    daysLate: number;
    filingDeadline: string | null;
    expired: boolean;
    daysUntilDeadline: number | null;
  };
}

interface Totals {
  count: number;
  totalDaysLate: number;
  notFiled: number;
  filed: number;
  approved: number;
  rejected: number;
  recovered: number;
}

interface FilterOption {
  id: string;
  name: string;
}

function trackingLink(o: ClaimRow): string | null {
  if (o.trackingUrl) return o.trackingUrl;
  if (o.trackingNumber) {
    return `https://www.canadapost.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(o.trackingNumber)}`;
  }
  return null;
}

/** Hạn càng gần càng đỏ — quá hạn là mất trắng nên phải đập vào mắt. */
function deadlineColor(days: number | null): string {
  if (days === null) return "var(--text-secondary)";
  if (days < 0) return "var(--text-muted)";
  if (days <= 3) return "var(--color-red, #dc2626)";
  if (days <= 7) return "var(--color-orange, #ea580c)";
  return "var(--text-secondary)";
}

const STATUS_LABEL: Record<string, string> = {
  none: "Not filed",
  FILED: "Filed",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  none: { bg: "rgba(100,116,139,0.10)", text: "#475569" },
  FILED: { bg: "rgba(37,99,235,0.10)", text: "#1d4ed8" },
  APPROVED: { bg: "rgba(13,148,136,0.12)", text: "#0f766e" },
  REJECTED: { bg: "rgba(220,38,38,0.10)", text: "#b91c1c" },
};

export default function LateClaimsClient() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [customers, setCustomers] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterWindow, setFilterWindow] = useState("open");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("window", filterWindow);
    if (filterCustomer) params.set("customer", filterCustomer);
    if (filterStatus) params.set("status", filterStatus);
    try {
      const res = await fetch(`/api/claims/late?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.orders);
        setTotals(data.totals);
      } else {
        setMessage(data.error ?? "Không tải được danh sách");
      }
    } finally {
      setLoading(false);
    }
  }, [filterCustomer, filterStatus, filterWindow]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setCustomers(d.data ?? []);
      })
      .catch(() => {});
  }, []);

  async function setStatus(o: ClaimRow, next: ClaimStatus) {
    let amount: string | null = null;
    if (next === "APPROVED") {
      const input = window.prompt(
        `Đơn ${o.orderId} — số tiền cước được hoàn (CAD):`,
        o.claimAmount ?? "",
      );
      if (input === null) return;
      const n = Number(input.replace(",", "."));
      if (isNaN(n) || n < 0) {
        setMessage("Số tiền không hợp lệ");
        return;
      }
      amount = String(n);
    }

    setSaving(o.uniqueKey);
    try {
      const res = await fetch(`/api/claims/${encodeURIComponent(o.uniqueKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimStatus: next, claimAmount: amount }),
      });
      const data = await res.json();
      setMessage(data.success ? data.message : (data.error ?? "Lỗi"));
      if (data.success) await load();
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Topbar
        title="Late Deliveries"
        subtitle="Claims"
        description="Đơn giao chậm hơn ngày nhà vận chuyển cam kết — đòi lại tiền cước. Hạn nộp 30 ngày làm việc kể từ ngày cam kết."
        showSync={false}
      />

      <FilterBar className="grid gap-3 grid-cols-4">
        <FilterField label="Customer">
          <Dropdown
            value={filterCustomer}
            onChange={setFilterCustomer}
            options={[
              { value: "", label: "All" },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </FilterField>
        <FilterField label="Claim status">
          <Dropdown
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: "", label: "All" },
              { value: "none", label: "Not filed" },
              { value: "FILED", label: "Filed" },
              { value: "APPROVED", label: "Approved" },
              { value: "REJECTED", label: "Rejected" },
            ]}
          />
        </FilterField>
        <FilterField label="Filing window">
          <Dropdown
            value={filterWindow}
            onChange={setFilterWindow}
            options={[
              { value: "open", label: "Còn hạn nộp" },
              { value: "expired", label: "Đã quá hạn" },
              { value: "all", label: "Tất cả" },
            ]}
          />
        </FilterField>
        <FilterField label="&nbsp;">
          <Button variant="secondary" icon="refresh" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </FilterField>
      </FilterBar>

      {totals && (
        <div className="action-bar">
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <span className="font-bold">{totals.count}</span> đơn giao trễ
            <span style={{ color: "var(--text-muted)" }}>
              {" "}· tổng {totals.totalDaysLate} ngày trễ
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
            <span>Chưa nộp: <b>{totals.notFiled}</b></span>
            <span>Đã nộp: <b>{totals.filed}</b></span>
            <span>Được duyệt: <b>{totals.approved}</b></span>
            <span>Từ chối: <b>{totals.rejected}</b></span>
            {totals.recovered > 0 && (
              <span style={{ color: "var(--color-teal, #0f766e)" }}>
                Đã đòi lại: <b>${totals.recovered.toFixed(2)}</b>
              </span>
            )}
          </div>
        </div>
      )}

      {message && (
        <div
          className="mx-4 mb-3 px-3 py-2 rounded text-sm"
          style={{ background: "rgba(37,99,235,0.08)", color: "#1d4ed8" }}
        >
          {message}
        </div>
      )}

      <div className="table-shell">
        {loading ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Không có đơn trễ nào trong bộ lọc này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Order ID</th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Customer</th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Recipient</th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Tracking</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Promised</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Delivered</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Days late</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Date moved</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">File by</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Claim</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const key = o.claimStatus ?? "none";
                  const style = STATUS_STYLE[key];
                  const link = trackingLink(o);
                  return (
                    <tr key={o.uniqueKey}>
                      <td className="px-3 py-3 text-sm font-semibold">{o.orderId}</td>
                      <td className="px-3 py-3 text-sm">{o.customerName ?? o.customerId}</td>
                      <td className="px-3 py-3 text-sm">
                        <div>{o.name}</div>
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {[o.city, o.province].filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {link ? (
                          <a href={link} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                            {o.trackingNumber}
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-center">{o.guaranteedDeliveryDate}</td>
                      <td className="px-3 py-3 text-sm text-center">{o.claim.deliveredDate}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-bold" style={{ color: "var(--color-red, #dc2626)" }}>
                          +{o.claim.daysLate}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                        {o.eddChangeCount > 0 ? `${o.eddChangeCount}×` : "—"}
                      </td>
                      <td className="px-3 py-3 text-center text-xs">
                        <div style={{ color: deadlineColor(o.claim.daysUntilDeadline) }}>
                          {o.claim.filingDeadline}
                        </div>
                        <div style={{ color: "var(--text-muted)" }}>
                          {o.claim.daysUntilDeadline !== null && o.claim.daysUntilDeadline >= 0
                            ? `còn ${o.claim.daysUntilDeadline} ngày`
                            : "quá hạn"}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-[11px] font-bold"
                            style={{ background: style.bg, color: style.text }}
                          >
                            {STATUS_LABEL[key]}
                            {o.claimStatus === "APPROVED" && o.claimAmount
                              ? ` $${Number(o.claimAmount).toFixed(2)}`
                              : ""}
                          </span>
                          <Dropdown
                            value={o.claimStatus ?? ""}
                            onChange={(v) => setStatus(o, (v || null) as ClaimStatus)}
                            options={[
                              { value: "", label: "Not filed" },
                              { value: "FILED", label: "Filed" },
                              { value: "APPROVED", label: "Approved" },
                              { value: "REJECTED", label: "Rejected" },
                            ]}
                            className={saving === o.uniqueKey ? "opacity-50 pointer-events-none" : ""}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
