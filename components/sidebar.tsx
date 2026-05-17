"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { CurrentUser, Role } from "@/lib/auth/current-user";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  roles?: Role[]; // undefined = tất cả role; có list = chỉ role trong list
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Tổng quan",
    items: [
      {
        href: "/dashboard",
        icon: "dashboard",
        label: "Dashboard",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
    ],
  },
  {
    label: "Quản lý",
    items: [
      { href: "/orders", icon: "inventory_2", label: "Đơn đang xử lý" },
      { href: "/flags", icon: "flag", label: "Đơn gắn cờ" },
      { href: "/delivered", icon: "task_alt", label: "Đơn đã giao" },
      { href: "/failed", icon: "assignment_return", label: "Đơn thất bại" },
      {
        href: "/batches",
        icon: "package_2",
        label: "Lô đóng gói",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      {
        href: "/import-tracking",
        icon: "upload_file",
        label: "Đối soát vận chuyển",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
    ],
  },
  {
    label: "Cài đặt",
    items: [
      {
        href: "/admin/users",
        icon: "manage_accounts",
        label: "Tài khoản",
        roles: ["SUPER_ADMIN"],
      },
      {
        href: "/settings",
        icon: "settings",
        label: "Cấu hình",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  STAFF: "Nhân viên",
  CUSTOMER: "Khách hàng",
};

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.includes(user.role),
      ),
    }))
    .filter((section) => section.items.length > 0);

  const initial = (user.name || user.username).charAt(0).toUpperCase();

  return (
    <aside
      className="fixed left-0 top-0 h-full w-60 flex flex-col z-20 border-r"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="px-5 py-5 border-b flex items-center gap-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, #5ea1ff, #3b82f6)",
            boxShadow: "0 2px 8px rgba(94, 161, 255, 0.2)",
          }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: "var(--bg-primary)" }}
          >
            local_shipping
          </span>
        </div>
        <div className="leading-tight">
          <h1
            className="text-[15px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            KDEXPRESS
          </h1>
          <p
            className="text-[10px] mt-0.5 tracking-[0.12em] font-medium lowercase"
            style={{ color: "var(--text-muted)" }}
          >
            fulfillment.hub
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto pb-4">
        {visibleSections.map((section) => (
          <div key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            <div className="space-y-px">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 mx-2 px-3 py-2 text-[13px] rounded-md transition-colors hover:bg-[rgba(255,255,255,0.025)]"
                    style={{
                      color: isActive
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                      backgroundColor: isActive
                        ? "var(--bg-tertiary)"
                        : "transparent",
                      fontWeight: isActive ? 600 : 500,
                      boxShadow: isActive
                        ? "inset 3px 0 0 var(--accent)"
                        : "none",
                    }}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{
                        color: isActive
                          ? "var(--accent)"
                          : "var(--text-muted)",
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

      <div
        className="border-t pt-2 pb-2"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="sidebar-section-label">Cá nhân</div>
        <Link
          href="/account"
          className="flex items-center gap-3 mx-2 px-3 py-2 text-[13px] rounded-md transition-colors hover:bg-[rgba(255,255,255,0.025)]"
          style={{
            color:
              pathname === "/account" || pathname.startsWith("/account/")
                ? "var(--text-primary)"
                : "var(--text-secondary)",
            backgroundColor:
              pathname === "/account" || pathname.startsWith("/account/")
                ? "var(--bg-tertiary)"
                : "transparent",
            fontWeight:
              pathname === "/account" || pathname.startsWith("/account/")
                ? 600
                : 500,
            boxShadow:
              pathname === "/account" || pathname.startsWith("/account/")
                ? "inset 3px 0 0 var(--accent)"
                : "none",
          }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{
              color:
                pathname === "/account" || pathname.startsWith("/account/")
                  ? "var(--accent)"
                  : "var(--text-muted)",
              fontVariationSettings:
                pathname === "/account" || pathname.startsWith("/account/")
                  ? '"FILL" 1, "wght" 500'
                  : '"FILL" 0, "wght" 400',
            }}
          >
            account_circle
          </span>
          Tài khoản của tôi
        </Link>
      </div>

      <div
        className="px-4 py-3 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-bold text-white truncate"
              title={user.name}
            >
              {user.name}
            </p>
            <p
              className="text-[10px] tracking-wider truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {ROLE_LABEL[user.role]}
            </p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Đăng xuất"
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--bg-tertiary)] shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="material-symbols-outlined text-[18px]">
              {loggingOut ? "hourglass_empty" : "logout"}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
