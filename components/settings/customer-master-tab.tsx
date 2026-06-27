"use client";

import { useEffect, useState } from "react";

interface Customer {
  id: string;
  name: string;
  active: boolean;
  fulfillmentEnabled: boolean;
  storageEnabled: boolean;
  createdAt: string;
  handlingPerPallet: string | null;
  handlingPerUnit: string | null;
  storagePerWeek: string | null;
  storagePerMonth: string | null;
  basis: "WEEK" | "MONTH" | null;
}

interface Draft {
  id: string;
  name: string;
  active: boolean;
  fulfillmentEnabled: boolean;
  storageEnabled: boolean;
  handlingPerPallet: string;
  handlingPerUnit: string;
  storagePerWeek: string;
  storagePerMonth: string;
  basis: "WEEK" | "MONTH";
}

const DEFAULT_RATES = {
  handlingPerPallet: "10",
  handlingPerUnit: "1",
  storagePerWeek: "15",
  storagePerMonth: "50",
  basis: "MONTH" as const,
};

const EMPTY_DRAFT: Draft = {
  id: "",
  name: "",
  active: true,
  fulfillmentEnabled: true,
  storageEnabled: false,
  ...DEFAULT_RATES,
};

function draftFromCustomer(c: Customer): Draft {
  return {
    id: c.id,
    name: c.name,
    active: c.active,
    fulfillmentEnabled: c.fulfillmentEnabled,
    storageEnabled: c.storageEnabled,
    handlingPerPallet: c.handlingPerPallet ?? DEFAULT_RATES.handlingPerPallet,
    handlingPerUnit: c.handlingPerUnit ?? DEFAULT_RATES.handlingPerUnit,
    storagePerWeek: c.storagePerWeek ?? DEFAULT_RATES.storagePerWeek,
    storagePerMonth: c.storagePerMonth ?? DEFAULT_RATES.storagePerMonth,
    basis: c.basis ?? DEFAULT_RATES.basis,
  };
}

function draftToBody(d: Draft) {
  return {
    id: d.id.trim(),
    name: d.name.trim(),
    active: d.active,
    fulfillmentEnabled: d.fulfillmentEnabled,
    storageEnabled: d.storageEnabled,
    rates: d.storageEnabled
      ? {
          handlingPerPallet: Number(d.handlingPerPallet) || 0,
          handlingPerUnit: Number(d.handlingPerUnit) || 0,
          storagePerWeek: Number(d.storagePerWeek) || 0,
          storagePerMonth: Number(d.storagePerMonth) || 0,
          basis: d.basis,
        }
      : undefined,
  };
}

export function CustomerMasterTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [creating, setCreating] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/customers");
    const data = await res.json();
    if (data.success) setCustomers(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(method: "POST" | "PUT", draft: Draft) {
    if (method === "POST" && !draft.id.trim()) {
      alert("Please enter a Customer ID");
      return;
    }
    if (!draft.name.trim()) {
      alert("Please enter a customer name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToBody(draft)),
      });
      const data = await res.json();
      if (data.success) {
        setEditing(null);
        setCreating(null);
        await load();
      } else {
        alert("Error: " + data.error);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end p-3">
        <button onClick={() => setCreating({ ...EMPTY_DRAFT })} className="btn btn-primary">
          <span className="material-symbols-outlined text-[17px]">add</span>
          New Customer
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">ID</th>
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">Name</th>
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">Services</th>
              <th className="text-center px-4 py-3 text-[11px] font-bold tracking-widest uppercase">Active</th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-4 py-3 font-mono">{c.id}</td>
                <td className="px-4 py-3 font-bold" style={{ color: "var(--text-primary)" }}>
                  {c.name}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {c.fulfillmentEnabled && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}>
                        Fulfillment
                      </span>
                    )}
                    {c.storageEnabled && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: "rgba(147,51,234,0.10)", color: "#7e22ce" }}>
                        Storage
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold"
                    style={
                      c.active
                        ? { backgroundColor: "rgba(22, 163, 74, 0.10)", color: "#15803d" }
                        : { backgroundColor: "rgba(100, 116, 139, 0.2)", color: "#475569" }
                    }
                  >
                    {c.active ? "ON" : "OFF"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditing(draftFromCustomer(c))}
                    className="px-3 py-1 text-xs font-semibold rounded"
                    style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  No customers yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CustomerModal
          title="New Customer"
          draft={creating}
          setDraft={setCreating}
          editingId={false}
          saving={saving}
          onCancel={() => setCreating(null)}
          onSave={() => submit("POST", creating)}
        />
      )}
      {editing && (
        <CustomerModal
          title={`Edit ${editing.id}`}
          draft={editing}
          setDraft={setEditing}
          editingId
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={() => submit("PUT", editing)}
        />
      )}
    </div>
  );
}

