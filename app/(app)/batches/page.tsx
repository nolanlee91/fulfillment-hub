"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";

interface Batch {
  id: string;
  totalOrders: number;
  createdAt: string;
  exportedAt: string | null;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/batches");
    const data = await res.json();
    if (data.success) setBatches(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function exportBatch(batchId: string) {
    setExporting(batchId);
    setMessage(null);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}/export`);
      if (!res.ok) {
        const errData = await res.json();
        setMessage({ text: errData.error || "Export failed", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clickship_${batchId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({
        text: `Đã tải file Excel cho batch ${batchId}`,
        type: "success",
      });
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      setExporting(null);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  function formatDate(s: string): string {
    if (!s) return "—";
    const d = new Date(s);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <>
      <Topbar title="Lô đóng gói" subtitle="Quản lý" />

      <div
        className="rounded-xl p-3 mb-4 border flex items-center justify-between"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="font-bold text-white">{batches.length}</span> batch
        </div>
        {message && (
          <span
            className="text-xs px-3 py-1.5 rounded font-semibold"
            style={
              message.type === "success"
                ? { backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399" }
                : { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171" }
            }
          >
            {message.text}
          </span>
        )}
      </div>

      <div
        className="rounded-xl border overflow-hidden"
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
              package_2
            </span>
            <p className="mt-3 font-semibold text-white">Chưa có batch nào</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Vào trang Đơn hàng → chọn đơn READY → bấm &quot;Tạo Batch&quot;
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Batch ID
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Số đơn
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Tạo lúc
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-3 font-mono text-sm font-bold text-white">
                      {b.id}
                    </td>
                    <td
                      className="px-4 py-3 text-right font-mono"
                      style={{ color: "var(--accent)" }}
                    >
                      {b.totalOrders}
                    </td>
                    <td
                      className="px-4 py-3 text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => exportBatch(b.id)}
                        disabled={exporting === b.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded disabled:opacity-50"
                        style={{
                          backgroundColor: "var(--accent)",
                          color: "var(--bg-primary)",
                        }}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          download
                        </span>
                        {exporting === b.id ? "Đang tải..." : "Tải Excel"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
