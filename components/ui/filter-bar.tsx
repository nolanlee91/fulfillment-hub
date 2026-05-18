import type { ReactNode } from "react";

interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper cho hàng filter ở đầu page (search + dropdown).
 * Sử dụng class .filter-card đã có sẵn trong globals.css.
 *
 * Bên trong dùng <FilterField label="..."> để bọc từng input/select.
 */
export function FilterBar({ children, className = "" }: FilterBarProps) {
  return <div className={`filter-card ${className}`}>{children}</div>;
}

interface FilterFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function FilterField({ label, children, className = "" }: FilterFieldProps) {
  return (
    <div className={className}>
      <label className="filter-label">{label}</label>
      {children}
    </div>
  );
}

interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Wrapper class — vd "flex-1" để fill container. */
  wrapperClassName?: string;
}

/**
 * Input search có icon kính lúp bên trái (dùng class .filter-search).
 */
export function SearchInput({
  wrapperClassName = "",
  className = "",
  placeholder = "Search...",
  ...rest
}: SearchInputProps) {
  return (
    <div className={wrapperClassName}>
      <input
        type="text"
        placeholder={placeholder}
        className={`filter-search ${className}`}
        {...rest}
      />
    </div>
  );
}
