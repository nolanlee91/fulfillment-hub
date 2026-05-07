"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/topbar";

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
  deliveredAt: string | null;
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

export default function DeliveredOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<FilterOption[]>([]);
  const [productOpts, setProductOpts] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [search, setSearch] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", "DELIVERED");
    if (filterCustomer) params.set("customer", filterCustomer);
    if (filterProduct) params.set("product", filterProduct);
    if (filterPayment) params.set("payment", filterPayment);
    if (search) params.set("search", search);

    const res = await fetch(`/api/orders?${params.toString()}`);
    const data = await res.json();
    if (data.success) setOrders(data.data);
    setLoading(false);
  }, [filterCustomer, filterProduct, filterPayment, search]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

  const filteredProducts = filterCustomer
    ? productOpts.filter((p) => (p as FilterOption & { customerId: string }).customerId === filterCustomer)
    : productOpts;

  return (
    <>
      <Topbar title="Đơn đã giao" subtitle="Quản lý" />

      {/* Filters */}
      <div className="filter-card grid grid-cols-5 gap-3">
        <div>
          <label className="filter-label">
            Khách hàng
          </label>
          <select
            value={filterCustomer}
            onChange={(e) => {
              setFilterCustomer(e.target.value);
              setFilterProduct("");
            }}
            className="filter-input"
          >
            <option value="">Tất cả</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="filter-label">
            Sản phẩm
          </label>
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="filter-input"
          >
            <option value="">Tất cả</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="filter-label">
            Thanh toán
          </label>
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="filter-input"
          >
            <option value="">Tất cả</option>
            <option value="PREPAID">Thường</option>
            <option value="COD">COD</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="filter-label">
            Tìm kiếm (Order ID, Tên, Phone, Zipcode)
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm Order ID, Tên, Phone, Zipcode..."
            className="filter-search"
          />
        </div>
      </div>

      {/* Counter */}
      <div className="action-bar">
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="font-bold text-white">{orders.length}</span> đơn đã giao
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <span className="material-symbols-outlined text-[16px]" style={{ color: "var(--color-teal)" }}>
            check_circle
          </span>
          <span>Tỷ lệ giao thành công ổn định</span>
        </div>
      </div>

      {/* Table */}
      <div className="table-shell">
        {loading ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Đang tải...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Chưa có đơn nào đã giao.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Order ID
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Khách
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Sản phẩm
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Tên
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Địa chỉ
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Phone
                  </th>
                  <th className="text-right px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    SL
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Thanh toán
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Tracking
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Giao lúc
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.uniqueKey}>
                    <td className="px-3 py-2 font-mono text-xs font-bold text-white">
                      {o.orderId}
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {o.customerId}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>
                      {o.productName}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>
                      {o.name || "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {o.addressLine1 && (
                        <div className="truncate max-w-[220px]" title={o.addressLine1}>
                          {o.addressLine1}
                        </div>
                      )}
                      <div style={{ color: "var(--text-muted)" }}>
                        {[o.city, o.province, o.zipcode].filter(Boolean).join(", ")}
                        {o.country && o.country !== "CA" ? ` · ${o.country}` : ""}
                      </div>
                    </td>
                    <td
                      className="px-3 py-2 font-mono text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {o.phone || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{o.quantity}</td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`payment-${o.paymentMethod} px-2 py-0.5 rounded text-[10px] font-bold tracking-wider`}
                        title={o.paymentMethod === "COD" ? `Thu hộ: ${o.codAmount ?? "?"}` : ""}
                      >
                        {o.paymentMethod === "COD" ? "COD" : "Thường"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
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
                              title={o.trackingNumber ?? undefined}
                            >
                              {o.trackingNumber ?? "Track"}
                              <span className="material-symbols-outlined text-[14px]">
                                open_in_new
                              </span>
                            </a>
                          );
                        }
                        return <span style={{ color: "var(--text-muted)" }}>—</span>;
                      })()}
                    </td>
                    <td
                      className="px-3 py-2 text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {o.deliveredAt
                        ? new Date(o.deliveredAt).toLocaleString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
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
