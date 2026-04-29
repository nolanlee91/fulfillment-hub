"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: "Tổng quan",
    items: [{ href: "/dashboard", icon: "dashboard", label: "Dashboard" }],
  },
  {
    label: "Quản lý",
    items: [
      { href: "/orders", icon: "inventory_2", label: "Đơn hàng" },
      { href: "/errors", icon: "report_problem", label: "Đơn lỗi" },
      { href: "/batches", icon: "package_2", label: "Lô đóng gói" },
      { href: "/import-tracking", icon: "upload_file", label: "Đối soát ClickShip" },
    ],
  },
  {
    label: "Cài đặt",
    items: [{ href: "/settings", icon: "settings", label: "Cấu hình" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 h-full w-60 flex flex-col z-20 border-r"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div className="px-5 py-5 border-b" style={{ borderColor: "var(--border)" }}>
        <h1 className="text-base font-black text-white leading-tight">
          Fulfillment <span style={{ color: "var(--accent)" }}>Hub</span>
        </h1>
        <p
          className="text-[10px] mt-1 tracking-widest font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          WAREHOUSE 01
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto pb-4">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors"
                    style={{
                      color: isActive ? "var(--accent)" : "var(--text-secondary)",
                      backgroundColor: isActive ? "var(--accent-bg)" : "transparent",
                      borderLeft: isActive
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            S
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">Super Admin</p>
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              Superadmin
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
