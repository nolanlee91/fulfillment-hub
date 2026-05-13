"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TopbarProps {
  title: string;
  subtitle?: string;
  /** Mô tả thêm dưới title (1 câu). Tuỳ chọn. */
  description?: string;
  /** 1 từ trong title được highlight màu accent (App Hub style). Tuỳ chọn. */
  accentWord?: string;
  /** Hiển thị nút "Đồng bộ". Mặc định true. Đặt false cho CUSTOMER. */
  showSync?: boolean;
}

type Phase = "idle" | "syncing" | "validating";

export function Topbar({
  title,
  subtitle,
  description,
  accentWord,
  showSync = true,
}: TopbarProps) {
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
        : { backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" };

  const titleNode = accentWord && title.includes(accentWord) ? (
    <>
      {title.split(accentWord).map((part, i, arr) => (
        <span key={i}>
          {part}
          {i < arr.length - 1 && (
            <span className="page-title-accent">{accentWord}</span>
          )}
        </span>
      ))}
    </>
  ) : (
    title
  );

  return (
    <header className="mb-8">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="page-eyebrow">{subtitle ?? "Tổng quan"}</p>
          <h1 className="page-title">{titleNode}</h1>
          {description && <p className="page-subtitle">{description}</p>}
        </div>

        <div className="flex items-center gap-2.5 shrink-0 pt-1">
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
      </div>
    </header>
  );
}
