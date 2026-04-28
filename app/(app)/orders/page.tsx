import { Topbar } from "@/components/topbar";

export default function OrdersPage() {
  return (
    <>
      <Topbar title="Đơn hàng" subtitle="Quản lý" />
      <div
        className="rounded-xl p-12 text-center border"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <span
          className="material-symbols-outlined text-6xl"
          style={{ color: "var(--text-muted)" }}
        >
          inventory_2
        </span>
        <h3 className="font-bold text-lg mt-4 text-white">Bảng đơn hàng</h3>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Phase 4.6 sẽ build: bảng đơn hàng + filter + Tạo Batch.
        </p>
      </div>
    </>
  );
}
