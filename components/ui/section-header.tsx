import type { ReactNode } from "react";

interface SectionHeaderProps {
  /** Label uppercase (vd "FULFILLMENT OPERATIONS"). */
  label: string;
  /** Số đứng trước label (vd "01"). Optional. */
  number?: string | number;
  /** Action element bên phải (vd link "Xem tất cả"). Optional. */
  right?: ReactNode;
  className?: string;
}

/**
 * Section header style App Hub:
 *   "01  FULFILLMENT OPERATIONS  ─────────────────  [right]"
 *
 * `.section-label::after` (globals.css) tự fill flex:1 gạch ngang giữa
 * label và `right`, nên `right` luôn nằm sát mép phải.
 */
export function SectionHeader({
  label,
  number,
  right,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`section-label ${className}`}>
      {number !== undefined && (
        <span className="section-num">{String(number).padStart(2, "0")}</span>
      )}
      <span>{label}</span>
      {right}
    </div>
  );
}
