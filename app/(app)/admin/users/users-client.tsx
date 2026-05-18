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
  STAFF: "Staff",
  CUSTOMER: "Customer",
};

const ROLE_COLOR: Record<Role, { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: "rgba(124, 58, 237, 0.10)", fg: "#6d28d9" },
  STAFF: { bg: "rgba(37, 99, 235, 0.10)", fg: "#1d4ed8" },
  CUSTOMER: { bg: "rgba(217, 119, 6, 0.10)", fg: "#a16207" },
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
  const [resetDone, setResetDone] = useState<{ username: string; password: string } | null>(null);
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
      alert("Please fill in username, password, and name");
      return;
    }
    if (creating.password.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }
    if (creating.role === "CUSTOMER" && !creating.customerId) {
      alert("Customer accounts must be linked to a customer");
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
        alert("Error: " + data.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function update() {
    if (!editing) return;
    if (!editing.name.trim()) {
      alert("Please enter a name");
      return;
    }
    if (editing.role === "CUSTOMER" && !editing.customerId) {
      alert("Customer accounts must be linked to a customer");
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
        alert("Error: " + data.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!resetting) return;
    if (resetting.password.length < 8) {
      alert("Password must be at least 8 characters");
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
        setResetDone({ username: resetting.username, password: resetting.password });
        setResetting(null);
      } else {
        alert("Error: " + data.error);
      }
    } finally {
      setSaving(false);
    }
  }

  function generateRandomPassword(): string {
    const lower = "abcdefghijkmnpqrstuvwxyz";
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const symbols = "!@#$%&*";
    const all = lower + upper + digits + symbols;
    const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
    const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
    for (let i = 0; i < 8; i++) chars.push(pick(all));
    return chars.sort(() => Math.random() - 0.5).join("");
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
      <Topbar title="Users" subtitle="Settings" />

      <div className="flex justify-end mb-4">
        <Button
          variant="primary"
          icon="person_add"
          onClick={() => setCreating({ ...EMPTY_CREATE })}
        >
          Create User
        </Button>
      </div>

      <div className="table-shell">
        {loading ? (
          <div
            className="p-12 text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            Loading...
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
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Customer
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Last Login
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Actions
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
                      <td className="px-4 py-3 font-mono">
                        {u.username}
                        {isSelf && (
                          <span
                            className="ml-2 text-[10px] font-normal"
                            style={{ color: "var(--text-muted)" }}
                          >
                            (you)
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
                              backgroundColor: "rgba(220, 38, 38, 0.10)",
                              color: "#dc2626",
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
                          ? new Date(u.lastLoginAt).toLocaleString("en-US")
                          : "Never logged in"}
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
                                ? "Cannot edit your own account"
                                : isSuperAdmin
                                  ? "Cannot edit SUPER_ADMIN"
                                  : ""
                            }
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => startReset(u)}
                            disabled={cannotEdit}
                            className="px-3 py-1 text-xs font-semibold rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                              backgroundColor: "rgba(245, 158, 11, 0.15)",
                              color: "#a16207",
                            }}
                            title={
                              isSelf
                                ? "Cannot reset your own password"
                                : isSuperAdmin
                                  ? "Cannot reset SUPER_ADMIN password"
                                  : ""
                            }
                          >
                            Reset PW
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
                      No users yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <Modal title="Create New User" onClose={() => !saving && setCreating(null)}>
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
                placeholder=">= 8 characters"
                className="w-full px-3 py-2 rounded text-sm font-mono"
              />
            </Field>

            <Field label="Display Name" required>
              <input
                type="text"
                value={creating.name}
                onChange={(e) =>
                  setCreating({ ...creating, name: e.target.value })
                }
                placeholder="e.g. John Smith"
                className="w-full px-3 py-2 rounded text-sm"
              />
            </Field>

            <Field label="Role" required>
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
                <option value="STAFF">Staff</option>
                <option value="CUSTOMER">Customer</option>
              </select>
            </Field>

            {creating.role === "CUSTOMER" && (
              <Field label="Customer" required>
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
                {activeCustomers.length === 0 && (
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "#dc2626" }}
                  >
                    No active customers — create one in Settings → Customer Master
                  </p>
                )}
              </Field>
            )}
          </div>

          <ModalActions
            onCancel={() => setCreating(null)}
            onSubmit={create}
            saving={saving}
            submitLabel="Create"
          />
        </Modal>
      )}

      {editing && (
        <Modal
          title={`Edit user ${editing.username}`}
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

            <Field label="Display Name" required>
              <input
                type="text"
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
                className="w-full px-3 py-2 rounded text-sm"
              />
            </Field>

            <Field label="Role" required>
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
                <option value="STAFF">Staff</option>
                <option value="CUSTOMER">Customer</option>
              </select>
            </Field>

            {editing.role === "CUSTOMER" && (
              <Field label="Customer" required>
                <select
                  value={editing.customerId}
                  onChange={(e) =>
                    setEditing({ ...editing, customerId: e.target.value })
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
                (uncheck = deactivate + force logout all sessions)
              </span>
            </label>
          </div>

          <ModalActions
            onCancel={() => setEditing(null)}
            onSubmit={update}
            saving={saving}
            submitLabel="Save"
          />
        </Modal>
      )}

      {resetting && (
        <Modal
          title={`Reset password for ${resetting.username}`}
          onClose={() => !saving && setResetting(null)}
        >
          <p
            className="text-xs mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            After reset, the user will be logged out of all devices and must
            sign in again with the new password.
          </p>

          <Field label="New Password" required>
            <div className="flex gap-2">
              <input
                type="text"
                value={resetting.password}
                onChange={(e) =>
                  setResetting({ ...resetting, password: e.target.value })
                }
                placeholder=">= 8 characters"
                className="flex-1 px-3 py-2 rounded text-sm font-mono"
                autoFocus
              />
              <button
                type="button"
                onClick={() =>
                  setResetting({ ...resetting, password: generateRandomPassword() })
                }
                className="px-3 py-2 rounded text-xs font-semibold whitespace-nowrap"
                style={{
                  backgroundColor: "var(--accent-bg)",
                  color: "var(--accent)",
                }}
                title="Generate a random 12-character password"
              >
                Generate
              </button>
            </div>
          </Field>

          <ModalActions
            onCancel={() => setResetting(null)}
            onSubmit={resetPassword}
            saving={saving}
            submitLabel="Set New Password"
          />
        </Modal>
      )}

      {resetDone && (
        <Modal title="Password Reset Successfully" onClose={() => setResetDone(null)}>
          <p
            className="text-xs mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Copy the password below and send it to{" "}
            <span className="font-mono" style={{ color: "var(--text-primary)" }}>
              {resetDone.username}
            </span>{" "}
            via a secure channel (Zalo, Telegram, in person, etc.). The user must
            sign in again with the new password and should change it after first login.
          </p>

          <div
            className="rounded p-3 font-mono text-base break-all"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              borderLeft: "3px solid var(--accent)",
            }}
          >
            {resetDone.password}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(resetDone.password);
              }}
              icon="content_copy"
            >
              Copy
            </Button>
            <Button variant="primary" onClick={() => setResetDone(null)}>
              Close
            </Button>
          </div>
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
        <h3 className="text-lg font-bold mb-4">{title}</h3>
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
        Cancel
      </Button>
      <Button variant="primary" onClick={onSubmit} disabled={saving}>
        {saving ? "Processing..." : submitLabel}
      </Button>
    </div>
  );
}
