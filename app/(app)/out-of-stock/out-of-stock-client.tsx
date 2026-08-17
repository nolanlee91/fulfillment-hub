"use client";

import { useEffect, useState, useCallback } from "react";
import { Topbar } from "@/components/topbar";
import { OrderDrawer, type DrawerOrder } from "@/components/order-drawer";
import { PaymentBadge } from "@/components/ui";

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
  errorNote: string | null;
}

export default function OutOfStockClient({ role }: { role: Role }) {
  const isCustomer = role === "CUSTOMER";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOrder, setDrawerOrder] = useState<DrawerOrder | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    const res = await fetch(`/api/orders?status=OUT_OF_STOCK`);
    const data = await res.json();
    if (data.success) setOrders(data.data);
    if (!opts.silent) setLoading(false);
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function cancelOos(o: Order) {
    if (!confirm(
      `Cancel order ${o.orderId} (out of stock)?\n\n• Move to Failed\n• Write "hết hàng" to Tracking Number & Tracking URL on the customer sheet`,
    )) return;
    setBusyKey(o.uniqueKey);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(o.uniqueKey)}/cancel-oos`,
        { method: "POST" },
      );
      const data = await res.json();
      setMessage(data.success ? data.message : `Lỗi: ${data.error}`);
      if (data.success) await loadOrders({ silent: true });
    } catch (e) {
      setMessage(`Lỗi: ${(e as Error).message}`);
    } finally {
      setBusyKey(null);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  return (
    <>
      <Topbar title="Out of Stock" subtitle="Operations" showSync={false} />

      <OrderDrawer
        order={drawerOrder}
        onClose={() => setDrawerOrder(null)}
        role={role}
        onUpdate={() => loadOrders({ silent: true })}
      />

      <div className="px-6 py-5">
        <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
          Orders split off due to insufficient stock at batch time. When truly out of
          stock, cancel to notify the customer (writes &quot;hết hàng&quot; on the sheet).
        </p>

        {message && (
          <div
            className="mb-4 rounded-lg p-3 text-[12px]"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            {message}
          </div>
        )}

        {loading ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : orders.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center text-[13px]"
            style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}
          >
            No out-of-stock orders. 🎉
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Order ID</th>
                  {!isCustomer && <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Customer</th>}
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Product</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Qty</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Recipient</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Payment</th>
                  {!isCustomer && <th className="text-right px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Action</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.uniqueKey}
                    className="border-t"
                    style={{ borderColor: "var(--border)", cursor: "pointer" }}
                  >
                    <td className="px-3 py-2 font-mono" onClick={() => setDrawerOrder({ ...o, status: "OUT_OF_STOCK" })} style={{ color: "var(--text-primary)" }}>{o.orderId}</td>
                    {!isCustomer && <td className="px-3 py-2" onClick={() => setDrawerOrder({ ...o, status: "OUT_OF_STOCK" })} style={{ color: "var(--text-secondary)" }}>{o.customerId}</td>}
                    <td className="px-3 py-2" onClick={() => setDrawerOrder({ ...o, status: "OUT_OF_STOCK" })} style={{ color: "var(--text-secondary)" }}>{o.productName}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold" onClick={() => setDrawerOrder({ ...o, status: "OUT_OF_STOCK" })}>{o.quantity}</td>
                    <td className="px-3 py-2" onClick={() => setDrawerOrder({ ...o, status: "OUT_OF_STOCK" })} style={{ color: "var(--text-secondary)" }}>{o.name}</td>
                    <td className="px-3 py-2" onClick={() => setDrawerOrder({ ...o, status: "OUT_OF_STOCK" })}><PaymentBadge method={o.paymentMethod} /></td>
                    {!isCustomer && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => cancelOos(o)}
                          disabled={busyKey === o.uniqueKey}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-semibold transition-colors disabled:opacity-50"
                          style={{ backgroundColor: "rgba(190,24,93,0.1)", color: "#be185d" }}
                        >
                          <span className="material-symbols-outlined text-[14px]">cancel</span>
                          {busyKey === o.uniqueKey ? "..." : "Cancel (out of stock)"}
                        </button>
                      </td>
                    )}
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
