"use client";

import { useEffect, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  title?: string;
  className?: string;
}

/**
 * Custom dropdown thay cho <select> gốc — panel nổi có đổ bóng + hiệu ứng xổ
 * + hàng hover, click ra ngoài / Esc tự đóng. Chuẩn UI dùng chung cho filter.
 *
 * Lý do không dùng <select> gốc: list xổ ra của select gốc do trình duyệt vẽ,
 * không style được (đổ bóng/animation/hover).
 */
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "All",
  title,
  className = "",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`dropdown ${className}`} title={title}>
      <button
        type="button"
        className={`dropdown-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "" : "dropdown-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="material-symbols-outlined dropdown-chevron">expand_more</span>
      </button>
      {open && (
        <div className="dropdown-panel" role="listbox">
          {options.map((o) => (
            <button
              type="button"
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`dropdown-item${o.value === value ? " selected" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
