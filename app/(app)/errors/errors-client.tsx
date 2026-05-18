"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

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
    const res = await fetch("/api/orders?status=ERROR");
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
        setMessage(`Re-validated: ${data.ready} READY, ${data.errors} ERROR`);
        await load();
        router.refresh();
      } else {
        setMessage("Error: " + data.error);
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
      <Topbar title="Error Orders" subtitle="Operations" />

      {/* Summary */}
      <Card className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(220, 38, 38, 0.10)" }}
          >
            <span
              className="material-symbols-outlined text-2xl"
              style={{ color: "#dc2626" }}
            >
              report_problem
            </span>
          </div>
          <div>
            <p className="text-2xl font-bold">{orders.length}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              orders need attention
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {message && (
            <span
              className="text-xs px-3 py-1.5 rounded font-semibold"
              style={{
                backgroundColor: "rgba(22, 163, 74, 0.10)",
                color: "#15803d",
              }}
            >
              {message}
            </span>
          )}
          <Button
            variant="primary"
            icon="refresh"
            iconSpin={rechecking}
            onClick={recheckAll}
            disabled={rechecking}
          >
            {rechecking ? "Processing..." : "Recheck All"}
          </Button>
        </div>
      </Card>

      {/* Error groups summary */}
      {Object.keys(errorGroups).length > 0 && (
        <Card className="mb-4">
          <h3
            className="text-[11px] font-bold tracking-widest uppercase mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Error Breakdown
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
                      backgroundColor: "rgba(220, 38, 38, 0.10)",
                      color: "#dc2626",
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Table */}
      <div className="table-shell">
        {loading ? (
          <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <span
              className="material-symbols-outlined text-5xl"
              style={{ color: "var(--accent)" }}
            >
              check_circle
            </span>
            <p className="mt-3 font-semibold">No error orders!</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              All orders have been validated successfully.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Order ID
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Customer
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Product
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Name
                  </th>
                  <th className="text-right px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Qty
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Error
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.uniqueKey}>
                    <td className="px-3 py-2 font-mono text-xs font-bold">
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
                      style={{ color: "#dc2626" }}
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
    </>
  );
}
