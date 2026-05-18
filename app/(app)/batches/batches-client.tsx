"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card } from "@/components/ui";

interface Batch {
  id: string;
  totalOrders: number;
  platform: "CLICKSHIP" | "EST" | null;
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

  async function exportBatch(batch: Batch) {
    setExporting(batch.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batch.id)}/export`);
      if (!res.ok) {
        const errData = await res.json();
        setMessage({ text: errData.error || "Export failed", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const isEst = batch.platform === "EST";
      a.download = isEst ? `EST_${batch.id}.csv` : `clickship_${batch.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({
        text: `Downloaded ${isEst ? "CSV" : "Excel"} file for batch ${batch.id}`,
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
      <Topbar title="Batches" subtitle="Operations" />

      <Card padding="none" className="mb-4 px-4 py-3 flex items-center justify-between">
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="font-bold text-white">{batches.length}</span> batch
        </div>
        {message && (
          <span
            className="text-xs px-3 py-1.5 rounded font-semibold"
            style={
              message.type === "success"
                ? { backgroundColor: "rgba(74, 222, 128, 0.10)", color: "#4ade80" }
                : { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171" }
            }
          >
            {message.text}
          </span>
        )}
      </Card>

      <div className="table-shell">
        {loading ? (
          <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center">
            <span
              className="material-symbols-outlined text-5xl"
              style={{ color: "var(--text-muted)" }}
            >
              package_2
            </span>
            <p className="mt-3 font-semibold text-white">No batches yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Go to Orders → select READY orders → click &quot;Create Batch&quot;
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Batch ID
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Type
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Orders
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Created
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const isEst = b.platform === "EST";
                  return (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-white">
                        {b.id}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`payment-${isEst ? "COD" : "PREPAID"} px-2 py-0.5 rounded text-[10px] font-bold tracking-wider`}
                        >
                          {isEst ? "COD" : "Standard"}
                        </span>
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
                          onClick={() => exportBatch(b)}
                          disabled={exporting === b.id}
                          className="btn btn-primary"
                        >
                          <span className="material-symbols-outlined text-[16px]">download</span>
                          {exporting === b.id ? "Downloading..." : isEst ? "Download CSV" : "Download Excel"}
                        </button>
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
