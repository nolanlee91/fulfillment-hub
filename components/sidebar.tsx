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
      { href: "/orders", icon: "inventory_2", label: "Đơn đang xử lý" },
      { href: "/delivered", icon: "task_alt", label: "Đơn đã giao" },
      { href: "/errors", icon: "report_problem", label: "Đơn lỗi" },
      { href: "/batches", icon: "package_2", label: "Lô đóng gói" },
      { href: "/import-tracking", icon: "upload_file", label: "Đối soát vận chuyển" },
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
      <div className="px-5 py-5 border-b flex items-center gap-2.5" style={{ borderColor: "var(--border)" }}>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, var(--accent), #0ea372)",
            boxShadow: "0 2px 8px rgba(16,185,129,0.25)",
          }}
        >
          <span className="material-symbols-outlined text-[18px]" style={{ color: "var(--bg-primary)" }}>
            local_shipping
          </span>
        </div>
        <div className="leading-tight">
          <h1 className="text-sm font-bold text-white tracking-tight">
            Fulfillment <span style={{ color: "var(--accent)" }}>Hub</span>
          </h1>
          <p
            className="text-[9px] mt-0.5 tracking-[0.18em] font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            WAREHOUSE 01
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto pb-4">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 mx-2 px-3 py-2 text-[13px] rounded-md transition-all"
                    style={{
                      color: isActive ? "var(--accent)" : "var(--text-secondary)",
                      backgroundColor: isActive ? "var(--accent-bg)" : "transparent",
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <span
                      className="material-symbols-outlined text-[19px]"
                      style={{
                        fontVariationSettings: isActive
                          ? '"FILL" 1, "wght" 500'
                          : '"FILL" 0, "wght" 400',
                      }}
                    >
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
            <div className="flex items-center gap-1.5">
              <span className="live-dot" />
              <p
                className="text-[10px] tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Online
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
