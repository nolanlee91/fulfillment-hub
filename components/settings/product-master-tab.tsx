"use client";

import { useEffect, useState } from "react";

interface Product {
  id: string;
  name: string;
  customerId: string;
  unitWeightLb: string | null;
  active: boolean;
}

export function ProductMasterTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/products");
    const data = await res.json();
    if (data.success) setProducts(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          unitWeightLb: Number(editing.unitWeightLb) || 0,
          active: editing.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditing(null);
        await load();
      } else {
        alert("Lỗi: " + data.error);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
        Đang tải...
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-muted)",
              }}
            >
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Khách hàng
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Sản phẩm
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Cân nặng (lb)
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Active
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Hành động
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
                <td className="px-4 py-3 font-bold text-white">{p.name}</td>
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
                        backgroundColor: "rgba(16, 185, 129, 0.15)",
                        color: "#34d399",
                      }}
                    >
                      ON
                    </span>
                  ) : (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold"
                      style={{
                        backgroundColor: "rgba(100, 116, 139, 0.2)",
                        color: "#94a3b8",
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
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
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
            <h3 className="text-lg font-bold text-white mb-1">
              Sửa <span style={{ color: "var(--accent)" }}>{editing.name}</span>
            </h3>
            <p
              className="text-xs mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              {editing.customerId}
            </p>

            <div className="space-y-3">
              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Cân nặng đơn vị (lb)
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
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                }}
              >
                Hủy
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                }}
              >
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
