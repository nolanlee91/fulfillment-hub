"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";

interface Order {
  uniqueKey: string;
  orderId: string;
  customerId: string;
  productId: string;
  productName: string;
  name: string;
  city: string;
  zipcode: string;
  phone: string;
  quantity: number;
  status: string;
  errorNote: string | null;
}

export default function ErrorsPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/orders?status=ERROR,ERROR_UPDATED");
    const data = await res.json();
    if (data.success) setOrders(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function recheckAll() {
    setRechecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/validate", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessage(`Đã validate lại: ${data.ready} READY, ${data.errors} ERROR`);
        await load();
        router.refresh();
      } else {
        setMessage("Lỗi: " + data.error);
      }
    } finally {
      setRechecking(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  // Group errors by note for summary
  const errorGroups: Record<string, number> = {};
  for (const o of orders) {
    const note = o.errorNote || "Unknown";
    errorGroups[note] = (errorGroups[note] ?? 0) + 1;
  }

  return (
    <>
      <Topbar title="Đơn lỗi" subtitle="Quản lý" />

      {/* Summary */}
      <div
        className="rounded-xl p-4 mb-4 border flex items-center justify-between"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.15)" }}
          >
            <span
              className="material-symbols-outlined text-2xl"
              style={{ color: "#f87171" }}
            >
              report_problem
            </span>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{orders.length}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              đơn cần xử lý
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {message && (
            <span
              className="text-xs px-3 py-1.5 rounded font-semibold"
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
              }}
            >
              {message}
            </span>
          )}
          <button
            onClick={recheckAll}
            disabled={rechecking}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ animation: rechecking ? "spin 1s linear infinite" : "none" }}
            >
              refresh
            </span>
            {rechecking ? "Đang xử lý..." : "Recheck tất cả"}
          </button>
        </div>
      </div>

      {/* Error groups summary */}
      {Object.keys(errorGroups).length > 0 && (
        <div
          className="rounded-xl p-4 mb-4 border"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          <h3
            className="text-[11px] font-bold tracking-widest uppercase mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Phân loại lỗi
          </h3>
          <div className="space-y-2">
            {Object.entries(errorGroups)
              .sort(([, a], [, b]) => b - a)
              .map(([note, count]) => (
                <div
                  key={note}
                  className="flex items-center justify-between text-sm"
                >
                  <span style={{ color: "var(--text-secondary)" }}>{note}</span>
                  <span
                    className="font-mono font-bold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.15)",
                      color: "#f87171",
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Table */}
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
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <span
              className="material-symbols-outlined text-5xl"
              style={{ color: "var(--accent)" }}
            >
              check_circle
            </span>
            <p className="mt-3 font-semibold text-white">Không có đơn lỗi nào!</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Tất cả đơn đã được validate thành công.
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
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Order ID
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Khách
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Sản phẩm
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Tên
                  </th>
                  <th className="text-right px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    SL
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Lỗi
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.uniqueKey}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-3 py-2 font-mono text-xs font-bold text-white">
                      {o.orderId}
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {o.customerId}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {o.productName}
                    </td>
                    <td
                      className="px-3 py-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {o.name || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {o.quantity}
                    </td>
                    <td
                      className="px-3 py-2 text-xs font-medium"
                      style={{ color: "#f87171" }}
                    >
                      {o.errorNote}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
