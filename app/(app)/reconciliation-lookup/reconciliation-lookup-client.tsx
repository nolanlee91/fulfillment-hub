"use client";

import { useState, useEffect } from "react";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";
import { Dropdown } from "@/components/ui/dropdown";

interface Match {
  paymentId: string;
  refNumber: string;
  orderId: string;
  uniqueKey: string;
  customerId: string;
  customerName: string | null;
  name: string;
  quantity: number;
  paymentMethod: "PREPAID" | "COD";
  paymentType: string | null;
  codAmount: string | null;
  reconciledAt: string | null;
  accountedAt: string | null;
  status: string;
  matchBy: "REF" | "ORDER" | "TRACKING";
}

interface LookupResult {
  totalInput: number;
  matched: Match[];
  unmatched: string[];
}

/**
 * Parse paste content: tách theo DÒNG / phẩy / chấm phẩy / tab (KHÔNG theo dấu cách).
 * Mỗi đoạn lấy TOKEN ĐẦU làm mã (bỏ ghi chú/tên thừa phía sau trên cùng dòng, vd
 * "CAV3F2nK Emi" → "CAV3F2nK"). Trim, dedup.
 */
function parseRefs(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n\r,;\t]+/)
        .map((seg) => seg.trim().split(/\s+/)[0] ?? "")
        .map((r) => r.trim())
        .filter((r) => r.length > 0),
    ),
  );
}

