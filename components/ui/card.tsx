import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Hover effect (border highlight + lift). */
  interactive?: boolean;
  /** Padding preset. `default` = p-4. `lg` = p-6. `none` = không padding. */
  padding?: "default" | "lg" | "none";
  /** Left accent strip color (vd "var(--accent)"). Optional. */
  accentLeft?: string;
  children?: ReactNode;
}

const PADDING_MAP = {
  default: "p-4",
  lg: "p-6",
  none: "",
};

export function Card({
  interactive,
  padding = "default",
  accentLeft,
  className = "",
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={`card ${interactive ? "card-interactive" : ""} ${PADDING_MAP[padding]} ${className}`}
      style={
        accentLeft
          ? {
              ...style,
              borderLeft: `3px solid ${accentLeft}`,
            }
          : style
      }
      {...rest}
    >
      {children}
    </div>
  );
}

interface LinkCardProps {
  href: string;
  padding?: "default" | "lg" | "none";
  accentLeft?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  title?: string;
}

/** Card dạng link (toàn bộ card click vào → navigate). Tự gắn `interactive`. */
export function LinkCard({
  href,
  padding = "default",
  accentLeft,
  className = "",
  style,
  children,
  title,
}: LinkCardProps) {
  return (
    <Link
      href={href}
      title={title}
      className={`card card-interactive ${PADDING_MAP[padding]} block ${className}`}
      style={
        accentLeft
          ? { ...style, borderLeft: `3px solid ${accentLeft}` }
          : style
      }
    >
      {children}
    </Link>
  );
}
