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
      `Huỷ đơn ${o.orderId} do hết hàng?\n\n• Chuyển sang Thất bại\n• Ghi "hết hàng" vào Tracking Number & Tracking URL trên sheet khách`,
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
      <Topbar title="Hết hàng" subtitle="Operations" showSync={false} />

      <OrderDrawer
        order={drawerOrder}
        onClose={() => setDrawerOrder(null)}
        role={role}
        onUpdate={() => loadOrders({ silent: true })}
      />

      <div className="px-6 py-5">
        <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
          Đơn bị tách ra vì thiếu tồn kho lúc tạo batch. Khi hết hàng thật, huỷ đơn để
          báo khách (ghi &quot;hết hàng&quot; lên sheet).
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
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Đang tải…</p>
        ) : orders.length === 0 ? (
          <div
            className="rounded-lg p-8 text-center text-[13px]"
            style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}
          >
            Không có đơn nào thiếu hàng. 🎉
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Mã đơn</th>
                  {!isCustomer && <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Khách</th>}
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Sản phẩm</th>
                  <th className="text-right px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">SL</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Người nhận</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">TT</th>
                  {!isCustomer && <th className="text-right px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide">Hành động</th>}
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
                          {busyKey === o.uniqueKey ? "..." : "Huỷ (hết hàng)"}
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
