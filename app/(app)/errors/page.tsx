import { Topbar } from "@/components/topbar";

export default function ErrorsPage() {
  return (
    <>
      <Topbar title="Đơn lỗi" subtitle="Quản lý" />
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
          report_problem
        </span>
        <h3 className="font-bold text-lg mt-4 text-white">Đơn cần xử lý</h3>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Phase 4.6 sẽ build: list đơn ERROR + Recheck.
        </p>
      </div>
    </>
  );
}
