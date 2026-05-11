"use client";

import { useEffect, useState } from "react";

interface Customer {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

interface NewCustomerDraft {
  id: string;
  name: string;
  active: boolean;
}

interface EditCustomerDraft {
  id: string;
  name: string;
  active: boolean;
}

const EMPTY_CUSTOMER: NewCustomerDraft = {
  id: "",
  name: "",
  active: true,
};

export function CustomerMasterTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditCustomerDraft | null>(null);
  const [creating, setCreating] = useState<NewCustomerDraft | null>(null);
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

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      alert("Vui lòng nhập Tên khách hàng");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: editing.name.trim(),
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

  async function create() {
    if (!creating) return;
    if (!creating.id.trim() || !creating.name.trim()) {
      alert("Vui lòng nhập Mã và Tên khách hàng");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: creating.id.trim(),
          name: creating.name.trim(),
          active: creating.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreating(null);
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
      <div className="flex justify-end p-3">
        <button
          onClick={() => setCreating({ ...EMPTY_CUSTOMER })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded"
          style={{ backgroundColor: "var(--accent)", color: "var(--bg-primary)" }}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Tạo Khách hàng
        </button>
      </div>

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
                Mã
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Tên
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
            {customers.map((c) => (
              <tr
                key={c.id}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="px-4 py-3 font-mono text-white">{c.id}</td>
                <td
                  className="px-4 py-3 font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {c.name}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.active ? (
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
                    onClick={() =>
                      setEditing({ id: c.id, name: c.name, active: c.active })
                    }
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
            {customers.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  Chưa có khách hàng nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
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
            <h3 className="text-lg font-bold text-white mb-4">Tạo Khách hàng mới</h3>

            <div className="space-y-3">
              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Mã khách hàng <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={creating.id}
                  onChange={(e) =>
                    setCreating({
                      ...creating,
                      id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    })
                  }
                  placeholder="VD: venatureco, skylane"
                  className="w-full px-3 py-2 rounded text-sm font-mono"
                />
                <p
                  className="text-[10px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Chỉ a-z, 0-9, _ (không khoảng trắng, không hoa)
                </p>
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tên hiển thị <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={creating.name}
                  onChange={(e) =>
                    setCreating({ ...creating, name: e.target.value })
                  }
                  placeholder="VD: Venature Co"
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
              <button
                onClick={() => setCreating(null)}
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
                onClick={create}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded disabled:opacity-50"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--bg-primary)",
                }}
              >
                {saving ? "Đang tạo..." : "Tạo"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              Sửa khách hàng <span style={{ color: "var(--accent)" }}>{editing.id}</span>
            </h3>

            <div className="space-y-3 mt-4">
              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tên hiển thị
                </label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded text-sm"
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
