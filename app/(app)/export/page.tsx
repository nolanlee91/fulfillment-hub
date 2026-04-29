"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";

interface Batch {
  id: string;
  totalOrders: number;
  createdAt: string;
}

export default function ExportPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/batches");
      const data = await res.json();
      if (data.success) {
        setBatches(data.data);
        // Auto-select latest batch
        if (data.data.length > 0) setSelected(data.data[0].id);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function download() {
    if (!selected) return;
    setDownloading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(selected)}/export`);
      if (!res.ok) {
        const errData = await res.json();
        setMessage({ text: errData.error || "Export failed", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clickship_${selected}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({
        text: `Đã tải file. Upload lên ClickShip để tạo vận đơn.`,
        type: "success",
      });
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      setDownloading(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  const selectedBatch = batches.find((b) => b.id === selected);

  return (
    <>
      <Topbar title="Xuất ClickShip" subtitle="Quản lý" />

      <div
        className="rounded-xl p-6 border"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {loading ? (
          <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
            Đang tải...
          </div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center">
            <span
              className="material-symbols-outlined text-5xl"
              style={{ color: "var(--text-muted)" }}
            >
              ios_share
            </span>
            <p className="mt-3 font-semibold text-white">Chưa có batch nào để xuất</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Vào trang Đơn hàng tạo batch trước.
            </p>
          </div>
        ) : (
          <>
            <h3 className="font-bold text-lg text-white mb-4">
              Chọn batch để xuất Excel
            </h3>

            <label
              className="text-[11px] font-bold tracking-widest uppercase block mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Batch ID
            </label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2.5 rounded text-sm mb-4"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} ({b.totalOrders} đơn)
                </option>
              ))}
            </select>

            {selectedBatch && (
              <div
                className="rounded-lg p-4 mb-4"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <div
                  className="text-[11px] font-bold tracking-widest uppercase mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Thông tin batch
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Mã batch: </span>
                    <span className="font-mono font-bold text-white">
                      {selectedBatch.id}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Số đơn: </span>
                    <span style={{ color: "var(--accent)" }} className="font-bold">
                      {selectedBatch.totalOrders}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={download}
              disabled={!selected || downloading}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded disabled:opacity-50"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--bg-primary)",
              }}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{
                  animation: downloading ? "spin 1s linear infinite" : "none",
                }}
              >
                download
              </span>
              {downloading ? "Đang tạo file..." : "Tải Excel ClickShip"}
            </button>

            {message && (
              <div
                className="mt-4 px-4 py-2.5 rounded text-sm font-semibold"
                style={
                  message.type === "success"
                    ? {
                        backgroundColor: "rgba(16, 185, 129, 0.15)",
                        color: "#34d399",
                      }
                    : {
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        color: "#f87171",
                      }
                }
              >
                {message.text}
              </div>
            )}

            <div
              className="mt-6 rounded-lg p-4 text-xs"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.08)",
                color: "var(--text-secondary)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
              }}
            >
              <p className="font-bold mb-2" style={{ color: "#60a5fa" }}>
                Hướng dẫn
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Bấm &quot;Tải Excel ClickShip&quot; để download file .xlsx</li>
                <li>Mở ClickShip → Import → upload file</li>
                <li>ClickShip sẽ tạo vận đơn và trả tracking number</li>
                <li>(Sau này) Push tracking ngược về sheet khách</li>
              </ol>
            </div>
          </>
        )}
      </div>

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
