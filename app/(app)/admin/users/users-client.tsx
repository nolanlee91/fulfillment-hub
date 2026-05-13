"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui";

type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: Role;
  customerId: string | null;
  customerName: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface CustomerOption {
  id: string;
  name: string;
  active: boolean;
}

interface CreateDraft {
  username: string;
  password: string;
  name: string;
  role: "STAFF" | "CUSTOMER";
  customerId: string;
}

interface EditDraft {
  id: string;
  username: string;
  name: string;
  role: "STAFF" | "CUSTOMER";
  customerId: string;
  active: boolean;
}

interface ResetDraft {
  id: string;
  username: string;
  password: string;
}

const EMPTY_CREATE: CreateDraft = {
  username: "",
  password: "",
  name: "",
  role: "STAFF",
  customerId: "",
};

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  STAFF: "Nhân viên",
  CUSTOMER: "Khách hàng",
};

const ROLE_COLOR: Record<Role, { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: "rgba(168, 85, 247, 0.15)", fg: "#c084fc" },
  STAFF: { bg: "rgba(59, 130, 246, 0.15)", fg: "#60a5fa" },
  CUSTOMER: { bg: "rgba(245, 158, 11, 0.15)", fg: "#fbbf24" },
};

export default function UsersClient({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<CreateDraft | null>(null);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [resetting, setResetting] = useState<ResetDraft | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [usersRes, customersRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/customers"),
    ]);
    const usersData = await usersRes.json();
    const customersData = await customersRes.json();
    if (usersData.success) setUsers(usersData.data);
    if (customersData.success) setCustomers(customersData.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!creating) return;
    if (!creating.username.trim() || !creating.password || !creating.name.trim()) {
      alert("Vui lòng nhập đầy đủ username, password, tên");
      return;
    }
    if (creating.password.length < 8) {
      alert("Password phải >= 8 ký tự");
      return;
    }
    if (creating.role === "CUSTOMER" && !creating.customerId) {
      alert("Tài khoản khách hàng cần chọn khách hàng");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: creating.username.trim(),
          password: creating.password,
          name: creating.name.trim(),
          role: creating.role,
          customerId: creating.role === "CUSTOMER" ? creating.customerId : null,
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

  async function update() {
    if (!editing) return;
    if (!editing.name.trim()) {
      alert("Vui lòng nhập tên");
      return;
    }
    if (editing.role === "CUSTOMER" && !editing.customerId) {
      alert("Tài khoản khách hàng cần chọn khách hàng");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name.trim(),
          role: editing.role,
          customerId: editing.role === "CUSTOMER" ? editing.customerId : null,
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

  async function resetPassword() {
    if (!resetting) return;
    if (resetting.password.length < 8) {
      alert("Password phải >= 8 ký tự");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${resetting.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetting.password }),
      });
      const data = await res.json();
      if (data.success) {
        setResetting(null);
        alert(`Đã đặt password mới cho "${resetting.username}". User cần đăng nhập lại.`);
      } else {
        alert("Lỗi: " + data.error);
      }
    } finally {
      setSaving(false);
    }
  }

  function startEdit(u: UserRow) {
    if (u.role === "SUPER_ADMIN") return;
    setEditing({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      customerId: u.customerId ?? "",
      active: u.active,
    });
  }

  function startReset(u: UserRow) {
    if (u.role === "SUPER_ADMIN") return;
    setResetting({ id: u.id, username: u.username, password: "" });
  }

  const activeCustomers = customers.filter((c) => c.active);

  return (
    <>
      <Topbar title="Tài khoản" subtitle="Cài đặt" />

      <div className="flex justify-end mb-4">
        <Button
          variant="primary"
          icon="person_add"
          onClick={() => setCreating({ ...EMPTY_CREATE })}
        >
          Tạo tài khoản
        </Button>
      </div>

      <div className="table-shell">
        {loading ? (
          <div
            className="p-12 text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            Đang tải...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Username
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Tên
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Vai trò
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Khách hàng
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Trạng thái
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Đăng nhập gần nhất
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === currentUserId;
                  const isSuperAdmin = u.role === "SUPER_ADMIN";
                  const cannotEdit = isSelf || isSuperAdmin;
                  const roleColor = ROLE_COLOR[u.role];
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-mono text-white">
                        {u.username}
                        {isSelf && (
                          <span
                            className="ml-2 text-[10px] font-normal"
                            style={{ color: "var(--text-muted)" }}
                          >
                            (bạn)
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {u.name}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            backgroundColor: roleColor.bg,
                            color: roleColor.fg,
                          }}
                        >
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {u.customerName ? (
                          <>
                            {u.customerName}{" "}
                            <span style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                              ({u.customerId})
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.active ? (
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
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              color: "#f87171",
                            }}
                          >
                            OFF
                          </span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString("vi-VN")
                          : "Chưa đăng nhập"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(u)}
                            disabled={cannotEdit}
                            className="px-3 py-1 text-xs font-semibold rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: "var(--accent-bg)",
                              color: "var(--accent)",
                            }}
                            title={
                              isSelf
                                ? "Không thể tự sửa tài khoản của mình"
                                : isSuperAdmin
                                  ? "Không thể sửa SUPER_ADMIN"
                                  : ""
                            }
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => startReset(u)}
                            disabled={cannotEdit}
                            className="px-3 py-1 text-xs font-semibold rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: "rgba(245, 158, 11, 0.15)",
                              color: "#fbbf24",
                            }}
                            title={
                              isSelf
                                ? "Không thể tự reset password"
                                : isSuperAdmin
                                  ? "Không thể reset SUPER_ADMIN"
                                  : ""
                            }
                          >
                            Reset MK
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Chưa có tài khoản nào
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <Modal title="Tạo tài khoản mới" onClose={() => !saving && setCreating(null)}>
          <div className="space-y-3">
            <Field label="Username" required>
              <input
                type="text"
                value={creating.username}
                onChange={(e) =>
                  setCreating({
                    ...creating,
                    username: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_.]/g, ""),
                  })
                }
                placeholder="VD: staff01, kde_skylane"
                className="w-full px-3 py-2 rounded text-sm font-mono"
              />
            </Field>

            <Field label="Password" required>
              <input
                type="text"
                value={creating.password}
                onChange={(e) =>
                  setCreating({ ...creating, password: e.target.value })
                }
                placeholder=">= 8 ký tự"
                className="w-full px-3 py-2 rounded text-sm font-mono"
              />
            </Field>

            <Field label="Tên hiển thị" required>
              <input
                type="text"
                value={creating.name}
                onChange={(e) =>
                  setCreating({ ...creating, name: e.target.value })
                }
                placeholder="VD: Nguyễn Văn A"
                className="w-full px-3 py-2 rounded text-sm"
              />
            </Field>

            <Field label="Vai trò" required>
              <select
                value={creating.role}
                onChange={(e) =>
                  setCreating({
                    ...creating,
                    role: e.target.value as "STAFF" | "CUSTOMER",
                    customerId: e.target.value === "STAFF" ? "" : creating.customerId,
                  })
                }
                className="w-full px-3 py-2 rounded text-sm"
              >
                <option value="STAFF">Nhân viên</option>
                <option value="CUSTOMER">Khách hàng</option>
              </select>
            </Field>

            {creating.role === "CUSTOMER" && (
              <Field label="Khách hàng" required>
                <select
                  value={creating.customerId}
                  onChange={(e) =>
                    setCreating({ ...creating, customerId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                >
                  <option value="">— Chọn khách hàng —</option>
                  {activeCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
                {activeCustomers.length === 0 && (
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "#f87171" }}
                  >
                    Chưa có khách hàng active — tạo ở Cấu hình → Customer Master
                  </p>
                )}
              </Field>
            )}
          </div>

          <ModalActions
            onCancel={() => setCreating(null)}
            onSubmit={create}
            saving={saving}
            submitLabel="Tạo"
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Sửa tài khoản ${editing.username}`}
          onClose={() => !saving && setEditing(null)}
        >
          <div className="space-y-3">
            <Field label="Username">
              <input
                type="text"
                value={editing.username}
                disabled
                className="w-full px-3 py-2 rounded text-sm font-mono opacity-60 cursor-not-allowed"
              />
            </Field>

            <Field label="Tên hiển thị" required>
              <input
                type="text"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                className="w-full px-3 py-2 rounded text-sm"
              />
            </Field>

            <Field label="Vai trò" required>
              <select
                value={editing.role}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value as "STAFF" | "CUSTOMER",
                    customerId: e.target.value === "STAFF" ? "" : editing.customerId,
                  })
                }
                className="w-full px-3 py-2 rounded text-sm"
              >
                <option value="STAFF">Nhân viên</option>
                <option value="CUSTOMER">Khách hàng</option>
              </select>
            </Field>

            {editing.role === "CUSTOMER" && (
              <Field label="Khách hàng" required>
                <select
                  value={editing.customerId}
                  onChange={(e) =>
                    setEditing({ ...editing, customerId: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded text-sm"
                >
                  <option value="">— Chọn khách hàng —</option>
                  {activeCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              </Field>
            )}

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
              <span
                className="text-[10px]"
                style={{ color: "var(--text-muted)" }}
              >
                (uncheck = vô hiệu hóa + đẩy logout tất cả session)
              </span>
            </label>
          </div>

          <ModalActions
            onCancel={() => setEditing(null)}
            onSubmit={update}
            saving={saving}
            submitLabel="Lưu"
          />
        </Modal>
      )}

      {resetting && (
        <Modal
          title={`Reset password cho ${resetting.username}`}
          onClose={() => !saving && setResetting(null)}
        >
          <p
            className="text-xs mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Sau khi reset, user sẽ bị logout khỏi tất cả thiết bị và phải đăng
            nhập lại với password mới.
          </p>

          <Field label="Password mới" required>
            <input
              type="text"
              value={resetting.password}
              onChange={(e) =>
                setResetting({ ...resetting, password: e.target.value })
              }
              placeholder=">= 8 ký tự"
              className="w-full px-3 py-2 rounded text-sm font-mono"
              autoFocus
            />
          </Field>

          <ModalActions
            onCancel={() => setResetting(null)}
            onSubmit={resetPassword}
            saving={saving}
            submitLabel="Đặt password mới"
          />
        </Modal>
      )}
    </>
  );
}

function Modal({
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
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-6 w-full max-w-md border"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="text-[11px] font-bold tracking-widest uppercase block mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        {required && <span style={{ color: "var(--accent)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  onSubmit,
  saving,
  submitLabel,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-3 mt-6">
      <Button variant="secondary" onClick={onCancel} disabled={saving}>
        Hủy
      </Button>
      <Button variant="primary" onClick={onSubmit} disabled={saving}>
        {saving ? "Đang xử lý..." : submitLabel}
      </Button>
    </div>
  );
}
