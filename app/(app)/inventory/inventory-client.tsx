"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { Card, Button } from "@/components/ui";

interface Warehouse {
  code: string;
  name: string;
  region: string;
}

interface ProductInfo {
  id: string;
  name: string;
  customerId: string;
}

interface TrackingRow {
  warehouseCode: string;
  productId: string;
  productName: string;
  customerId: string;
  tracked: boolean;
  trackedSince: string | null;
  onHand: number;
  lowStockThreshold: number | null;
  updatedAt: string;
}

interface Movement {
  id: string;
  delta: number;
  type: "STOCK_IN" | "ORDER_OUT" | "ADJUST";
  refOrderKey: string | null;
  note: string | null;
  createdBy: string | null;
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

export default function InventoryClient() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [tracking, setTracking] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWh, setActiveWh] = useState<string>("");

  const [addProductId, setAddProductId] = useState("");
  const [addSince, setAddSince] = useState("");
  const [adding, setAdding] = useState(false);

  const [modal, setModal] = useState<{
    row: TrackingRow;
    type: "STOCK_IN" | "ADJUST";
  } | null>(null);

  const [historyRow, setHistoryRow] = useState<TrackingRow | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory");
    const data = await res.json();
    if (data.success) {
      setWarehouses(data.data.warehouses);
      setProducts(data.data.products);
      setTracking(data.data.tracking);
      setActiveWh((prev) => prev || data.data.warehouses[0]?.code || "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = tracking.filter((t) => t.warehouseCode === activeWh);
  const trackedIds = new Set(rows.map((r) => r.productId));
  const available = products.filter((p) => !trackedIds.has(p.id));

  async function addTrack() {
    if (!addProductId) return;
    setAdding(true);
    try {
      const res = await fetch("/api/inventory/track", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseCode: activeWh,
          productId: addProductId,
          tracked: true,
          trackedSince: addSince || null,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert("Error: " + data.error);
        return;
      }
      setAddProductId("");
      setAddSince("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function patchTrack(
    row: TrackingRow,
    patch: {
      tracked?: boolean;
      trackedSince?: string | null;
      lowStockThreshold?: number | null;
    },
  ) {
    const res = await fetch("/api/inventory/track", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouseCode: row.warehouseCode,
        productId: row.productId,
        ...patch,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert("Error: " + data.error);
      return;
    }
    await load();
  }

  async function openHistory(row: TrackingRow) {
    setHistoryRow(row);
    setHistoryLoading(true);
    setMovements([]);
    const res = await fetch(
      `/api/inventory/movements?warehouseCode=${encodeURIComponent(row.warehouseCode)}&productId=${encodeURIComponent(row.productId)}`,
    );
    const data = await res.json();
    if (data.success) setMovements(data.data);
    setHistoryLoading(false);
  }

  if (loading) {
    return (
      <>
        <Topbar title="Inventory" subtitle="Stock per warehouse" />
        <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
          Loading...
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Inventory" subtitle="Stock per warehouse" />

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
        Only products tracked here are deducted when labels are imported. Each order is
        deducted from the warehouse matching its destination region; products not tracked
        here are ignored.
      </p>

      {/* Add product to track */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="filter-label">Track a product</label>
            <select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
              className="filter-input"
              style={{ minWidth: 240 }}
            >
              <option value="">Select product…</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.customerId})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="filter-label">Tracking since</label>
            <input
              type="date"
              value={addSince}
              onChange={(e) => setAddSince(e.target.value)}
              className="filter-input"
            />
          </div>
          <Button icon="add" disabled={!addProductId || adding} onClick={addTrack}>
            {adding ? "Adding…" : "Track"}
          </Button>
        </div>
      </Card>

      {/* Tracked products table */}
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: "var(--bg-tertiary)" }}>
              {["Product", "Customer", "On hand", "Low-stock", "Tracking since", "Tracked", "Actions"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[11px] font-bold tracking-widest uppercase ${i === 2 || i === 3 ? "text-center" : "text-left"}`}
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  No products tracked in this warehouse yet.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => {
              const low =
                r.onHand <= 0 ||
                (r.lowStockThreshold != null && r.onHand <= r.lowStockThreshold);
              return (
                <tr
                  key={r.productId}
                  className="border-t"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor:
                      idx % 2 === 0 ? "var(--bg-secondary)" : "var(--bg-primary)",
                    opacity: r.tracked ? 1 : 0.55,
                  }}
                >
                  <td className="px-4 py-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {r.productName}
                  </td>
                  <td className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {r.customerId}
                  </td>
                  <td
                    className="px-4 py-2 text-center font-mono text-sm font-bold"
                    style={{ color: low ? "var(--color-danger)" : "var(--text-primary)" }}
                  >
                    {r.onHand}
                    {low && (
                      <span className="material-symbols-outlined text-[14px] align-middle ml-1">
                        warning
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      defaultValue={r.lowStockThreshold ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== (r.lowStockThreshold ?? null)) {
                          patchTrack(r, { lowStockThreshold: v });
                        }
                      }}
                      className="filter-input text-center font-mono"
                      style={{ width: 80 }}
                    />
                  </td>
                  <td className="px-4 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {fmtDate(r.trackedSince)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => patchTrack(r, { tracked: !r.tracked })}
                      className="material-symbols-outlined text-[22px]"
                      title={r.tracked ? "Tracking on — click to pause" : "Paused — click to resume"}
                      style={{ color: r.tracked ? "var(--accent)" : "var(--text-muted)" }}
                    >
                      {r.tracked ? "toggle_on" : "toggle_off"}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Button
                        icon="add_box"
                        className="text-xs"
                        onClick={() => setModal({ row: r, type: "STOCK_IN" })}
                      >
                        Stock in
                      </Button>
                      <Button
                        variant="secondary"
                        className="text-xs"
                        onClick={() => setModal({ row: r, type: "ADJUST" })}
                      >
                        Adjust
                      </Button>
                      <Button
                        variant="secondary"
                        icon="history"
                        className="text-xs"
                        onClick={() => openHistory(r)}
                      >
                        History
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {modal && (
        <StockModal
          row={modal.row}
          type={modal.type}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await load();
          }}
        />
      )}

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

function StockModal({
  row,
  type,
  onClose,
  onDone,
}: {
  row: TrackingRow;
  type: "STOCK_IN" | "ADJUST";
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const delta = Number(qty);
    if (!delta || Number.isNaN(delta)) {
      alert("Enter a quantity");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warehouseCode: row.warehouseCode,
          productId: row.productId,
          type,
          delta,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert("Error: " + data.error);
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card>
          <h3 className="font-bold text-base mb-1">
            {type === "STOCK_IN" ? "Stock in" : "Adjust stock"} — {row.productName}
          </h3>
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            Current on hand: <strong>{row.onHand}</strong>
            {type === "ADJUST" && " · use a negative number to reduce"}
          </p>
          <label className="filter-label">
            {type === "STOCK_IN" ? "Quantity received" : "Change (±)"}
          </label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="filter-input w-full mt-1"
            autoFocus
          />
          <label className="filter-label mt-3 block">Note (optional)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="filter-input w-full mt-1"
          />
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
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
                    {["Date", "Type", "Change", "Order", "Note", "By"].map((h) => (
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
                      <td className="px-3 py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                        {m.createdBy ?? "—"}
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
