"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TopbarProps {
  title: string;
  subtitle?: string;
  /** Hiển thị nút "Đồng bộ". Mặc định true. Đặt false cho CUSTOMER. */
  showSync?: boolean;
}

type Phase = "idle" | "syncing" | "validating";

export function Topbar({ title, subtitle, showSync = true }: TopbarProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  function showMessage(text: string, type: "success" | "error" | "info" = "info") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 8000);
  }

  async function runSyncAndValidate() {
    setMessage(null);

    // Step 1 — Đồng bộ từ Google Sheets
    setPhase("syncing");
    let syncResult: {
      success: boolean;
      totalAdded?: number;
      totalUpdated?: number;
      totalErrors?: number;
      error?: string;
    };
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      syncResult = await res.json();
    } catch (e) {
      setPhase("idle");
      showMessage(`Lỗi kết nối khi đồng bộ: ${(e as Error).message}`, "error");
      return;
    }

    if (!syncResult.success) {
      setPhase("idle");
      showMessage(`Lỗi đồng bộ: ${syncResult.error}`, "error");
      return;
    }

    // Step 2 — Validate & gán thùng
    setPhase("validating");
    let validateResult: {
      success: boolean;
      ready?: number;
      errors?: number;
      validated?: number;
      total?: number;
      error?: string;
    };
    try {
      const res = await fetch("/api/validate", { method: "POST" });
      validateResult = await res.json();
    } catch (e) {
      setPhase("idle");
      showMessage(
        `Sync OK (+${syncResult.totalAdded} mới) nhưng lỗi validate: ${(e as Error).message}`,
        "error",
      );
      router.refresh();
      return;
    }

    setPhase("idle");

    if (!validateResult.success) {
      showMessage(
        `Sync OK (+${syncResult.totalAdded} mới) nhưng lỗi validate: ${validateResult.error}`,
        "error",
      );
      router.refresh();
      return;
    }

    showMessage(
      `Hoàn tất: +${syncResult.totalAdded} mới, ${syncResult.totalUpdated ?? 0} cập nhật · ${validateResult.ready} READY, ${validateResult.errors} lỗi`,
      "success",
    );
    router.refresh();
  }

  const isRunning = phase !== "idle";
  const buttonLabel =
    phase === "syncing"
      ? "Đang đồng bộ..."
      : phase === "validating"
        ? "Đang validate..."
        : "Đồng bộ";

  const messageColor =
    message?.type === "success"
      ? { backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#34d399" }
      : message?.type === "error"
        ? { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#fca5a5" }
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

        {showSync && (
          <button
            onClick={runSyncAndValidate}
            disabled={isRunning}
            className="btn btn-primary"
            title="Kéo đơn từ Google Sheets về và tự động validate gán thùng"
          >
            <span
              className={`material-symbols-outlined text-[17px] ${isRunning ? "animate-spin" : ""}`}
            >
              {phase === "validating" ? "verified" : "refresh"}
            </span>
            {buttonLabel}
          </button>
        )}
      </div>
    </header>
  );
}
