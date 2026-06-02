"use client";

import { useState } from "react";
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

export default function ReconciliationClient() {
  return (
    <>
      <Topbar title="Reconciliation" subtitle="Match payments to your orders" />
      <UploadSection />
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
