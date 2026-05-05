"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";

interface Batch {
  id: string;
  totalOrders: number;
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
      <Topbar title="Đối soát vận chuyển" subtitle="Quản lý" />

      <div
        className="rounded-xl mb-4 border overflow-hidden flex"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <TabButton active={tab === "label"} onClick={() => setTab("label")}>
          Tạo label (Excel)
        </TabButton>
        <TabButton active={tab === "events"} onClick={() => setTab("events")}>
          Sự kiện vận chuyển (APT)
        </TabButton>
      </div>

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
// Tab 1: Import file Excel để cập nhật label cho batch (flow hiện tại)
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
      <div
        className="rounded-xl p-6 border mb-4"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <h3 className="font-bold text-lg text-white mb-1">
          Upload file kết quả tạo label
        </h3>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Chọn batch đã xuất, upload file Excel kết quả để cập nhật tracking và phát hiện đơn không tạo được label.
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
          {batches.length === 0 && <option>Chưa có batch nào</option>}
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.id} ({b.totalOrders} đơn)
            </option>
          ))}
        </select>
        {selectedBatchInfo && (
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            {selectedBatchInfo.totalOrders} đơn đã xuất trong batch này
          </p>
        )}

        <label
          className="text-[11px] font-bold tracking-widest uppercase block mt-4 mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          File Excel (.xlsx)
        </label>
        <input
          id="label-file-input"
          type="file"
          accept=".xlsx,.xls"
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
            Đã chọn: <span className="font-semibold">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        <button
          onClick={runImport}
          disabled={!file || !selectedBatch || importing}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          <span className="material-symbols-outlined text-[18px]">upload</span>
          {importing ? "Đang xử lý..." : "Import label"}
        </button>

        {error && (
          <div
            className="mt-4 px-4 py-2.5 rounded text-sm font-semibold"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {result && (
        <div
          className="rounded-xl p-6 border"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          <h3 className="font-bold text-lg text-white mb-4">Kết quả import</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <ResultCard label="Có tracking" value={result.matched} accent="emerald" hint="Đơn được xác nhận" />
            <ResultCard label="Bị từ chối" value={result.rejected} accent="red" hint="Không tạo được label → ERROR" />
            <ResultCard label="Không thuộc batch" value={result.notInBatch} accent="slate" hint="Trong file nhưng không khớp batch" />
          </div>

          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {result.message}
          </p>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Tab 2: Upload file APT → cập nhật trạng thái vận chuyển
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
      <div
        className="rounded-xl p-6 border mb-4"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <h3 className="font-bold text-lg text-white mb-1">
          Upload file sự kiện vận chuyển
        </h3>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Upload file APT (.csv pipe-delimited) từ đối tác vận chuyển để cập nhật trạng thái: đang giao, đã giao, thất bại. File trùng tên đã xử lý sẽ bị từ chối.
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
            Đã chọn: <span className="font-semibold">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        <button
          onClick={runImport}
          disabled={!file || importing}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          <span className="material-symbols-outlined text-[18px]">upload</span>
          {importing ? "Đang xử lý..." : "Cập nhật sự kiện"}
        </button>

        {error && (
          <div
            className="mt-4 px-4 py-2.5 rounded text-sm font-semibold"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
            }}
          >
            {error}
          </div>
        )}
      </div>

      {result && (
        <div
          className="rounded-xl p-6 border"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          <h3 className="font-bold text-lg text-white mb-1">Kết quả xử lý</h3>
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            File: <span className="font-mono">{result.filename}</span> • {result.totalEventsInFile} dòng • {result.totalTrackings} tracking unique
          </p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <ResultCard label="Đã giao" value={result.byCategory.delivered} accent="teal" hint="Giao thành công" />
            <ResultCard label="Đang giao" value={result.byCategory.inTransit} accent="sky" hint="Đang vận chuyển" />
            <ResultCard label="Thất bại" value={result.byCategory.failed} accent="orange" hint="Trả về / không giao được" />
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
                Đơn match được trong DB
              </p>
              <p className="text-2xl font-bold text-white">
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
                Đơn được cập nhật
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
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.2)",
              }}
            >
              <p className="font-semibold mb-1">
                {result.totalUnmatched} tracking trong file không match đơn nào trong DB. Mẫu:
              </p>
              <p className="font-mono text-[11px]">
                {result.unmatchedSamples.join(", ")}
              </p>
            </div>
          )}
        </div>
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
    emerald: { bg: "rgba(16, 185, 129, 0.08)", fg: "#34d399", border: "#10b981" },
    red: { bg: "rgba(239, 68, 68, 0.08)", fg: "#f87171", border: "#ef4444" },
    slate: { bg: "rgba(100, 116, 139, 0.08)", fg: "#94a3b8", border: "#94a3b8" },
    teal: { bg: "rgba(20, 184, 166, 0.08)", fg: "#2dd4bf", border: "#14b8a6" },
    sky: { bg: "rgba(14, 165, 233, 0.08)", fg: "#38bdf8", border: "#0ea5e9" },
    orange: { bg: "rgba(249, 115, 22, 0.08)", fg: "#fb923c", border: "#f97316" },
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
