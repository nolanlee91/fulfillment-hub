"use client";

import { useCallback, useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, Button } from "@/components/ui";

interface Warehouse {
  code: string;
  name: string;
  region: string;
}

interface TrackingRow {
  warehouseCode: string;
  productId: string;
  productName: string;
  trackedSince: string | null;
  onHand: number;
  updatedAt: string;
}

interface Movement {
  id: string;
  delta: number;
  type: "STOCK_IN" | "ORDER_OUT" | "ADJUST";
  refOrderKey: string | null;
  note: string | null;
  createdAt: string;
}

const TYPE_LABEL: Record<Movement["type"], string> = {
  STOCK_IN: "Stock in",
  ORDER_OUT: "Order out",
  ADJUST: "Adjust",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA");
}

export default function MyInventoryClient() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [tracking, setTracking] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWh, setActiveWh] = useState<string>("");

  const [historyRow, setHistoryRow] = useState<TrackingRow | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/my-inventory");
    const data = await res.json();
    if (data.success) {
      setWarehouses(data.data.warehouses);
      setTracking(data.data.tracking);
      // Mặc định mở kho đầu tiên CÓ hàng của khách (không thì kho đầu danh sách).
      setActiveWh(
        (prev) =>
          prev ||
          data.data.tracking[0]?.warehouseCode ||
          data.data.warehouses[0]?.code ||
          "",
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = tracking.filter((t) => t.warehouseCode === activeWh);

  async function openHistory(row: TrackingRow) {
    setHistoryRow(row);
    setHistoryLoading(true);
    setMovements([]);
    const res = await fetch(
      `/api/my-inventory/movements?warehouseCode=${encodeURIComponent(row.warehouseCode)}&productId=${encodeURIComponent(row.productId)}`,
    );
    const data = await res.json();
    if (data.success) setMovements(data.data);
    setHistoryLoading(false);
  }

  if (loading) {
    return (
      <>
        <Topbar title="Inventory" subtitle="Your stock per warehouse" />
        <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
          Loading...
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Inventory" subtitle="Your stock per warehouse" />

      {/* Warehouse tabs */}
      <div className="status-tabs-bar mb-4" style={{ width: "fit-content" }}>
        {warehouses.map((w) => (
          <button
            key={w.code}
            onClick={() => setActiveWh(w.code)}
            className={`status-tab${activeWh === w.code ? " active" : ""}`}
          >
            <span className="material-symbols-outlined text-[16px]">warehouse</span>
            {w.name}
          </button>
        ))}
      </div>

      <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
        Stock is deducted automatically when your orders ship from the matching
        warehouse. Contact us if a number looks off.
      </p>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: "var(--bg-tertiary)" }}>
              {["Product", "On hand", "Tracking since", "Last updated", ""].map((h, i) => (
                <th
                  key={h || "actions"}
                  className={`px-4 py-3 text-[11px] font-bold tracking-widest uppercase ${i === 1 ? "text-center" : "text-left"}`}
                  style={{ color: "var(--text-muted)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  No products in this warehouse yet.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr
                key={r.productId}
                className="border-t"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor:
                    idx % 2 === 0 ? "var(--bg-secondary)" : "var(--bg-primary)",
                }}
              >
                <td className="px-4 py-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {r.productName}
                </td>
                <td
                  className="px-4 py-2 text-center font-mono text-sm font-bold"
                  style={{
                    color: r.onHand <= 0 ? "var(--color-danger)" : "var(--text-primary)",
                  }}
                >
                  {r.onHand}
                </td>
                <td className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {fmtDate(r.trackedSince)}
                </td>
                <td className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {fmtDate(r.updatedAt)}
                </td>
                <td className="px-4 py-2">
                  <Button
                    variant="secondary"
                    icon="history"
                    className="text-xs"
                    onClick={() => openHistory(r)}
                  >
                    History
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {historyRow && (
        <HistoryModal
          row={historyRow}
          movements={movements}
          loading={historyLoading}
          onClose={() => setHistoryRow(null)}
        />
      )}
    </>
  );
}

function HistoryModal({
  row,
  movements,
  loading,
  onClose,
}: {
  row: TrackingRow;
  movements: Movement[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-base">History — {row.productName}</h3>
            <button
              className="material-symbols-outlined"
              onClick={onClose}
              style={{ color: "var(--text-muted)" }}
            >
              close
            </button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              Loading…
            </div>
          ) : movements.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No movements yet.
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-tertiary)" }}>
                    {["Date", "Type", "Change", "Order", "Note"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-[11px] font-bold tracking-widest uppercase"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-3 py-2 text-sm whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        {new Date(m.createdAt).toLocaleString("en-CA")}
                      </td>
                      <td className="px-3 py-2 text-sm">{TYPE_LABEL[m.type]}</td>
                      <td
                        className="px-3 py-2 text-sm font-mono font-bold"
                        style={{ color: m.delta < 0 ? "var(--color-danger)" : "var(--accent)" }}
                      >
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                        {m.refOrderKey ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        {m.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
