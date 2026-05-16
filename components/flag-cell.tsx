"use client";

import Link from "next/link";
import type { FlagColor } from "@/lib/hooks/use-flag-map";

interface FlagCellProps {
  orderUniqueKey: string;
  /**
   * undefined = chưa từng gắn cờ (icon mờ outline).
   * null = đã gỡ cờ (icon xám fill).
   * "red"|"yellow" = đang có cờ.
   */
  color: FlagColor | undefined;
}

const COLOR_MAP: Record<string, { bg: string; fg: string; label: string }> = {
  red: { bg: "rgba(239, 68, 68, 0.15)", fg: "#ef4444", label: "Cờ đỏ" },
  yellow: { bg: "rgba(250, 204, 21, 0.15)", fg: "#facc15", label: "Cờ vàng" },
  resolved: { bg: "rgba(107, 114, 128, 0.15)", fg: "#9ca3af", label: "Đã gỡ" },
  none: { bg: "transparent", fg: "var(--text-muted)", label: "Gắn cờ" },
};

export function FlagCell({ orderUniqueKey, color }: FlagCellProps) {
  const key =
    color === "red"
      ? "red"
      : color === "yellow"
        ? "yellow"
        : color === null
          ? "resolved"
          : "none";
  const { bg, fg, label } = COLOR_MAP[key];
  const filled = key !== "none";

  return (
    <Link
      href={`/flags?order=${encodeURIComponent(orderUniqueKey)}`}
      title={label}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:opacity-80"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span
        className="material-symbols-outlined text-[18px]"
        style={{
          fontVariationSettings: filled
            ? '"FILL" 1, "wght" 500'
            : '"FILL" 0, "wght" 400',
        }}
      >
        flag
      </span>
    </Link>
  );
}
