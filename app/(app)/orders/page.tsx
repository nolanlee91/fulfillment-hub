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
  note: string | null;
  status:
    | "NEW"
    | "READY"
    | "ERROR"
    | "ERROR_UPDATED"
    | "EXPORTED"
    | "LABEL_CREATED"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "FAILED";
  boxCode: string | null;
  errorNote: string | null;
  batchId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  attentionReason:
    | "ADDRESS_ERROR"
    | "DELAYED"
    | "NOTICE_CARD"
    | "STUCK"
    | null;
  attentionAt: string | null;
  attentionNote: string | null;
}

const ATTENTION_LABELS: Record<string, string> = {
  ADDRESS_ERROR: "Sai địa chỉ",
  DELAYED: "Delay",
  NOTICE_CARD: "Notice card",
  STUCK: "Không cập nhật",
};

function buildTrackingUrl(o: { trackingUrl: string | null; trackingNumber: string | null }): string | null {
  if (o.trackingUrl) return o.trackingUrl;
  if (o.trackingNumber) {
    return `https://www.canadapost.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(o.trackingNumber)}`;
  }
  return null;
}

interface FilterOption {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Mới",
  READY: "Sẵn sàng",
  ERROR: "Lỗi",
  ERROR_UPDATED: "Đã cập nhật",
  EXPORTED: "Đã xuất",
  LABEL_CREATED: "Đã có label",
  IN_TRANSIT: "Đang vận chuyển",
  DELIVERED: "Đã giao",
  FAILED: "Thất bại",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<FilterOption[]>([]);
  const [productOpts, setProductOpts] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterAttention, setFilterAttention] = useState("");
  const [search, setSearch] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("excludeDelivered", "true");
    if (filterStatus) params.set("status", filterStatus);
    if (filterCustomer) params.set("customer", filterCustomer);
    if (filterProduct) params.set("product", filterProduct);
    if (filterPayment) params.set("payment", filterPayment);
    if (filterAttention) params.set("attention", filterAttention);
    if (search) params.set("search", search);

    const res = await fetch(`/api/orders?${params.toString()}`);
    const data = await res.json();
    if (data.success) setOrders(data.data);
    setLoading(false);
  }, [filterStatus, filterCustomer, filterProduct, filterPayment, filterAttention, search]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    // Load filter options once
    fetch("/api/orders", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setCustomers(data.data.customers);
          setProductOpts(data.data.products);
        }
      });
  }, []);

  function toggleSelect(uniqueKey: string) {
    const next = new Set(selectedKeys);
    if (next.has(uniqueKey)) next.delete(uniqueKey);
    else next.add(uniqueKey);
    setSelectedKeys(next);
  }

  function toggleSelectAll() {
    if (selectedKeys.size === orders.length && orders.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(orders.map((o) => o.uniqueKey)));
    }
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  async function createBatch() {
    if (selectedKeys.size === 0) return;
    if (!confirm(`Tạo batch cho ${selectedKeys.size} đơn? (Đơn không phải READY sẽ bị bỏ qua)`)) return;

    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueKeys: Array.from(selectedKeys),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        setSelectedKeys(new Set());
        await loadOrders();
      } else {
        setMessage("Lỗi: " + data.error);
      }
    } finally {
      setCreating(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  async function deleteSelected() {
    if (selectedKeys.size === 0) return;
    if (!confirm(`Xóa ${selectedKeys.size} đơn? Hành động này không thể hoàn tác.`)) return;

    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uniqueKeys: Array.from(selectedKeys),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        setSelectedKeys(new Set());
        await loadOrders();
      } else {
        setMessage("Lỗi: " + data.error);
      }
    } finally {
      setDeleting(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  const readyCount = orders.filter((o) => o.status === "READY").length;
  const attentionCount = orders.filter((o) => o.attentionReason !== null).length;
  const allSelected = orders.length > 0 && selectedKeys.size === orders.length;
  const someSelected = selectedKeys.size > 0 && selectedKeys.size < orders.length;
  const filteredProducts = filterCustomer
    ? productOpts.filter((p) => (p as FilterOption & { customerId: string }).customerId === filterCustomer)
    : productOpts;

  return (
    <>
      <Topbar title="Đơn đang xử lý" subtitle="Quản lý" />

      {/* Filters */}
      <div
        className="rounded-xl p-4 mb-4 border grid grid-cols-7 gap-3"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <div>
          <label
            className="text-[10px] font-bold tracking-widest uppercase block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Trạng thái
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm"
          >
            <option value="">Tất cả</option>
            <option value="READY">Sẵn sàng</option>
            <option value="ERROR">Lỗi</option>
            <option value="ERROR_UPDATED">Đã cập nhật</option>
            <option value="NEW">Mới</option>
            <option value="EXPORTED">Đã xuất</option>
            <option value="LABEL_CREATED">Đã có label</option>
            <option value="IN_TRANSIT">Đang vận chuyển</option>
            <option value="FAILED">Thất bại</option>
          </select>
        </div>

        <div>
          <label
            className="text-[10px] font-bold tracking-widest uppercase block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Khách hàng
          </label>
          <select
            value={filterCustomer}
            onChange={(e) => {
              setFilterCustomer(e.target.value);
              setFilterProduct("");
            }}
            className="w-full px-2 py-1.5 rounded text-sm"
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
          <label
            className="text-[10px] font-bold tracking-widest uppercase block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Sản phẩm
          </label>
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm"
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
          <label
            className="text-[10px] font-bold tracking-widest uppercase block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Thanh toán
          </label>
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm"
          >
            <option value="">Tất cả</option>
            <option value="PREPAID">Thường</option>
            <option value="COD">COD</option>
          </select>
        </div>

        <div>
          <label
            className="text-[10px] font-bold tracking-widest uppercase block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Cần chú ý
          </label>
          <select
            value={filterAttention}
            onChange={(e) => setFilterAttention(e.target.value)}
            className="w-full px-2 py-1.5 rounded text-sm"
          >
            <option value="">Tất cả</option>
            <option value="any">Có flag (mọi loại)</option>
            <option value="ADDRESS_ERROR">Sai địa chỉ</option>
            <option value="DELAYED">Delay</option>
            <option value="NOTICE_CARD">Notice card</option>
            <option value="STUCK">Không cập nhật 3 ngày</option>
          </select>
        </div>

        <div className="col-span-2">
          <label
            className="text-[10px] font-bold tracking-widest uppercase block mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Tìm kiếm (Order ID, Tên, Phone, Zipcode)
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Gõ để tìm..."
            className="w-full px-3 py-1.5 rounded text-sm"
          />
        </div>
      </div>

      {/* Action bar */}
      <div
        className="rounded-xl p-3 mb-4 border flex items-center justify-between"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span>
            <span className="font-bold text-white">{orders.length}</span> đơn
            {readyCount > 0 && (
              <span className="ml-2" style={{ color: "var(--accent)" }}>
                · {readyCount} sẵn sàng
              </span>
            )}
            {attentionCount > 0 && (
              <span className="ml-2" style={{ color: "#f472b6" }}>
                · {attentionCount} cần chú ý
              </span>
            )}
          </span>
          {selectedKeys.size > 0 && (
            <>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <span style={{ color: "var(--accent)" }}>
                Đã chọn {selectedKeys.size}
              </span>
              <button
                onClick={clearSelection}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Bỏ chọn
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {message && (
            <span
              className="text-xs px-3 py-1.5 rounded font-semibold"
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
              }}
            >
              {message}
            </span>
          )}
          <button
            onClick={deleteSelected}
            disabled={selectedKeys.size === 0 || deleting || creating}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded disabled:opacity-50"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <span className="material-symbols-outlined text-[18px]">
              delete
            </span>
            {deleting ? "Đang xóa..." : "Xóa"}
          </button>
          <button
            onClick={createBatch}
            disabled={selectedKeys.size === 0 || creating || deleting}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--bg-primary)",
            }}
          >
            <span className="material-symbols-outlined text-[18px]">
              auto_awesome_motion
            </span>
            {creating ? "Đang tạo..." : "Tạo Batch"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {loading ? (
          <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
            Đang tải...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
            Không có đơn nào. Bấm <span style={{ color: "var(--accent)" }}>Đồng bộ</span> để kéo đơn về.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th className="px-3 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 cursor-pointer"
                      style={{ accentColor: "var(--accent)" }}
                    />
                  </th>
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
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Box
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Trạng thái
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Cần chú ý
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Tracking
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const isSelected = selectedKeys.has(o.uniqueKey);
                  return (
                    <tr
                      key={o.uniqueKey}
                      className="border-t hover:bg-opacity-50 transition-colors"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: isSelected
                          ? "rgba(16, 185, 129, 0.08)"
                          : "transparent",
                      }}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(o.uniqueKey)}
                          className="w-4 h-4 cursor-pointer"
                          style={{ accentColor: "var(--accent)" }}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-bold text-white">
                        {o.orderId}
                      </td>
                      <td
                        className="px-3 py-2 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {o.customerId}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {o.productName}
                      </td>
                      <td
                        className="px-3 py-2"
                        style={{ color: "var(--text-primary)" }}
                      >
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
                      <td className="px-3 py-2 text-right font-mono">
                        {o.quantity}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`payment-${o.paymentMethod} px-2 py-0.5 rounded text-[10px] font-bold tracking-wider`}
                          title={
                            o.paymentMethod === "COD"
                              ? `Thu hộ: ${o.codAmount ?? "?"}${o.note ? `\n${o.note}` : ""}`
                              : o.note || ""
                          }
                        >
                          {o.paymentMethod === "COD" ? "COD" : "Thường"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {o.boxCode ? (
                          <span
                            className="px-2 py-0.5 rounded text-xs font-bold"
                            style={{
                              backgroundColor: "var(--accent-bg)",
                              color: "var(--accent)",
                            }}
                          >
                            {o.boxCode}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`status-${o.status} px-2 py-0.5 rounded text-[10px] font-bold tracking-wider`}
                        >
                          {STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {o.attentionReason ? (
                          <span
                            className={`attention-${o.attentionReason} px-2 py-0.5 rounded text-[10px] font-bold tracking-wider`}
                            title={
                              [
                                o.attentionNote,
                                o.attentionAt
                                  ? `Lúc: ${new Date(o.attentionAt).toLocaleString("vi-VN")}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join("\n")
                            }
                          >
                            {ATTENTION_LABELS[o.attentionReason]}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
