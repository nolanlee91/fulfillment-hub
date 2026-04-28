import { Topbar } from "@/components/topbar";

export default function BatchesPage() {
  return (
    <>
      <Topbar title="Lô đóng gói" subtitle="Quản lý" />
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
          package_2
        </span>
        <h3 className="font-bold text-lg mt-4 text-white">Danh sách Batch</h3>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Phase 4.7 sẽ build: list các batch + Export.
        </p>
      </div>
    </>
  );
}