function CustomerModal({
  title,
  draft,
  setDraft,
  editingId,
  saving,
  onCancel,
  onSave,
}: {
  title: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  editingId: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={() => !saving && onCancel()}
    >
      <div
        className="rounded-xl p-6 w-full max-w-md border max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">{title}</h3>

        <div className="space-y-3">
          {!editingId && (
            <div>
              <label className="text-[11px] font-bold tracking-widest uppercase block mb-1" style={{ color: "var(--text-muted)" }}>
                Customer ID <span style={{ color: "var(--accent)" }}>*</span>
              </label>
              <input
                type="text"
                value={draft.id}
                onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                placeholder="e.g. caovanhieu"
                className="w-full px-3 py-2 rounded text-sm font-mono"
              />
            </div>
          )}
          <div>
            <label className="text-[11px] font-bold tracking-widest uppercase block mb-1" style={{ color: "var(--text-muted)" }}>
              Display Name <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className="w-full px-3 py-2 rounded text-sm"
            />
          </div>

          {/* Services */}
          <div>
            <label className="text-[11px] font-bold tracking-widest uppercase block mb-1" style={{ color: "var(--text-muted)" }}>
              Services
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={draft.fulfillmentEnabled}
                  onChange={(e) => set({ fulfillmentEnabled: e.target.checked })}
                  className="w-4 h-4"
                  style={{ accentColor: "var(--accent)" }}
                />
                Fulfillment
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={draft.storageEnabled}
                  onChange={(e) => set({ storageEnabled: e.target.checked })}
                  className="w-4 h-4"
                  style={{ accentColor: "var(--accent)" }}
                />
                Storage
              </label>
            </div>
          </div>

          {/* Storage rates */}
          {draft.storageEnabled && (
            <div className="rounded-lg p-3 border" style={{ borderColor: "var(--border)" }}>
              <p className="text-[11px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                Storage rates (CAD)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <RateInput label="Handling / pallet" value={draft.handlingPerPallet} onChange={(v) => set({ handlingPerPallet: v })} />
                <RateInput label="Handling / unit" value={draft.handlingPerUnit} onChange={(v) => set({ handlingPerUnit: v })} />
                <RateInput label="Storage / pallet / week" value={draft.storagePerWeek} onChange={(v) => set({ storagePerWeek: v })} />
                <RateInput label="Storage / pallet / month" value={draft.storagePerMonth} onChange={(v) => set({ storagePerMonth: v })} />
              </div>
              <div className="mt-2">
                <label className="text-[11px] block mb-1" style={{ color: "var(--text-muted)" }}>
                  Billing basis
                </label>
                <div className="flex gap-2">
                  {(["WEEK", "MONTH"] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`btn ${draft.basis === b ? "btn-primary" : "btn-secondary"} text-xs`}
                      onClick={() => set({ basis: b })}
                    >
                      {b === "WEEK" ? "Weekly" : "Monthly"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => set({ active: e.target.checked })}
              className="w-4 h-4"
              style={{ accentColor: "var(--accent)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>Active</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} disabled={saving} className="btn btn-secondary">Cancel</button>
          <button onClick={onSave} disabled={saving} className="btn btn-primary">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 rounded text-sm"
      />
    </label>
  );
}
