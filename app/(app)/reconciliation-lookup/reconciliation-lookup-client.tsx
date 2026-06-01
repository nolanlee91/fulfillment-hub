"use client";

import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

interface Match {
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
  status: string;
}

interface LookupResult {
  totalInput: number;
  matched: Match[];
  unmatched: string[];
}

/**
 * Parse paste content: chấp nhận newline / comma / tab / semicolon delimiter.
 * Trim whitespace, dedup.
 */
function parseRefs(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
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

  const refs = parseRefs(input);

  async function runLookup() {
    if (refs.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
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

  return (
    <>
      <Topbar title="Payment Lookup" subtitle="Verify customer reconciliation against bank refs" />

      <Card padding="lg" className="mb-4">
        <h3 className="font-bold text-lg mb-1">Find orders by Ref Number</h3>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Paste Ref Numbers from your bank email notifications (one per line, or separated by comma / space). The app returns matching reconciled orders + a list of refs that don't match anything yet.
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
              <h3 className="font-bold text-lg mb-3">Matched orders ({result.matched.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-left text-[11px] font-bold tracking-widest uppercase"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <th className="py-2 pr-3">Ref Number</th>
                      <th className="py-2 pr-3">Order ID</th>
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Recipient</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Reconciled</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matched.map((m) => (
                      <tr key={m.uniqueKey} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2 pr-3 font-mono text-[12px]">{m.refNumber}</td>
                        <td className="py-2 pr-3 font-mono text-[12px]">{m.orderId}</td>
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
