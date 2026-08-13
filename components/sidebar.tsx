"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CurrentUser, Role } from "@/lib/auth/current-user";

interface NavItem {
  href: string;
  icon: string;
  label: string;
  roles?: Role[]; // undefined = tất cả role; có list = chỉ role trong list
  // Gate theo dịch vụ cho CUSTOMER: chỉ hiện nếu khách bật dịch vụ này.
  // Không tag = luôn hiện (vd Account). Staff/Admin bỏ qua tag (thấy hết).
  service?: "fulfillment" | "storage";
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
      { href: "/orders", icon: "inventory_2", label: "Active Orders", service: "fulfillment" },
      { href: "/delivered", icon: "task_alt", label: "Delivered", service: "fulfillment" },
      {
        href: "/batches",
        icon: "package_2",
        label: "Batches",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      {
        href: "/inventory",
        icon: "warehouse",
        label: "Inventory",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      {
        href: "/my-inventory",
        icon: "warehouse",
        label: "Inventory",
        roles: ["CUSTOMER"],
        service: "fulfillment",
      },
      {
        href: "/import-tracking",
        icon: "upload_file",
        label: "Carrier Tracking",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      {
        href: "/reconciliation",
        icon: "receipt_long",
        label: "Reconciliation",
        roles: ["CUSTOMER"],
        service: "fulfillment",
      },
      {
        href: "/reconciliation-lookup",
        icon: "manage_search",
        label: "Payment Lookup",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      // Ít dùng → để cuối
      { href: "/flags", icon: "flag", label: "Flagged", service: "fulfillment" },
      { href: "/failed", icon: "assignment_return", label: "Failed", service: "fulfillment" },
    ],
  },
  {
    label: "Storage",
    items: [
      {
        href: "/storage",
        icon: "pallet",
        label: "Pallets",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      {
        href: "/storage/requests",
        icon: "local_shipping",
        label: "Pickup Requests",
        roles: ["SUPER_ADMIN", "STAFF"],
      },
      {
        href: "/my-storage",
        icon: "pallet",
        label: "My Storage",
        roles: ["CUSTOMER"],
        service: "storage",
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

/**
 * Tự sinh file WAV chuông 3 nốt (A5·D6·G6) lặp 2 lần → data-URI (không cần file
 * ngoài, hợp CSP). Dùng cho thẻ <audio> vì AudioContext KHÔNG phát được ở tab nền.
 */
function makeChimeWavDataUri(): string {
  const sr = 22050;
  const seq: number[] = [];
  for (let rep = 0; rep < 2; rep++) for (const f of [880, 1175, 1568]) seq.push(f);
  const noteSamples = Math.floor(sr * 0.16);
  const gapSamples = Math.floor(sr * 0.05);
  const pcm = new Int16Array(seq.length * (noteSamples + gapSamples));
  let idx = 0;
  for (const freq of seq) {
    for (let i = 0; i < noteSamples; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.005) * Math.exp(-t * 5);
      const s = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
      pcm[idx++] = Math.max(-1, Math.min(1, s)) * 32767;
    }
    idx += gapSamples;
  }
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(buf);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF"); dv.setUint32(4, 36 + dataSize, true); ws(8, "WAVE");
  ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  ws(36, "data"); dv.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i], true);
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingPickups, setPendingPickups] = useState(0);
  const prevPendingRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isStaff = user.role === "SUPER_ADMIN" || user.role === "STAFF";

  function getAudio(): HTMLAudioElement | null {
    if (typeof Audio === "undefined") return null;
    if (!audioRef.current) {
      audioRef.current = new Audio(makeChimeWavDataUri());
      audioRef.current.preload = "auto";
    }
    return audioRef.current;
  }
  function playChime() {
    const a = getAudio();
    if (!a) return;
    try {
      a.currentTime = 0;
      void a.play();
    } catch {
      /* ignore */
    }
  }

  // Chuông LUÔN bật cho staff. Xin quyền Notification + "mở khóa" thẻ <audio> ở
  // click đầu (luật autoplay). Dùng <audio> vì nó phát được cả khi ở TAB NỀN
  // (AudioContext bị trình duyệt treo khi tab không active).
  useEffect(() => {
    if (!isStaff || typeof window === "undefined") return;
    const ask = () => {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    };
    ask();
    const onFirst = () => {
      ask();
      const a = getAudio();
      if (a) {
        // phát rồi dừng ngay để mở khóa autoplay (cho lần kêu sau, kể cả tab nền)
        a.play()
          .then(() => {
            a.pause();
            a.currentTime = 0;
          })
          .catch(() => {});
      }
      document.removeEventListener("click", onFirst);
    };
    document.addEventListener("click", onFirst);
    return () => document.removeEventListener("click", onFirst);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff]);

  // Badge + chuông: đếm pickup request PENDING (staff). Refetch khi đổi trang + mỗi 60s.
  useEffect(() => {
    if (!isStaff) return;
    let alive = true;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/storage/requests/pending-count");
        const data = await res.json();
        if (!alive || !data.success) return;
        const c = data.count as number;
        const prev = prevPendingRef.current;
        // Có request MỚI (số tăng) → KÊU CHUÔNG (không phụ thuộc quyền Notification)
        // + bật thông báo desktop NẾU đã cấp quyền. Bỏ qua lần load đầu (prev = null).
        if (prev != null && c > prev) {
          playChime();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification("Yêu cầu lấy hàng mới", {
                body: `Có ${c} yêu cầu đang chờ xử lý`,
                icon: "/logo.png",
              });
            } catch {
              /* ignore */
            }
          }
        }
        prevPendingRef.current = c;
        setPendingPickups(c);
      } catch {
        /* im lặng — badge/chuông không quan trọng bằng app chạy */
      }
    };
    fetchCount();
    const t = setInterval(fetchCount, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [isStaff, pathname]);

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
      items: section.items.filter((item) => {
        if (item.roles && !item.roles.includes(user.role)) return false;
        // Gate theo dịch vụ chỉ áp cho CUSTOMER; staff/admin thấy hết.
        if (user.role === "CUSTOMER" && item.service) {
          if (item.service === "fulfillment" && !user.fulfillmentEnabled) return false;
          if (item.service === "storage" && !user.storageEnabled) return false;
        }
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

  const initial = (user.name || user.username).charAt(0).toUpperCase();

  // Chỉ MỘT item active: chọn href khớp DÀI NHẤT (tránh /storage sáng cùng
  // /storage/requests vì cả 2 đều là prefix của pathname).
  const activeHref = visibleSections
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((h) => pathname === h || pathname.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];

  const accountActive = pathname === "/account" || pathname.startsWith("/account/");

  return (
    <>
      {/* Mobile top bar (chỉ màn nhỏ) */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 h-14 z-30 flex items-center justify-between px-4 border-b"
        style={{ backgroundColor: "#ffffff", borderColor: "rgba(0,0,0,0.08)" }}
      >
        <Image src="/logo.png" alt="KDExpress" width={120} height={59} priority className="h-7 w-auto" />
        <button
          onClick={() => setMobileOpen(true)}
          className="material-symbols-outlined text-[26px]"
          style={{ color: "var(--text-primary)" }}
          aria-label="Open menu"
        >
          menu
        </button>
      </div>

      {/* Backdrop khi drawer mở (mobile) */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

    <aside
      className={`fixed left-0 top-0 h-full w-60 flex flex-col z-40 border-r transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
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
          className="text-[10px] tracking-[0.12em] font-semibold lowercase"
          style={{ color: "#4b5563" }}
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
                const isActive = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
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
                    {item.href === "/storage/requests" && pendingPickups > 0 && (
                      <span
                        className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                        style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                        title={`${pendingPickups} yêu cầu đang chờ`}
                      >
                        {pendingPickups}
                      </span>
                    )}
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
          onClick={() => setMobileOpen(false)}
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
          {isStaff && (
            <button
              onClick={() => {
                if (
                  typeof Notification !== "undefined" &&
                  Notification.permission === "default"
                ) {
                  Notification.requestPermission().catch(() => {});
                }
                playChime();
              }}
              title="Nghe thử chuông thông báo (bấm 1 lần để mở âm thanh)"
              className="w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-[var(--sidebar-surface)] shrink-0"
              style={{ color: "var(--sidebar-text-muted)" }}
            >
              <span className="material-symbols-outlined text-[18px]">notifications_active</span>
            </button>
          )}
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
    </>
  );
}
