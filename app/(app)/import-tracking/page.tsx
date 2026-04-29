"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";

interface Batch {
  id: string;
  totalOrders: number;
  createdAt: string;
}

interface ImportResult {
  batchId: string;
  totalInFile: number;
  totalInBatch: number;
  matched: number;
  rejected: number;
  notInBatch: number;
  message: string;
}

export default function ImportTrackingPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
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
        // Reset file input
        const input = document.getElementById("file-input") as HTMLInputElement;
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
      <Topbar title="Đối soát ClickShip" subtitle="Quản lý" />

      <div
        className="rounded-xl p-6 border mb-4"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <h3 className="font-bold text-lg text-white mb-1">Upload file ClickShip</h3>
        <p
          className="text-xs mb-5"
          style={{ color: "var(--text-muted)" }}
        >
          Chọn batch đã xuất, upload file kết quả từ ClickShip để cập nhật tracking và phát hiện đơn bị reject.
        </p>

        {/* Batch selector */}
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
          <p
            className="text-xs mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            {selectedBatchInfo.totalOrders} đơn đã xuất trong batch này
          </p>
        )}

        {/* File input */}
        <label
          className="text-[11px] font-bold tracking-widest uppercase block mt-4 mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          File Excel ClickShip (.xlsx)
        </label>
        <input
          id="file-input"
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
          <p
            className="text-xs mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Đã chọn: <span className="font-semibold">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        {/* Submit */}
        <button
          onClick={runImport}
          disabled={!file || !selectedBatch || importing}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{
              animation: importing ? "spin 1s linear infinite" : "none",
            }}
          >
            upload
          </span>
          {importing ? "Đang xử lý..." : "Import Tracking"}
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

      {/* Result */}
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
            <div
              className="rounded-lg p-4 border-l-4"
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                borderColor: "#10b981",
              }}
            >
              <p
                className="text-[11px] font-bold tracking-widest uppercase mb-2"
                style={{ color: "#34d399" }}
              >
                Có tracking
              </p>
              <p className="text-3xl font-bold" style={{ color: "#34d399" }}>
                {result.matched}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Đơn được ClickShip xác nhận
              </p>
            </div>

            <div
              className="rounded-lg p-4 border-l-4"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                borderColor: "#ef4444",
              }}
            >
              <p
                className="text-[11px] font-bold tracking-widest uppercase mb-2"
                style={{ color: "#f87171" }}
              >
                Bị reject
              </p>
              <p className="text-3xl font-bold" style={{ color: "#f87171" }}>
                {result.rejected}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Đơn không có tracking → ERROR
              </p>
            </div>

            <div
              className="rounded-lg p-4 border-l-4"
              style={{
                backgroundColor: "rgba(100, 116, 139, 0.08)",
                borderColor: "#94a3b8",
              }}
            >
              <p
                className="text-[11px] font-bold tracking-widest uppercase mb-2"
                style={{ color: "#94a3b8" }}
              >
                Không thuộc batch
              </p>
              <p className="text-3xl font-bold" style={{ color: "#94a3b8" }}>
                {result.notInBatch}
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Đơn trong file nhưng không khớp batch
              </p>
            </div>
          </div>

          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {result.message}
          </p>

          {result.rejected > 0 && (
            <div
              className="mt-4 px-4 py-3 rounded text-xs"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.2)",
              }}
            >
              ⚠️ Có {result.rejected} đơn bị ClickShip reject. Vào tab{" "}
              <span className="font-bold">Đơn lỗi</span> để xem và sửa thông tin.
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