export default function ReconciliationLookupClient() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookMsg, setBookMsg] = useState<string | null>(null);

  // Báo cáo "đơn chờ book" theo khách
  const [custList, setCustList] = useState<{ id: string; name: string }[]>([]);
  const [reportCust, setReportCust] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch("/api/orders", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (d.success) setCustList(d.data.customers); })
      .catch(() => {});
  }, []);

  async function exportReport() {
    if (!reportCust) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/reconciliation/report?customer=${encodeURIComponent(reportCust)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Unknown error" }));
        alert("Xuất báo cáo lỗi: " + (d.error || res.statusText));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : "cho-book.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const refs = parseRefs(input);

  async function runLookup() {
    if (refs.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setBookMsg(null);
    try {
      const res = await fetch("/api/reconciliation/lookup-refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refNumbers: refs }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || "Lookup failed");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function bookAll() {
    if (!result || result.matched.length === 0) return;
    const unbooked = result.matched.filter((m) => !m.accountedAt);
    const already = result.matched.length - unbooked.length;
    if (unbooked.length === 0) {
      setBookMsg("Tất cả giao dịch tìm thấy đều đã được book trước đó.");
      return;
    }
    const msg =
      already > 0
        ? `Đã có ${already} giao dịch được book trước đó (sẽ bỏ qua).\nBook ${unbooked.length} giao dịch còn lại?`
        : `Book ${unbooked.length} giao dịch đã tìm thấy?`;
    if (!confirm(msg)) return;

    setBooking(true);
    setError(null);
    setBookMsg(null);
    try {
      const res = await fetch("/api/reconciliation/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIds: unbooked.map((m) => m.paymentId) }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Book failed");
        return;
      }
      const doneMsg =
        `Đã book ${data.booked} giao dịch` +
        (data.alreadyBooked ? ` (bỏ qua ${data.alreadyBooked} đã book)` : "");
      await runLookup(); // refresh để cập nhật cột Booked (runLookup tự xoá bookMsg)
      setBookMsg(doneMsg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBooking(false);
    }
  }

  return (
    <>
      <Topbar title="Payment Lookup" subtitle="Verify customer reconciliation against bank refs" />

      <Card padding="lg" className="mb-4">
        <h3 className="font-bold text-lg mb-1">Xuất báo cáo đơn chờ book</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Chọn khách → xuất Excel các khoản đã có bằng chứng (khách up ref/ảnh) nhưng CHƯA book. Cột "Bằng chứng": ETF ghi mã ref; non-ETF là link "Xem ảnh" bấm mở được.
        </p>
        <div className="flex items-end gap-3">
          <div style={{ minWidth: 260 }}>
            <label className="text-[11px] font-bold tracking-widest uppercase block mb-2" style={{ color: "var(--text-muted)" }}>
              Khách hàng
            </label>
            <Dropdown
              value={reportCust}
              onChange={setReportCust}
              options={[
                { value: "", label: "— Chọn khách —" },
                ...custList.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <Button icon="download" onClick={exportReport} disabled={!reportCust || exporting}>
            {exporting ? "Đang xuất..." : "Xuất báo cáo"}
          </Button>
        </div>
      </Card>

      <Card padding="lg" className="mb-4">
        <h3 className="font-bold text-lg mb-1">Find orders by Ref Number</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Paste Ref Numbers (from bank email) or Order IDs — one per line (or separated by comma / semicolon). Extra text after the code on a line is ignored. The app returns matching reconciled orders (by bank ref, or by order ID for non-ETF proofs) + a list of codes that don't match anything yet.
        </p>

        <label className="text-[11px] font-bold tracking-widest uppercase block mb-2" style={{ color: "var(--text-muted)" }}>
          Ref Numbers
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          rows={6}
          placeholder={"REF20260529001\nREF20260529002\nREF20260529003"}
          className="w-full px-3 py-2.5 rounded text-sm font-mono"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            resize: "vertical",
          }}
        />
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          Parsed: <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{refs.length}</span> unique ref{refs.length === 1 ? "" : "s"}
        </p>

        <Button
          variant="primary"
          icon="search"
          onClick={runLookup}
          disabled={refs.length === 0 || loading}
          className="mt-4"
        >
          {loading ? "Searching..." : `Search ${refs.length} ref${refs.length === 1 ? "" : "s"}`}
        </Button>

        {error && (
          <div
            className="mt-4 px-4 py-2.5 rounded text-sm font-semibold"
            style={{ backgroundColor: "rgba(220, 38, 38, 0.10)", color: "#dc2626" }}
          >
            {error}
          </div>
        )}
      </Card>

      {result && (
        <>
          <Card padding="lg" className="mb-4">
            <h3 className="font-bold text-lg mb-4">Results</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Stat label="Input" value={result.totalInput} accent="slate" hint="Unique refs searched" />
              <Stat label="Matched" value={result.matched.length} accent="emerald" hint="Customers have reconciled" />
              <Stat label="Unmatched" value={result.unmatched.length} accent="red" hint="No customer mapped yet" />
            </div>
          </Card>

          {result.matched.length > 0 && (
            <Card padding="lg" className="mb-4">
              {(() => {
                const bookedCount = result.matched.filter((m) => m.accountedAt).length;
                const unbookedCount = result.matched.length - bookedCount;
                return (
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div>
                      <h3 className="font-bold text-lg">Matched orders ({result.matched.length})</h3>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {bookedCount} đã book · {unbookedCount} chưa book
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      icon="check_circle"
                      onClick={bookAll}
                      disabled={booking || unbookedCount === 0}
                    >
                      {booking
                        ? "Đang book…"
                        : unbookedCount === 0
                          ? "Đã book hết"
                          : `Book ${unbookedCount} giao dịch`}
                    </Button>
                  </div>
                );
              })()}
              {bookMsg && (
                <div
                  className="mb-3 px-4 py-2.5 rounded text-sm font-semibold"
                  style={{ backgroundColor: "rgba(74, 222, 128, 0.10)", color: "#15803d" }}
                >
                  {bookMsg}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-left text-[11px] font-bold tracking-widest uppercase"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <th className="py-2 pr-3">Ref Number</th>
                      <th className="py-2 pr-3">Order ID</th>
                      <th className="py-2 pr-3">Matched by</th>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Recipient</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Reconciled</th>
                      <th className="py-2 pr-3">Booked</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matched.map((m) => (
                      <tr key={m.uniqueKey} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2 pr-3 font-mono text-[12px]">{m.refNumber ?? "—"}</td>
                        <td className="py-2 pr-3 font-mono text-[12px]">{m.orderId}</td>
                        <td className="py-2 pr-3 text-[11px]">
                          {m.matchBy === "REF" ? (
                            <span style={{ color: "var(--text-secondary)" }}>Bank ref</span>
                          ) : m.matchBy === "TRACKING" ? (
                            <span
                              className="px-1.5 py-0.5 rounded font-semibold"
                              style={{ backgroundColor: "rgba(100,116,139,0.12)", color: "#475569" }}
                              title="Khớp theo Tracking Number — đơn đã đối soát"
                            >
                              Tracking
                            </span>
                          ) : (
                            <span
                              className="px-1.5 py-0.5 rounded font-semibold"
                              style={{ backgroundColor: "rgba(100,116,139,0.12)", color: "#475569" }}
                              title="Khớp theo Mã đơn — đơn đã đối soát nhưng không có ref (non-ETF)"
                            >
                              Order ID · non-ref
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          {m.customerName ?? m.customerId}
                        </td>
                        <td className="py-2 pr-3">{m.name}</td>
                        <td className="py-2 pr-3 text-right font-bold">{m.quantity}</td>
                        <td className="py-2 pr-3 text-[11px]">
                          <span
                            className="px-1.5 py-0.5 rounded font-semibold"
                            style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}
                          >
                            {m.paymentType ?? m.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          {m.reconciledAt ? fmtDate(m.reconciledAt) : "—"}
                        </td>
                        <td className="py-2 pr-3 text-[12px]">
                          {m.accountedAt ? (
                            <span className="inline-flex items-center gap-1" style={{ color: "#15803d" }}>
                              <span
                                className="material-symbols-outlined text-[15px]"
                                style={{ fontVariationSettings: '"FILL" 1' }}
                              >
                                check_circle
                              </span>
                              {fmtDate(m.accountedAt)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          {m.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {result.unmatched.length > 0 && (
            <Card padding="lg">
              <h3 className="font-bold text-lg mb-1">Unmatched refs ({result.unmatched.length})</h3>
              <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                These refs don't match any reconciled order. Either the customer hasn't uploaded the reconciliation file yet, or the ref was typed wrong.
              </p>
              <div
                className="rounded p-3 font-mono text-[11px] leading-relaxed"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.08)",
                  color: "#a16207",
                  border: "1px solid rgba(245, 158, 11, 0.2)",
                }}
              >
                {result.unmatched.join(", ")}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: "emerald" | "red" | "slate";
  hint: string;
}) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    emerald: { bg: "rgba(74, 222, 128, 0.08)", fg: "#15803d", border: "#15803d" },
    red: { bg: "rgba(220, 38, 38, 0.08)", fg: "#dc2626", border: "#ef4444" },
    slate: { bg: "rgba(100, 116, 139, 0.08)", fg: "#475569", border: "#475569" },
  };
  const c = palette[accent];
  return (
    <div className="rounded-lg p-4 border-l-4" style={{ backgroundColor: c.bg, borderColor: c.border }}>
      <p className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: c.fg }}>
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color: c.fg }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    </div>
  );
}
