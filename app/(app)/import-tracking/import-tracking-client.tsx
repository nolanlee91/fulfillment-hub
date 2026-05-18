"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

interface Batch {
  id: string;
  totalOrders: number;
  platform: "CLICKSHIP" | "EST" | null;
  createdAt: string;
}

interface LabelImportResult {
  batchId: string;
  totalInFile: number;
  totalInBatch: number;
  matched: number;
  rejected: number;
  notInBatch: number;
  message: string;
}

interface EventsImportResult {
  filename: string;
  totalEventsInFile: number;
  totalTrackings: number;
  totalMatched: number;
  totalUpdated: number;
  totalUnmatched: number;
  unmatchedSamples: string[];
  byCategory: { delivered: number; failed: number; inTransit: number };
  message: string;
}

type Tab = "label" | "events";

export default function ImportTrackingPage() {
  const [tab, setTab] = useState<Tab>("label");

  return (
    <>
      <Topbar title="Shipping Reconciliation" subtitle="Operations" />

      <Card padding="none" className="mb-4 overflow-hidden flex">
        <TabButton active={tab === "label"} onClick={() => setTab("label")}>
          Create Label
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")}>
          Shipping Events (APT)
        </TabButton>
      </Card>

      {tab === "label" ? <LabelTab /> : <EventsTab />}
    </>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-5 py-3 text-sm font-semibold transition-colors"
      style={{
        backgroundColor: active ? "var(--accent-bg)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

// ============================================================================
// Tab 1: Import Excel file to update labels for batch (current flow)
// ============================================================================
function LabelTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<LabelImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setBatches(d.data);
          if (d.data.length > 0) setSelectedBatch(d.data[0].id);
        }
      });
  }, []);

  async function runImport() {
    if (!file || !selectedBatch) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("batchId", selectedBatch);

      const res = await fetch("/api/tracking/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setFile(null);
        const input = document.getElementById("label-file-input") as HTMLInputElement;
        if (input) input.value = "";
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const selectedBatchInfo = batches.find((b) => b.id === selectedBatch);

  return (
    <>
      <Card padding="lg" className="mb-4">
        <h3 className="font-bold text-lg mb-1">
          Upload label result file
        </h3>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Select the exported batch and upload the corresponding result file to update tracking and detect orders that failed label creation.
        </p>

        <label
          className="text-[11px] font-bold tracking-widest uppercase block mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          Batch
        </label>
        <select
          value={selectedBatch}
          onChange={(e) => setSelectedBatch(e.target.value)}
          className="w-full px-3 py-2.5 rounded text-sm mb-1"
          disabled={importing}
        >
          {batches.length === 0 && <option>No batches yet</option>}
          {batches.map((b) => {
            const tag =
              b.platform === "EST"
                ? "COD · CSV"
                : b.platform === "CLICKSHIP"
                  ? "Standard · Excel"
                  : "Standard · Excel";
            return (
              <option key={b.id} value={b.id}>
                {b.id} ({b.totalOrders} orders · {tag})
              </option>
            );
          })}
        </select>
        {selectedBatchInfo && (
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            {selectedBatchInfo.totalOrders} orders —{" "}
            {selectedBatchInfo.platform === "EST"
              ? "COD batch, expecting CSV file back"
              : "Standard batch, expecting Excel file back"}
          </p>
        )}

        <label
          className="text-[11px] font-bold tracking-widest uppercase block mt-4 mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          {selectedBatchInfo?.platform === "EST" ? "File CSV (.csv)" : "File Excel (.xlsx)"}
        </label>
        <input
          id="label-file-input"
          type="file"
          accept={selectedBatchInfo?.platform === "EST" ? ".csv" : ".xlsx,.xls"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={importing}
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
          onClick={runImport}
          disabled={!file || !selectedBatch || importing}
          className="mt-5"
        >
          {importing ? "Processing..." : "Import Labels"}
        </Button>

        {error && (
          <div
            className="mt-4 px-4 py-2.5 rounded text-sm font-semibold"
            style={{
              backgroundColor: "rgba(220, 38, 38, 0.10)",
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}
      </Card>

      {result && (
        <Card padding="lg">
          <h3 className="font-bold text-lg mb-4">Import Results</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <ResultCard label="Tracked" value={result.matched} accent="emerald" hint="Orders confirmed" />
            <ResultCard label="Rejected" value={result.rejected} accent="red" hint="Label creation failed → ERROR" />
            <ResultCard label="Not in batch" value={result.notInBatch} accent="slate" hint="In file but not matched to batch" />
          </div>

          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {result.message}
          </p>
        </Card>
      )}
    </>
  );
}

// ============================================================================
// Tab 2: Upload APT file → update shipping status
// ============================================================================
function EventsTab() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<EventsImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    if (!file) return;
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tracking/events-upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setFile(null);
        const input = document.getElementById("events-file-input") as HTMLInputElement;
        if (input) input.value = "";
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <Card padding="lg" className="mb-4">
        <h3 className="font-bold text-lg mb-1">
          Upload shipping events file
        </h3>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Upload APT file (.csv pipe-delimited) from the shipping partner to update statuses: in transit, delivered, failed. Duplicate filenames already processed will be rejected.
        </p>

        <label
          className="text-[11px] font-bold tracking-widest uppercase block mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          File APT (.csv)
        </label>
        <input
          id="events-file-input"
          type="file"
          accept=".csv,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={importing}
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
          onClick={runImport}
          disabled={!file || importing}
          className="mt-5"
        >
          {importing ? "Processing..." : "Update Events"}
        </Button>

        {error && (
          <div
            className="mt-4 px-4 py-2.5 rounded text-sm font-semibold"
            style={{
              backgroundColor: "rgba(220, 38, 38, 0.10)",
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}
      </Card>

      {result && (
        <Card padding="lg">
          <h3 className="font-bold text-lg mb-1">Processing Results</h3>
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            File: <span className="font-mono">{result.filename}</span> • {result.totalEventsInFile} rows • {result.totalTrackings} unique trackings
          </p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <ResultCard label="Delivered" value={result.byCategory.delivered} accent="teal" hint="Successfully delivered" />
            <ResultCard label="In Transit" value={result.byCategory.inTransit} accent="sky" hint="On the way" />
            <ResultCard label="Failed" value={result.byCategory.failed} accent="orange" hint="Returned / undeliverable" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div
              className="rounded-lg p-3 border"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Orders matched in DB
              </p>
              <p className="text-2xl font-bold">
                {result.totalMatched}
                <span className="text-sm ml-1" style={{ color: "var(--text-muted)" }}>
                  / {result.totalTrackings}
                </span>
              </p>
            </div>
            <div
              className="rounded-lg p-3 border"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                borderColor: "var(--border)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Orders updated
              </p>
              <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
                {result.totalUpdated}
              </p>
            </div>
          </div>

          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {result.message}
          </p>

          {result.unmatchedSamples.length > 0 && (
            <div
              className="mt-4 px-4 py-3 rounded text-xs"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                color: "#a16207",
                border: "1px solid rgba(245, 158, 11, 0.2)",
              }}
            >
              <p className="font-semibold mb-1">
                {result.totalUnmatched} trackings in file did not match any order in DB. Samples:
              </p>
              <p className="font-mono text-[11px]">
                {result.unmatchedSamples.join(", ")}
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
  accent: "emerald" | "red" | "slate" | "teal" | "sky" | "orange";
  hint: string;
}) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    emerald: { bg: "rgba(74, 222, 128, 0.08)", fg: "#15803d", border: "#15803d" },
    red: { bg: "rgba(220, 38, 38, 0.08)", fg: "#dc2626", border: "#ef4444" },
    slate: { bg: "rgba(100, 116, 139, 0.08)", fg: "#475569", border: "#475569" },
    teal: { bg: "rgba(20, 184, 166, 0.08)", fg: "#0f766e", border: "#14b8a6" },
    sky: { bg: "rgba(14, 165, 233, 0.08)", fg: "#0369a1", border: "#0ea5e9" },
    orange: { bg: "rgba(249, 115, 22, 0.08)", fg: "#c2410c", border: "#f97316" },
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
