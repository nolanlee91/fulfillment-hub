"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, Button } from "@/components/ui";
import { Dropdown } from "@/components/ui/dropdown";

interface Pallet {
  id: string;
  palletCode: string;
  customerId: string;
  warehouseCode: string;
  productName: string;
  unitCount: number;
  initialUnits: number;
  status: "IN_STORAGE" | "PICKED_UP" | "DISPOSED";
  receivedAt: string;
  pickedUpAt: string | null;
  note: string | null;
}
interface Customer {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<Pallet["status"], string> = {
  IN_STORAGE: "In storage",
  PICKED_UP: "Picked up",
  DISPOSED: "Disposed",
};
const STATUS_COLOR: Record<Pallet["status"], string> = {
  IN_STORAGE: "#15803d",
  PICKED_UP: "#475569",
  DISPOSED: "#b91c1c",
};

function daysStored(receivedAt: string, pickedUpAt: string | null): number {
  const end = pickedUpAt ? new Date(pickedUpAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(receivedAt).getTime()) / 86_400_000));
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA");
}

export default function StorageClient() {
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [fStatus, setFStatus] = useState<string>("IN_STORAGE");

  const [showReceive, setShowReceive] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [pickup, setPickup] = useState<Pallet | null>(null);

  const custName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of customers) m[c.id] = c.name;
    return m;
  }, [customers]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fStatus) params.set("status", fStatus);
    const res = await fetch(`/api/storage/pallets?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      setPallets(data.data.pallets);
      setCustomers(data.data.customers);
    }
    setLoading(false);
  }, [fStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const inStorage = pallets.filter((p) => p.status === "IN_STORAGE");
  const totalUnits = inStorage.reduce((s, p) => s + p.unitCount, 0);

  return (
    <>
      <Topbar title="Storage" subtitle="Warehouse" showSync={false} />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card>
          <div className="text-xs text-[var(--text-secondary)]">Pallets in storage</div>
          <div className="text-2xl font-bold">{inStorage.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-secondary)]">Units in storage</div>
          <div className="text-2xl font-bold">{totalUnits.toLocaleString()}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-secondary)]">Customers</div>
          <div className="text-2xl font-bold">
            {new Set(inStorage.map((p) => p.customerId)).size}
          </div>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Dropdown
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: "IN_STORAGE", label: "In storage" },
            { value: "PICKED_UP", label: "Picked up" },
            { value: "", label: "All statuses" },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" icon="download" onClick={() => setShowExport(true)}>
            Export
          </Button>
          <Button icon="add" onClick={() => setShowReceive(true)}>
            Receive
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--text-secondary)] border-b">
              <th className="px-3 py-2">Pallet</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">On hand / Received</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  Loading…
                </td>
              </tr>
            ) : pallets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  No pallets yet. Click <span className="font-semibold">Receive</span> to add.
                </td>
              </tr>
            ) : (
              pallets.map((p) => (
                <tr key={p.id} className="border-b text-sm hover:bg-[rgba(0,0,0,0.02)]">
                  <td className="px-3 py-2 font-mono text-xs">{p.palletCode}</td>
                  <td className="px-3 py-2">{custName[p.customerId] ?? p.customerId}</td>
                  <td className="px-3 py-2">{p.productName}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-semibold">{p.unitCount}</span>
                    <span className="text-[var(--text-secondary)]"> / {p.initialUnits}</span>
                  </td>
                  <td className="px-3 py-2">{fmtDate(p.receivedAt)}</td>
                  <td className="px-3 py-2 text-right">{daysStored(p.receivedAt, p.pickedUpAt)}</td>
                  <td className="px-3 py-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: STATUS_COLOR[p.status] }}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.status === "IN_STORAGE" && (
                      <Button
                        variant="secondary"
                        icon="outbox"
                        className="text-xs"
                        onClick={() => setPickup(p)}
                      >
                        Pickup
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showReceive && (
        <ReceiveModal
          customers={customers}
          onClose={() => setShowReceive(false)}
          onDone={async () => {
            setShowReceive(false);
            await load();
          }}
        />
      )}
      {showExport && (
        <ExportModal customers={customers} onClose={() => setShowExport(false)} />
      )}
      {pickup && (
        <PickupModal
          pallet={pickup}
          onClose={() => setPickup(null)}
          onDone={async () => {
            setPickup(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]">
            close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 mb-3">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function ReceiveModal({
  customers,
  onClose,
  onDone,
}: {
  customers: Customer[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [productName, setProductName] = useState("");
  const [unitsPerPallet, setUnitsPerPallet] = useState("");
  const [palletCount, setPalletCount] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nPallet = Math.max(0, Math.floor(Number(palletCount) || 0));

  async function submit() {
    setError("");
    if (!customerId || !productName.trim()) {
      setError("Select a customer and enter a product");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/storage/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          productName: productName.trim(),
          unitsPerPallet: Number(unitsPerPallet) || 0,
          palletCount: nPallet,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Receive failed");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Receive pallets" onClose={onClose}>
      <Field label="Customer">
        <Dropdown
          value={customerId}
          onChange={setCustomerId}
          placeholder="Select customer"
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
      </Field>
      <Field label="Product (1 SKU / pallet)">
        <input
          className="filter-input w-full"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="e.g. Original"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Units / pallet">
          <input
            className="filter-input w-full"
            type="number"
            min={0}
            value={unitsPerPallet}
            onChange={(e) => setUnitsPerPallet(e.target.value)}
            placeholder="100"
          />
        </Field>
        <Field label="Pallets">
          <input
            className="filter-input w-full"
            type="number"
            min={1}
            value={palletCount}
            onChange={(e) => setPalletCount(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input
          className="filter-input w-full"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving} icon={saving ? "hourglass_empty" : "add"}>
          {saving ? "Saving…" : `Create ${nPallet} pallet${nPallet === 1 ? "" : "s"}`}
        </Button>
      </div>
    </ModalShell>
  );
}

function PickupModal({
  pallet,
  onClose,
  onDone,
}: {
  pallet: Pallet;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"PALLET" | "UNIT">("PALLET");
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const taking = mode === "PALLET" ? pallet.unitCount : Math.min(pallet.unitCount, Number(units) || 0);

  async function submit() {
    setError("");
    if (mode === "UNIT" && (!Number(units) || Number(units) < 1)) {
      setError("Enter the number of units to pick");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/storage/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          palletId: pallet.id,
          uom: mode,
          units: mode === "UNIT" ? Number(units) : undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Pickup failed");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Pickup — ${pallet.palletCode}`} onClose={onClose}>
      <p className="text-sm mb-3">
        {pallet.productName} · <span className="font-semibold">{pallet.unitCount}</span> units left
      </p>
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${mode === "PALLET" ? "btn-primary" : "btn-secondary"} text-xs`}
          onClick={() => setMode("PALLET")}
        >
          Whole pallet
        </button>
        <button
          className={`btn ${mode === "UNIT" ? "btn-primary" : "btn-secondary"} text-xs`}
          onClick={() => setMode("UNIT")}
        >
          By unit
        </button>
      </div>
      {mode === "UNIT" && (
        <Field label={`Units to pick (max ${pallet.unitCount})`}>
          <input
            className="filter-input w-full"
            type="number"
            min={1}
            max={pallet.unitCount}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </Field>
      )}
      <Field label="Note (optional)">
        <input
          className="filter-input w-full"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Picking <span className="font-semibold">{taking}</span> units
        {mode === "PALLET" && " · pallet leaves storage"}
      </p>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saving} icon={saving ? "hourglass_empty" : "outbox"}>
          {saving ? "Saving…" : "Confirm pickup"}
        </Button>
      </div>
    </ModalShell>
  );
}

function ExportModal({
  customers,
  onClose,
}: {
  customers: Customer[];
  onClose: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [error, setError] = useState("");

  function download() {
    setError("");
    if (!from || !to) {
      setError("Pick a from and to date");
      return;
    }
    const params = new URLSearchParams({ from, to });
    if (customerId) params.set("customer", customerId);
    window.location.href = `/api/storage/report?${params.toString()}`;
    onClose();
  }

  return (
    <ModalShell title="Export storage report" onClose={onClose}>
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Excel with two sheets (Storage + Movements). Amounts are computed from each
        customer&apos;s stored rate.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input
            className="filter-input w-full"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            className="filter-input w-full"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Customer (optional — all if blank)">
        <Dropdown
          value={customerId}
          onChange={setCustomerId}
          placeholder="All customers"
          options={[
            { value: "", label: "All customers" },
            ...customers.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={download} icon="download">
          Download
        </Button>
      </div>
    </ModalShell>
  );
}
