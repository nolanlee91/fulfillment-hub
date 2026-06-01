"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

interface UploadResult {
  totalInFile: number;
  matched: number;
  unmatched: number;
  unmatchedOrderIds: string[];
  skippedCOD: number;
  message: string;
}

interface UnreconciledOrder {
  uniqueKey: string;
  orderId: string;
  productName: string;
  name: string;
  quantity: number;
  status: string;
  paymentMethod: string;
  reconciledAt: string | null;
}

export default function ReconciliationClient() {
  return (
    <>
      <Topbar title="Reconciliation" subtitle="Match payments to your orders" />

      <UploadSection />

      <UnreconciledList />
    </>
  );
}

// ============================================================================
// Section 1: Upload Excel file (orderID + refNumber)
// ============================================================================
function UploadSection() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/reconciliation/upload-ref", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setFile(null);
        const input = document.getElementById("ref-file-input") as HTMLInputElement;
        if (input) input.value = "";
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Card padding="lg" className="mb-4">
        <div className="flex items-start justify-between mb-1 gap-3">
          <h3 className="font-bold text-lg">Upload reconciliation file (ETF)</h3>
          <a
            href="/api/reconciliation/template"
            download
            className="text-xs font-semibold inline-flex items-center gap-1 px-3 py-1.5 rounded transition-colors shrink-0"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            Download template
          </a>
        </div>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Excel file (.xlsx) with 2 columns: <b>Order ID</b> + <b>Ref Number</b> (from your bank email notification). The app matches each Order ID and assigns the Ref to your orders.
        </p>

        <label
          className="text-[11px] font-bold tracking-widest uppercase block mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          Excel file (.xlsx)
        </label>
        <input
          id="ref-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={uploading}
          className="w-full px-3 py-2.5 rounded text-sm cursor-pointer"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
          }}
        />
        {file && (
          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
            Selected: <span className="font-semibold">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        <Button
          variant="primary"
          icon="upload"
          onClick={runUpload}
          disabled={!file || uploading}
          className="mt-5"
        >
          {uploading ? "Processing..." : "Upload"}
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
        <Card padding="lg" className="mb-4">
          <h3 className="font-bold text-lg mb-4">Results</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <ResultCard label="Matched" value={result.matched} accent="emerald" hint="Ref assigned" />
            <ResultCard label="Unmatched" value={result.unmatched} accent="red" hint="Order ID not found" />
            <ResultCard label="COD skipped" value={result.skippedCOD} accent="slate" hint="COD orders don't need reconciliation" />
          </div>

          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {result.message}
          </p>

          {result.unmatchedOrderIds.length > 0 && (
            <div
              className="mt-4 px-4 py-3 rounded text-xs"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                color: "#a16207",
                border: "1px solid rgba(245, 158, 11, 0.2)",
              }}
            >
              <p className="font-semibold mb-2">
                Order IDs not found ({result.unmatchedOrderIds.length}
                {result.unmatched > result.unmatchedOrderIds.length ? `+, showing first 50` : ""}):
              </p>
              <p className="font-mono text-[11px] leading-relaxed">
                {result.unmatchedOrderIds.join(", ")}
              </p>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

// ============================================================================
// Section 2: List unreconciled prepaid orders of current customer
// ============================================================================
function UnreconciledList() {
  const [orders, setOrders] = useState<UnreconciledOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("payment", "PREPAID");

    fetch(`/api/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const unrec = (d.data as UnreconciledOrder[]).filter(
            (o) => !o.reconciledAt && o.paymentMethod === "PREPAID",
          );
          setOrders(unrec);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card padding="lg">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading...
        </p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <h3 className="font-bold text-lg mb-1">Prepaid orders pending reconciliation</h3>
      <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
        Your prepaid orders that don't have a Ref Number yet. Upload the Excel above to assign Refs in bulk.
      </p>

      {orders.length === 0 ? (
        <p className="text-sm py-4" style={{ color: "var(--text-secondary)" }}>
          ✓ All prepaid orders are reconciled.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-[11px] font-bold tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                <th className="py-2 pr-3">Order ID</th>
                <th className="py-2 pr-3">Recipient</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 100).map((o) => (
                <tr
                  key={o.uniqueKey}
                  className="border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-2 pr-3 font-mono text-[12px]">{o.orderId}</td>
                  <td className="py-2 pr-3">{o.name}</td>
                  <td className="py-2 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {o.productName}
                  </td>
                  <td className="py-2 pr-3 text-right font-bold">{o.quantity}</td>
                  <td className="py-2 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {o.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length > 100 && (
            <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
              Showing 100 of {orders.length} orders. Upload the Ref file for bulk processing.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function ResultCard({
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
    <div
      className="rounded-lg p-4 border-l-4"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <p
        className="text-[11px] font-bold tracking-widest uppercase mb-2"
        style={{ color: c.fg }}
      >
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
