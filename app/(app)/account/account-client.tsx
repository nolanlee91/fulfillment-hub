"use client";

import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  STAFF: "Staff",
  CUSTOMER: "Customer",
};

export default function AccountClient({
  username,
  name,
  role,
}: {
  username: string;
  name: string;
  role: Role;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function submit() {
    setMessage(null);
    if (!currentPassword) {
      setMessage({ text: "Please enter your current password", type: "error" });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ text: "New password must be at least 8 characters", type: "error" });
      return;
    }
    if (newPassword !== confirm) {
      setMessage({ text: "Password confirmation does not match", type: "error" });
      return;
    }
    if (newPassword === currentPassword) {
      setMessage({ text: "New password must be different from the current password", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          text: "Password changed. Other devices will be signed out.",
          type: "success",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirm("");
      } else {
        setMessage({ text: data.error || "Failed to change password", type: "error" });
      }
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar title="My Account" subtitle="Profile" showSync={false} />

      <div className="max-w-2xl space-y-6">
        <Card padding="lg">
          <h3
            className="text-[11px] font-bold tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Account Information
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            <InfoRow label="Display Name" value={name} />
            <InfoRow label="Username" value={<span className="font-mono">{username}</span>} />
            <InfoRow label="Role" value={ROLE_LABEL[role]} />
          </div>
        </Card>

        <Card padding="lg">
          <h3
            className="text-[11px] font-bold tracking-widest uppercase mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Change Password
          </h3>

          <div className="space-y-3">
            <PasswordField
              label="Current Password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrent}
              onToggle={() => setShowCurrent(!showCurrent)}
            />
            <PasswordField
              label="New Password (>= 8 characters)"
              value={newPassword}
              onChange={setNewPassword}
              show={showNew}
              onToggle={() => setShowNew(!showNew)}
            />
            <PasswordField
              label="Confirm New Password"
              value={confirm}
              onChange={setConfirm}
              show={showNew}
              onToggle={() => setShowNew(!showNew)}
            />
          </div>

          {message && (
            <div
              className="mt-4 px-3 py-2 rounded text-sm"
              style={{
                backgroundColor:
                  message.type === "success"
                    ? "rgba(74, 222, 128, 0.10)"
                    : "rgba(239, 68, 68, 0.12)",
                color: message.type === "success" ? "#4ade80" : "#fca5a5",
              }}
            >
              {message.text}
            </div>
          )}

          <div className="flex justify-end mt-6">
            <Button
              variant="primary"
              icon="lock_reset"
              onClick={submit}
              disabled={saving}
            >
              {saving ? "Saving..." : "Change Password"}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-sm font-medium mt-0.5"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <label
        className="text-[11px] font-bold tracking-widest uppercase block mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 pr-10 rounded text-sm font-mono"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded transition-colors hover:bg-[var(--bg-tertiary)]"
          title={show ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: "var(--text-muted)" }}
          >
            {show ? "visibility_off" : "visibility"}
          </span>
        </button>
      </div>
    </div>
  );
}
