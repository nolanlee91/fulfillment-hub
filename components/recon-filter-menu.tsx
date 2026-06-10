"use client";

import { useState } from "react";
import { RECON_MENU, reconFilterLabel } from "@/lib/recon-filter";

/**
 * Dropdown lọc Recon có submenu hover: các mục "Reconciled · not booked" và
 * "Booked" khi di chuột vào sẽ xổ ra ETF / non-ETF để chọn.
 */
export function ReconFilterMenu({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Trigger — trông như filter-input */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="filter-input w-full flex items-center justify-between gap-2 text-left"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-sm)",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
        title="Reconciled (customer upload) → Booked (KDExpress); ETF / non-ETF"
      >
        <span className="truncate">{reconFilterLabel(value)}</span>
        <span className="material-symbols-outlined text-[18px] shrink-0">
          {open ? "arrow_drop_up" : "arrow_drop_down"}
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop đóng menu khi click ra ngoài */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            className="absolute left-0 top-full mt-1 z-50 min-w-[220px] rounded-md border py-1 shadow-lg"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
          >
            {RECON_MENU.map((node) => {
              const active = value === node.value;
              if (!node.children) {
                return (
                  <button
                    key={node.value || "all"}
                    type="button"
                    onClick={() => select(node.value)}
                    className="recon-menu-item w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                    style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}
                  >
                    {node.label}
                    {active && (
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    )}
                  </button>
                );
              }

              // Mục có submenu hover (ETF / non-ETF)
              const childActive = node.children.some((c) => c.value === value);
              return (
                <div key={node.value} className="group/sub relative">
                  <button
                    type="button"
                    onClick={() => select(node.value)}
                    className="recon-menu-item w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                    style={{
                      color: childActive ? "var(--accent)" : "var(--text-primary)",
                    }}
                  >
                    {node.label}
                    <span className="material-symbols-outlined text-[18px]">
                      chevron_right
                    </span>
                  </button>

                  {/* Submenu — hiện khi hover vào mục cha */}
                  <div
                    className="absolute left-full top-0 -mt-1 ml-0 hidden group-hover/sub:block min-w-[140px] rounded-md border py-1 shadow-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      borderColor: "var(--border)",
                    }}
                  >
                    {node.children.map((c) => {
                      const cActive = value === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => select(c.value)}
                          className="recon-menu-item w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                          style={{
                            color: cActive ? "var(--accent)" : "var(--text-primary)",
                          }}
                        >
                          {c.label}
                          {cActive && (
                            <span className="material-symbols-outlined text-[16px]">check</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
