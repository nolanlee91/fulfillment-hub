import { Topbar } from "@/components/topbar";

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Cấu hình" subtitle="Cài đặt" />
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
          settings
        </span>
        <h3 className="font-bold text-lg mt-4 text-white">Cấu hình hệ thống</h3>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          Phase 4.4 sẽ build: 3 tab (Box Master, Product Master, Box Rules).
        </p>
      </div>
    </>
  );
}
