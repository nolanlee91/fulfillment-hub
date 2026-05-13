import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Material Symbols icon name (vd "refresh", "add"). Render trước label. */
  icon?: string;
  /** Spin icon (khi loading). */
  iconSpin?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  icon,
  iconSpin,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant} ${className}`} {...rest}>
      {icon && (
        <span
          className={`material-symbols-outlined text-[17px] ${iconSpin ? "animate-spin" : ""}`}
        >
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
