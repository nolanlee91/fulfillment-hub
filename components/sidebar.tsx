"use client";

import Image from "next/image";
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
    label: "Overview",
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
    label: "Operations",
    items: [
      { href: "/orders", icon: "inventory_2", label: "Active Orders" },
      { href: "/flags", icon: "flag", label: "Flagged" },
      { href: "/delivered", icon: "task_alt", label: "Delivered" },
      { href: "/failed", icon: "assignment_return", label: "Failed" },
      {
        href: "/batches",
        icon: "package_2",
        label: "Batches",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      {
        href: "/import-tracking",
        icon: "upload_file",
        label: "Carrier Tracking",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        href: "/admin/users",
        icon: "manage_accounts",
        label: "Users",
        roles: ["SUPER_ADMIN"],
      },
      {
        href: "/settings",
        icon: "settings",
        label: "Configuration",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  STAFF: "Staff",
  CUSTOMER: "Customer",
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

  const accountActive = pathname === "/account" || pathname.startsWith("/account/");

  return (
    <aside
      className="fixed left-0 top-0 h-full w-60 flex flex-col z-20 border-r"
      style={{
        backgroundColor: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <div
        className="px-5 py-5 border-b flex flex-col items-start gap-1"
        style={{
          backgroundColor: "#ffffff",
          borderColor: "rgba(0, 0, 0, 0.08)",
        }}
      >
        <Image
          src="/logo.png"
          alt="KDExpress"
          width={187}
          height={92}
          priority
          className="h-9 w-auto"
        />
        <p
          className="text-[10px] tracking-[0.12em] font-medium lowercase"
          style={{ color: "#6b7280" }}
        >
          fulfillment.hub
        </p>
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
                    className="flex items-center gap-3 mx-2 px-3 py-2 text-[13px] rounded-md transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    style={{
                      color: isActive
                        ? "var(--sidebar-text)"
                        : "var(--sidebar-text-secondary)",
                      backgroundColor: isActive
                        ? "var(--sidebar-surface)"
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
                          : "var(--sidebar-text-muted)",
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
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div className="sidebar-section-label">Account</div>
        <Link
          href="/account"
          className="flex items-center gap-3 mx-2 px-3 py-2 text-[13px] rounded-md transition-colors hover:bg-[rgba(255,255,255,0.03)]"
          style={{
            color: accountActive ? "var(--sidebar-text)" : "var(--sidebar-text-secondary)",
            backgroundColor: accountActive ? "var(--sidebar-surface)" : "transparent",
            fontWeight: accountActive ? 600 : 500,
            boxShadow: accountActive ? "inset 3px 0 0 var(--accent)" : "none",
          }}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{
              color: accountActive ? "var(--accent)" : "var(--sidebar-text-muted)",
              fontVariationSettings: accountActive
                ? '"FILL" 1, "wght" 500'
                : '"FILL" 0, "wght" 400',
            }}
          >
            account_circle
          </span>
          My Account
        </Link>
      </div>

      <div
        className="px-4 py-3 border-t"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{
              backgroundColor: "var(--accent)",
              color: "#ffffff",
            }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-semibold truncate"
              style={{ color: "var(--sidebar-text)" }}
              title={user.name}
            >
              {user.name}
            </p>
            <p
              className="text-[10px] tracking-wider truncate"
              style={{ color: "var(--sidebar-text-muted)" }}
            >
              {ROLE_LABEL[user.role]}
            </p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--sidebar-surface)] shrink-0"
            style={{ color: "var(--sidebar-text-muted)" }}
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
