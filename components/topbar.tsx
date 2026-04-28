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
    setTimeout(() => setMessage(null), 5000);
  }

  async function runSync() {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        showMessage(
          `Sync xong: +${data.totalAdded} đơn (ERROR: ${data.totalErrors})`,
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

  function runValidate() {
    setValidating(true);
    showMessage("Chức năng đang phát triển (Phase 4.5)", "info");
    setTimeout(() => setValidating(false), 1500);
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
          className="text-[11px] font-bold tracking-widest uppercase mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          {subtitle ?? "Tổng quan"}
        </p>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        {message && (
          <div
            className="px-3 py-1.5 text-xs font-semibold rounded"
            style={messageColor}
          >
            {message.text}
          </div>
        )}

        <button
          onClick={runSync}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded transition-colors disabled:opacity-50"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ animation: syncing ? "spin 1s linear infinite" : "none" }}
          >
            refresh
          </span>
          {syncing ? "Đang sync..." : "Đồng bộ"}
        </button>

        <button
          onClick={runValidate}
          disabled={validating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded transition-colors disabled:opacity-50"
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--bg-primary)",
          }}
        >
          <span className="material-symbols-outlined text-[18px]">verified</span>
          Validate &amp; Gán thùng
        </button>
      </div>

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </header>
  );
}
