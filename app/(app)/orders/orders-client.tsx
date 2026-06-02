"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { FlagCell } from "@/components/flag-cell";
import { useFlagMap } from "@/lib/hooks/use-flag-map";
import { OrderDrawer, type DrawerOrder } from "@/components/order-drawer";
import {
  Button,
  StatusBadge,
  AttentionBadge,
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
  paymentType: string | null;
  refNumber: string | null;
  paymentProofUrl: string | null;
  reconciledAt: string | null;
}

const ATTENTION_LABELS: Record<string, string> = {
  ADDRESS_ERROR: "Address Error",
  DELAYED: "Delayed",
  NOTICE_CARD: "Notice Card",
  STUCK: "No Updates",
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

const AVATAR_COLORS = [
  { bg: "rgba(37,99,235,0.10)",   text: "#1d4ed8" },
  { bg: "rgba(59,130,246,0.10)",  text: "#1d4ed8" },
  { bg: "rgba(124,58,237,0.10)",  text: "#6d28d9" },
  { bg: "rgba(2,132,199,0.10)",   text: "#0369a1" },
  { bg: "rgba(13,148,136,0.10)",  text: "#0f766e" },
  { bg: "rgba(234,88,12,0.10)",   text: "#c2410c" },
  { bg: "rgba(219,39,119,0.10)",  text: "#be185d" },
  { bg: "rgba(217,119,6,0.10)",   text: "#a16207" },
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

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  READY: "Ready",
  ERROR: "Error",
  ERROR_UPDATED: "Updated",
  EXPORTED: "Exported",
  LABEL_CREATED: "Label Created",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  FAILED: "Failed",
};

export default function OrdersClient({ role }: { role: Role }) {
  return (
    <Suspense fallback={null}>
      <OrdersPageContent role={role} />
    </Suspense>
  );
}

function OrdersPageContent({ role }: { role: Role }) {
  const isCustomer = role === "CUSTOMER";
  const searchParams = useSearchParams();
  const { map: flagMap } = useFlagMap();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<FilterOption[]>([]);
  const [productOpts, setProductOpts] = useState<FilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [drawerOrder, setDrawerOrder] = useState<DrawerOrder | null>(null);
  const [listKey, setListKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Filters — initial từ URL search params (cho phép link từ dashboard)
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get("status") ?? "");
  const [filterReconciled, setFilterReconciled] = useState(() => searchParams.get("reconciled") ?? ""); // "" | "yes" | "no"
  const [filterCustomer, setFilterCustomer] = useState(() => searchParams.get("customer") ?? "");
  const [filterProduct, setFilterProduct] = useState(() => searchParams.get("product") ?? "");
  const [filterPayment, setFilterPayment] = useState(() => searchParams.get("payment") ?? "");
  const [filterAttention, setFilterAttention] = useState(() => searchParams.get("attention") ?? "");
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");

  const loadOrders = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    const params = new URLSearchParams();
    params.set("excludeTerminal", "true");
    if (filterStatus) params.set("status", filterStatus);
    if (filterCustomer) params.set("customer", filterCustomer);
    if (filterProduct) params.set("product", filterProduct);
    if (filterPayment) params.set("payment", filterPayment);
    if (filterAttention) params.set("attention", filterAttention);
    if (filterReconciled) params.set("reconciled", filterReconciled);
    if (search) params.set("search", search);

    const res = await fetch(`/api/orders?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      setOrders(data.data);
      // Silent refresh (vd sau khi drawer update) không bump listKey → tránh re-mount + replay animation.
      if (!opts.silent) setListKey((k) => k + 1);
    }
    if (!opts.silent) setLoading(false);
  }, [filterStatus, filterCustomer, filterProduct, filterPayment, filterAttention, filterReconciled, search]);

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
    if (!confirm(`Create batch for ${selectedKeys.size} orders? (Non-READY orders will be skipped)`)) return;

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
        setMessage("Error: " + data.error);
      }
    } finally {
      setCreating(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  async function exportFile() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "processing");
      if (filterStatus) params.set("status", filterStatus);
      if (!isCustomer && filterCustomer) params.set("customer", filterCustomer);
      if (filterProduct) params.set("product", filterProduct);
      if (filterPayment) params.set("payment", filterPayment);
      if (filterAttention) params.set("attention", filterAttention);
      if (search) params.set("search", search);

      const res = await fetch(`/api/orders/export?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        alert("Export failed: " + (data.error || res.statusText));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : `orders-processing-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function deleteSelected() {
    if (selectedKeys.size === 0) return;
    if (!confirm(`Delete ${selectedKeys.size} orders? This action cannot be undone.`)) return;

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
        setMessage("Error: " + data.error);
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

  const STATUS_TABS = [
    { value: "",               label: "All",          dot: null },
    { value: "NEW",            label: "New",          dot: "var(--color-info)" },
    { value: "READY",          label: "Ready",        dot: "var(--color-success)" },
    { value: "ERROR",          label: "Error",        dot: "var(--color-danger)" },
    { value: "ERROR_UPDATED",  label: "Updated",      dot: "var(--color-warning)" },
    { value: "EXPORTED",       label: "Exported",     dot: "var(--color-slate)" },
    { value: "LABEL_CREATED",  label: "Label",        dot: "var(--color-purple)" },
    { value: "IN_TRANSIT",     label: "In Transit",   dot: "var(--color-sky)" },
  ];

  return (
    <>
      <Topbar title="Active Orders" subtitle="Operations" showSync={!isCustomer} />

      {/* Status tabs */}
      <div className="status-tabs-bar">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`status-tab${filterStatus === tab.value ? " active" : ""}`}
            onClick={() => setFilterStatus(tab.value)}
          >
            {tab.dot && (
              <span
                className="status-tab-dot"
                style={{ background: tab.dot }}
              />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Secondary filters */}
      <FilterBar
        className={`grid gap-3 ${isCustomer ? "grid-cols-6" : "grid-cols-7"}`}
      >
        {!isCustomer && (
          <FilterField label="Customer">
            <select
              value={filterCustomer}
              onChange={(e) => {
                setFilterCustomer(e.target.value);
                setFilterProduct("");
              }}
              className="filter-input"
            >
              <option value="">All</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FilterField>
        )}

        <FilterField label="Product">
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="filter-input"
          >
            <option value="">All</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Payment">
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="filter-input"
          >
            <option value="">All</option>
            <option value="PREPAID">Prepaid</option>
            <option value="COD">COD</option>
          </select>
        </FilterField>

        <FilterField label="Attention">
          <select
            value={filterAttention}
            onChange={(e) => setFilterAttention(e.target.value)}
            className="filter-input"
          >
            <option value="">All</option>
            <option value="any">Any Flag</option>
            <option value="ADDRESS_ERROR">Address Error</option>
            <option value="DELAYED">Delayed</option>
            <option value="NOTICE_CARD">Notice Card</option>
            <option value="STUCK">No updates (3 business days)</option>
          </select>
        </FilterField>

        <FilterField label="Recon">
          <select
            value={filterReconciled}
            onChange={(e) => setFilterReconciled(e.target.value)}
            className="filter-input"
          >
            <option value="">All</option>
            <option value="yes">Reconciled</option>
            <option value="no">Not reconciled</option>
          </select>
        </FilterField>

        <FilterField label="Search" className="col-span-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order ID, Name, Phone, Zipcode..."
          />
        </FilterField>
      </FilterBar>

      {/* Action bar */}
      <div className="action-bar">
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span>
            <span className="font-bold">{orders.length}</span> orders
            {readyCount > 0 && (
              <span className="ml-2" style={{ color: "var(--color-success)" }}>
                · {readyCount} ready
              </span>
            )}
            {attentionCount > 0 && (
              <span className="ml-2" style={{ color: "#be185d" }}>
                · {attentionCount} need attention
              </span>
            )}
          </span>
          {!isCustomer && selectedKeys.size > 0 && (
            <>
              <span style={{ color: "var(--text-muted)" }}>•</span>
              <span style={{ color: "var(--accent)" }}>
                Selected {selectedKeys.size}
              </span>
              <button
                onClick={clearSelection}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Deselect
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {message && (
            <span
              className="text-xs px-3 py-1.5 rounded font-semibold"
              style={{
                backgroundColor: "rgba(22, 163, 74, 0.10)",
                color: "#15803d",
              }}
            >
              {message}
            </span>
          )}
          <Button
            variant="secondary"
            icon="download"
            onClick={exportFile}
            disabled={exporting || orders.length === 0}
            title="Export all filtered orders to Excel"
          >
            {exporting ? "Exporting..." : "Export"}
          </Button>
          {!isCustomer && (
            <>
              <Button
                variant="danger"
                icon="delete"
                onClick={deleteSelected}
                disabled={selectedKeys.size === 0 || deleting || creating}
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
              <Button
                variant="primary"
                icon="auto_awesome_motion"
                onClick={createBatch}
                disabled={selectedKeys.size === 0 || creating || deleting}
              >
                {creating ? "Creating..." : "Create Batch"}
              </Button>
            </>
          )}
        </div>
      </div>

      <OrderDrawer
        order={drawerOrder}
        onClose={() => setDrawerOrder(null)}
        role={role}
        onUpdate={() => loadOrders({ silent: true })}
      />

      {/* Table */}
      <div className="table-shell">
        {loading ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            No orders found. Click <span style={{ color: "var(--accent)" }}>Sync</span> to fetch orders.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  {!isCustomer && (
                    <th className="w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 cursor-pointer"
                        style={{ accentColor: "var(--text-secondary)" }}
                      />
                    </th>
                  )}
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Order ID
                  </th>
                  {!isCustomer && (
                    <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                      Customer
                    </th>
                  )}
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Product
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Name
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Address
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Qty
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Payment
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Status
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Attention
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Tracking
                  </th>
                  <th
                    className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase"
                    title="Reconciled — customer đã update payment cho đơn này"
                  >
                    Recon
                  </th>
                  <th className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Flag
                  </th>
                </tr>
              </thead>
              <tbody key={listKey}>
                {orders.map((o, index) => {
                  const isSelected = selectedKeys.has(o.uniqueKey);
                  return (
                    <tr
                      key={o.uniqueKey}
                      className={`row-animate${isSelected ? " selected" : ""}`}
                      style={{
                        cursor: "pointer",
                        animationDelay: `${Math.min(index, 12) * 25}ms`,
                      }}
                      onClick={() => setDrawerOrder(o)}
                    >
                      {!isCustomer && (
                        <td
                          className="px-3 py-2 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(o.uniqueKey)}
                            className="w-4 h-4 cursor-pointer"
                            style={{ accentColor: "var(--text-secondary)" }}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--text-primary)" }}>
                        {o.orderId}
                      </td>
                      {!isCustomer && (
                        <td
                          className="px-3 py-2 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {o.customerId}
                        </td>
                      )}
                      <td
                        className="px-3 py-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {o.productName}
                      </td>
                      <td className="px-3 py-2">
                        {o.name ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                              style={(() => {
                                const c = getAvatarColor(o.name);
                                return { background: c.bg, color: c.text };
                              })()}
                            >
                              {getInitials(o.name)}
                            </div>
                            <span style={{ color: "var(--text-primary)" }}>{o.name}</span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
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
                      <td className="px-3 py-2 text-center font-mono">
                        {o.quantity}
                      </td>
                      <td
                        className="px-3 py-2 text-center"
                        title={
                          o.paymentMethod === "COD"
                            ? `COD amount: ${o.codAmount ?? "?"}${o.note ? `\n${o.note}` : ""}`
                            : o.note || ""
                        }
                      >
                        <PaymentBadge method={o.paymentMethod}>
                          {o.paymentMethod === "COD" ? "COD" : "Prepaid"}
                        </PaymentBadge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <StatusBadge status={o.status}>
                          {STATUS_LABELS[o.status]}
                        </StatusBadge>
                      </td>
                      <td
                        className="px-3 py-2 text-center"
                        title={
                          o.attentionReason
                            ? [
                                o.attentionNote,
                                o.attentionAt
                                  ? `Lúc: ${new Date(o.attentionAt).toLocaleString("vi-VN")}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join("\n")
                            : undefined
                        }
                      >
                        {o.attentionReason ? (
                          <AttentionBadge reason={o.attentionReason}>
                            {ATTENTION_LABELS[o.attentionReason]}
                          </AttentionBadge>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const url = buildTrackingUrl(o);
                          if (url) {
                            return (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tracking-link"
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
                      <td className="px-3 py-2 text-center">
                        {o.reconciledAt ? (
                          <span
                            className="material-symbols-outlined text-[18px]"
                            style={{ color: "#16a34a", fontVariationSettings: '"FILL" 1' }}
                            title={`Reconciled${o.paymentType ? ` (${o.paymentType})` : ""}`}
                          >
                            check_circle
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FlagCell
                          orderUniqueKey={o.uniqueKey}
                          color={flagMap.get(o.uniqueKey)}
                        />
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
