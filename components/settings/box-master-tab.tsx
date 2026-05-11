"use client";

import { useEffect, useState } from "react";

interface Box {
  code: string;
  name: string;
  lengthIn: string;
  widthIn: string;
  heightIn: string;
  emptyWeightLb: string;
  active: boolean;
}

const EMPTY_BOX: Box = {
  code: "",
  name: "",
  lengthIn: "",
  widthIn: "",
  heightIn: "",
  emptyWeightLb: "",
  active: true,
};

export function BoxMasterTab() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Box | null>(null);
  const [creating, setCreating] = useState<Box | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/boxes");
    const data = await res.json();
    if (data.success) setBoxes(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/boxes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: editing.code,
          name: editing.name,
          lengthIn: Number(editing.lengthIn) || 0,
          widthIn: Number(editing.widthIn) || 0,
          heightIn: Number(editing.heightIn) || 0,
          emptyWeightLb: Number(editing.emptyWeightLb) || 0,
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
    if (!creating.code.trim() || !creating.name.trim()) {
      alert("Vui lòng nhập Mã và Tên thùng");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/boxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: creating.code.trim(),
          name: creating.name.trim(),
          lengthIn: Number(creating.lengthIn) || 0,
          widthIn: Number(creating.widthIn) || 0,
          heightIn: Number(creating.heightIn) || 0,
          emptyWeightLb: Number(creating.emptyWeightLb) || 0,
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
      <div
        className="p-12 text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        Đang tải...
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end p-3">
        <button
          onClick={() => setCreating({ ...EMPTY_BOX })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded"
          style={{ backgroundColor: "var(--accent)", color: "var(--bg-primary)" }}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Tạo Box
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
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Dài (in)
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Rộng (in)
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Cao (in)
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                Cân vỏ (lb)
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
            {boxes.map((box) => (
              <tr
                key={box.code}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="px-4 py-3 font-bold text-white">{box.code}</td>
                <td
                  className="px-4 py-3"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {box.name}
                </td>
                <td
                  className="px-4 py-3 text-right font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {Number(box.lengthIn)}
                </td>
                <td
                  className="px-4 py-3 text-right font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {Number(box.widthIn)}
                </td>
                <td
                  className="px-4 py-3 text-right font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {Number(box.heightIn)}
                </td>
                <td
                  className="px-4 py-3 text-right font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {Number(box.emptyWeightLb)}
                </td>
                <td className="px-4 py-3 text-center">
                  {box.active ? (
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
                    onClick={() => setEditing(box)}
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
            <h3 className="text-lg font-bold text-white mb-4">Tạo Box mới</h3>

            <div className="space-y-3">
              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Mã thùng <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={creating.code}
                  onChange={(e) =>
                    setCreating({ ...creating, code: e.target.value.toUpperCase() })
                  }
                  placeholder="VD: A, B, M5"
                  className="w-full px-3 py-2 rounded text-sm font-mono"
                />
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tên thùng <span style={{ color: "var(--accent)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={creating.name}
                  onChange={(e) =>
                    setCreating({ ...creating, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label
                    className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Dài (in)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={creating.lengthIn}
                    onChange={(e) =>
                      setCreating({ ...creating, lengthIn: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded text-sm"
                  />
                </div>
                <div>
                  <label
                    className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Rộng (in)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={creating.widthIn}
                    onChange={(e) =>
                      setCreating({ ...creating, widthIn: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded text-sm"
                  />
                </div>
                <div>
                  <label
                    className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cao (in)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={creating.heightIn}
                    onChange={(e) =>
                      setCreating({ ...creating, heightIn: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Cân vỏ thùng (lb)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={creating.emptyWeightLb}
                  onChange={(e) =>
                    setCreating({ ...creating, emptyWeightLb: e.target.value })
                  }
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
            <h3 className="text-lg font-bold text-white mb-4">
              Sửa Box <span style={{ color: "var(--accent)" }}>{editing.code}</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Tên thùng
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

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label
                    className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Dài
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editing.lengthIn}
                    onChange={(e) =>
                      setEditing({ ...editing, lengthIn: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded text-sm"
                  />
                </div>
                <div>
                  <label
                    className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Rộng
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editing.widthIn}
                    onChange={(e) =>
                      setEditing({ ...editing, widthIn: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded text-sm"
                  />
                </div>
                <div>
                  <label
                    className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cao
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={editing.heightIn}
                    onChange={(e) =>
                      setEditing({ ...editing, heightIn: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  className="text-[11px] font-bold tracking-widest uppercase block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Cân vỏ thùng (lb)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={editing.emptyWeightLb}
                  onChange={(e) =>
                    setEditing({ ...editing, emptyWeightLb: e.target.value })
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
