"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  function showMessage(text: string, type: "success" | "error" | "info" = "info") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 6000);
  }

  async function runSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showMessage(
          `Sync xong: +${data.totalAdded} mới, ${data.totalUpdated ?? 0} cập nhật (ERROR: ${data.totalErrors})`,
          "success",
        );
        router.refresh();
      } else {
        showMessage(`Lỗi: ${data.error}`, "error");
      }
    } catch (e) {
      showMessage(`Lỗi kết nối: ${(e as Error).message}`, "error");
    } finally {
      setSyncing(false);
    }
  }

  async function runValidate() {
    setValidating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/validate", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showMessage(
          `Validate xong: ${data.ready} READY, ${data.errors} ERROR (${data.validated}/${data.total} đơn)`,
          "success",
        );
        router.refresh();
      } else {
        showMessage(`Lỗi: ${data.error}`, "error");
      }
    } catch (e) {
      showMessage(`Lỗi kết nối: ${(e as Error).message}`, "error");
    } finally {
      setValidating(false);
    }
  }

  const messageColor =
    message?.type === "success"
      ? { backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399" }
      : message?.type === "error"
        ? { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#f87171" }
        : { backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" };

  return (
    <header
      className="flex items-center justify-between mb-6 pb-4 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <p
          className="text-[10px] font-bold tracking-[0.18em] uppercase mb-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          {subtitle ?? "Tổng quan"}
        </p>
        <h2 className="text-[22px] font-bold text-white tracking-tight">{title}</h2>
      </div>

      <div className="flex items-center gap-2.5">
        {message && (
          <div
            className="px-3 py-1.5 text-xs font-semibold rounded-md max-w-md"
            style={messageColor}
          >
            {message.text}
          </div>
        )}

        <button
          onClick={runSync}
          disabled={syncing || validating}
          className="btn btn-secondary"
        >
          <span
            className={`material-symbols-outlined text-[17px] ${syncing ? "animate-spin" : ""}`}
          >
            refresh
          </span>
          {syncing ? "Đang sync..." : "Đồng bộ"}
        </button>

        <button
          onClick={runValidate}
          disabled={syncing || validating}
          className="btn btn-primary"
        >
          <span
            className={`material-symbols-outlined text-[17px] ${validating ? "animate-spin" : ""}`}
          >
            verified
          </span>
          {validating ? "Đang xử lý..." : "Validate & Gán thùng"}
        </button>
      </div>
    </header>
  );
}
