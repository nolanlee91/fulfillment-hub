"use client";

import { useEffect, useState } from "react";

interface Product {
  id: string;
  name: string;
  customerId: string;
  unitWeightLb: string | null;
  active: boolean;
}

interface Customer {
  id: string;
  name: string;
  active: boolean;
}

interface NewProductDraft {
  id: string;
  name: string;
  customerId: string;
  unitWeightLb: string;
  active: boolean;
}

const EMPTY_PRODUCT: NewProductDraft = {
  id: "",
  name: "",
  customerId: "",
  unitWeightLb: "",
  active: true,
};

export function ProductMasterTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState<NewProductDraft | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [productsRes, customersRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/customers"),
    ]);
    const productsData = await productsRes.json();
    const customersData = await customersRes.json();
    if (productsData.success) setProducts(productsData.data);
    if (customersData.success) setCustomers(customersData.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      alert("Product name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: editing.name.trim(),
          unitWeightLb: Number(editing.unitWeightLb) || 0,
          active: editing.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditing(null);
        await load();
      } else {
        alert("Error: " + data.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function create() {
    if (!creating) return;
    if (!creating.id.trim() || !creating.name.trim() || !creating.customerId) {
      alert("Please enter Product ID, Name, and select a Customer");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: creating.id.trim(),
          name: creating.name.trim(),
          customerId: creating.customerId,
          unitWeightLb: Number(creating.unitWeightLb) || 0,
          active: creating.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
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

  const activeCustomers = customers.filter((c) => c.active);

  return (
    <div>
      <div className="flex justify-end p-3">
        <button
          onClick={() => setCreating({ ...EMPTY_PRODUCT })}
          disabled={activeCustomers.length === 0}
          className="btn btn-primary"
          title={activeCustomers.length === 0 ? "Create a customer first" : ""}
        >
          <span className="material-symbols-outlined text-[17px]">add</span>
          New Product
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Customer
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Product
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Weight (lb)
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Active
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr
                key={p.id}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <td
                  className="px-4 py-3 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {p.customerId}
                </td>
                <td className="px-4 py-3 font-bold">{p.name}</td>
                <td
                  className="px-4 py-3 text-right font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {p.unitWeightLb ? Number(p.unitWeightLb).toFixed(4) : "—"}
                </td>
                <td className="px-4 py-3 text-center">
                  {p.active ? (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        backgroundColor: "rgba(22, 163, 74, 0.10)",
                        color: "#15803d",
                      }}
                    >
                      ON
                    </span>
                  ) : (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        backgroundColor: "rgba(100, 116, 139, 0.2)",
                        color: "#475569",
                      }}
                    >
                      OFF
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditing(p)}
                    className="px-3 py-1 text-xs font-semibold rounded"
                    style={{
                      backgroundColor: "var(--accent-bg)",
                      color: "var(--accent)",
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => !saving && setCreating(null)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md border"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">New Product</h3>

            <div className="space-y-3">
              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Customer <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <select
                  value={creating.customerId}
                  onChange={(e) =>
                    setCreating({ ...creating, customerId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                >
                  <option value="">— Select customer —</option>
                  {activeCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Product ID <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={creating.id}
                  onChange={(e) =>
                    setCreating({ ...creating, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })
                  }
                  placeholder="e.g. fitgum_acai"
                  className="w-full px-3 py-2 rounded text-sm font-mono"
                />
                <p
                  className="text-[10px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Lowercase only: a-z, 0-9, _ (no spaces)
                </p>
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Display Name <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={creating.name}
                  onChange={(e) =>
                    setCreating({ ...creating, name: e.target.value })
                  }
                  placeholder="e.g. Fitgum Acai"
                  className="w-full px-3 py-2 rounded text-sm"
                />
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Unit weight (lb)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={creating.unitWeightLb}
                  onChange={(e) =>
                    setCreating({ ...creating, unitWeightLb: e.target.value })
                  }
                  placeholder="0.0000"
                  className="w-full px-3 py-2 rounded text-sm"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={creating.active}
                  onChange={(e) =>
                    setCreating({ ...creating, active: e.target.checked })
                  }
                  className="w-4 h-4"
                  style={{ accentColor: "var(--accent)" }}
                />
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  Active
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setCreating(null)} disabled={saving} className="btn btn-secondary">Cancel</button>
              <button onClick={create} disabled={saving} className="btn btn-primary">{saving ? "Creating..." : "Create"}</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="rounded-xl p-6 w-full max-w-md border"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-1">
              Edit Product{" "}
              <span className="font-mono text-sm" style={{ color: "var(--text-muted)" }}>
                {editing.id}
              </span>
            </h3>
            <p
              className="text-xs mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              Customer: {editing.customerId}
            </p>

            <div className="space-y-3">
              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Display Name <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  placeholder="e.g. Fitgum Acai"
                />
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Unit weight (lb)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={editing.unitWeightLb || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, unitWeightLb: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                  placeholder="0.0000"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) =>
                    setEditing({ ...editing, active: e.target.checked })
                  }
                  className="w-4 h-4"
                  style={{ accentColor: "var(--accent)" }}
                />
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  Active
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditing(null)} disabled={saving} className="btn btn-secondary">Cancel</button>
              <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
