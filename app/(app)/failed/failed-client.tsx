"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { FlagCell } from "@/components/flag-cell";
import { useFlagMap } from "@/lib/hooks/use-flag-map";
import { OrderDrawer, type DrawerOrder } from "@/components/order-drawer";
import {
  Button,
  PaymentBadge,
  FilterBar,
  FilterField,
  SearchInput,
} from "@/components/ui";

type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";

interface Order {
  uniqueKey: string;
  orderId: string;
  customerId: string;
  productId: string;
  productName: string;
  name: string;
  addressLine1: string | null;
  city: string;
  province: string | null;
  zipcode: string;
  country: string | null;
  phone: string;
  quantity: number;
  paymentMethod: "PREPAID" | "COD";
  codAmount: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  lastTrackingEvent: string | null;
  lastTrackingAt: string | null;
}

interface FilterOption {
  id: string;
  name: string;
}

function buildTrackingUrl(o: { trackingUrl: string | null; trackingNumber: string | null }): string | null {
  if (o.trackingUrl) return o.trackingUrl;
  if (o.trackingNumber) {
    return `https://www.canadapost.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(o.trackingNumber)}`;
  }
  return null;
}

const AVATAR_COLORS = [
  { bg: "rgba(94,161,255,0.15)",  text: "#7ab2ff" },
  { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa" },
  { bg: "rgba(139,92,246,0.15)",  text: "#a78bfa" },
  { bg: "rgba(14,165,233,0.15)",  text: "#38bdf8" },
  { bg: "rgba(20,184,166,0.15)",  text: "#2dd4bf" },
  { bg: "rgba(249,115,22,0.15)",  text: "#fb923c" },
  { bg: "rgba(236,72,153,0.15)",  text: "#f472b6" },
  { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function FailedClient({ role }: { role: Role }) {
  const isCustomer = role === "CUSTOMER";
  const { map: flagMap } = useFlagMap();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<FilterOption[]>([]);
  const [productOpts, setProductOpts] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [drawerOrder, setDrawerOrder] = useState<DrawerOrder | null>(null);
  const [listKey, setListKey] = useState(0);

  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [search, setSearch] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", "FAILED");
    if (filterCustomer) params.set("customer", filterCustomer);
    if (filterProduct) params.set("product", filterProduct);
    if (filterPayment) params.set("payment", filterPayment);
    if (search) params.set("search", search);

    const res = await fetch(`/api/orders?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      setOrders(data.data);
      setListKey((k) => k + 1);
    }
    setLoading(false);
  }, [filterCustomer, filterProduct, filterPayment, search]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    fetch("/api/orders", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setCustomers(data.data.customers);
          setProductOpts(data.data.products);
        }
      });
  }, []);

  async function exportFile() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "failed");
      if (!isCustomer && filterCustomer) params.set("customer", filterCustomer);
      if (filterProduct) params.set("product", filterProduct);
      if (filterPayment) params.set("payment", filterPayment);
      if (search) params.set("search", search);

      const res = await fetch(`/api/orders/export?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Lỗi không xác định" }));
        alert("Lỗi xuất file: " + (data.error || res.statusText));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `orders-failed-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const filteredProducts = filterCustomer
    ? productOpts.filter((p) => (p as FilterOption & { customerId: string }).customerId === filterCustomer)
    : productOpts;

  return (
    <>
      <Topbar title="Đơn thất bại" subtitle="Quản lý" showSync={!isCustomer} />

      <OrderDrawer order={drawerOrder} onClose={() => setDrawerOrder(null)} role={role} />

      {/* Filters */}
      <FilterBar className={`grid gap-3 ${isCustomer ? "grid-cols-4" : "grid-cols-5"}`}>
        {!isCustomer && (
          <FilterField label="Khách hàng">
            <select
              value={filterCustomer}
              onChange={(e) => { setFilterCustomer(e.target.value); setFilterProduct(""); }}
              className="filter-input"
            >
              <option value="">Tất cả</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FilterField>
        )}
        <FilterField label="Sản phẩm">
          <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)} className="filter-input">
            <option value="">Tất cả</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Thanh toán">
          <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)} className="filter-input">
            <option value="">Tất cả</option>
            <option value="PREPAID">Thường</option>
            <option value="COD">COD</option>
          </select>
        </FilterField>
        <FilterField label="Tìm kiếm" className="col-span-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order ID, Tên, Phone, Zipcode..."
          />
        </FilterField>
      </FilterBar>

      {/* Counter */}
      <div className="action-bar">
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="font-bold text-white">{orders.length}</span> đơn thất bại / trả về
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--color-orange)" }}>
              assignment_return
            </span>
            <span>Đơn không giao được, đã trả về sender</span>
          </div>
          <Button
            variant="secondary"
            icon="download"
            onClick={exportFile}
            disabled={exporting || orders.length === 0}
          >
            {exporting ? "Đang xuất..." : "Xuất file"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="table-shell">
        {loading ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>Đang tải...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>Chưa có đơn nào thất bại.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Order ID</th>
                  {!isCustomer && <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Khách</th>}
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Sản phẩm</th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Tên</th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Địa chỉ</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Số lượng</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Thanh toán</th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Tracking</th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Lý do</th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">Cờ</th>
                </tr>
              </thead>
              <tbody key={listKey}>
                {orders.map((o, index) => (
                  <tr
                    key={o.uniqueKey}
                    className="row-animate"
                    style={{ cursor: "pointer", animationDelay: `${Math.min(index, 12) * 25}ms` }}
                    onClick={() => setDrawerOrder(o)}
                  >
                    <td className="px-3 py-2 font-mono text-xs font-bold text-white">{o.orderId}</td>
                    {!isCustomer && (
                      <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>{o.customerId}</td>
                    )}
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>{o.productName}</td>
                    <td className="px-3 py-2">
                      {o.name ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                            style={(() => { const c = getAvatarColor(o.name); return { background: c.bg, color: c.text }; })()}
                          >
                            {getInitials(o.name)}
                          </div>
                          <span style={{ color: "var(--text-primary)" }}>{o.name}</span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      {o.addressLine1 && (
                        <div className="truncate max-w-[220px]" title={o.addressLine1}>{o.addressLine1}</div>
                      )}
                      <div style={{ color: "var(--text-muted)" }}>
                        {[o.city, o.province, o.zipcode].filter(Boolean).join(", ")}
                        {o.country && o.country !== "CA" ? ` · ${o.country}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono">{o.quantity}</td>
                    <td
                      className="px-3 py-2 text-center"
                      title={o.paymentMethod === "COD" ? `Thu hộ: ${o.codAmount ?? "?"}` : undefined}
                    >
                      <PaymentBadge method={o.paymentMethod}>
                        {o.paymentMethod === "COD" ? "COD" : "Thường"}
                      </PaymentBadge>
                    </td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const url = buildTrackingUrl(o);
                        if (url) {
                          return (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono hover:underline"
                              style={{ color: "var(--accent)" }}
                            >
                              {o.trackingNumber ?? "Track"}
                              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            </a>
                          );
                        }
                        return <span style={{ color: "var(--text-muted)" }}>—</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                      {o.lastTrackingEvent ? (
                        <div>
                          <div className="truncate max-w-[260px]" title={o.lastTrackingEvent}>
                            {o.lastTrackingEvent}
                          </div>
                          {o.lastTrackingAt && (
                            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {new Date(o.lastTrackingAt).toLocaleString("vi-VN", {
                                day: "2-digit", month: "2-digit", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <FlagCell orderUniqueKey={o.uniqueKey} color={flagMap.get(o.uniqueKey)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
