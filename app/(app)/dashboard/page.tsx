import { Topbar } from "@/components/topbar";
import { db } from "@/lib/db";
import { orders, batches } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

async function getDashboardStats() {
  const statusCounts = await db
    .select({
      status: orders.status,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .groupBy(orders.status);

  const stats = {
    total: 0,
    new: 0,
    ready: 0,
    error: 0,
    exported: 0,
    labeled: 0,
  };

  for (const row of statusCounts) {
    const count = Number(row.count);
    stats.total += count;
    if (row.status === "NEW") stats.new = count;
    else if (row.status === "READY") stats.ready = count;
    else if (row.status === "ERROR" || row.status === "ERROR_UPDATED")
      stats.error += count;
    else if (row.status === "EXPORTED") stats.exported = count;
    else if (row.status === "LABEL_CREATED") stats.labeled = count;
  }

  const batchCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(batches);

  return {
    ...stats,
    batches: Number(batchCount[0]?.count ?? 0),
  };
}

export const dynamic = "force-dynamic";

interface StatCardProps {
  label: string;
  value: number;
  description?: string;
  accent?: "emerald" | "red" | "blue" | "slate" | "violet";
  highlight?: boolean;
}

function StatCard({
  label,
  value,
  description,
  accent = "slate",
  highlight = false,
}: StatCardProps) {
  const accentColors = {
    emerald: "#10b981",
    red: "#ef4444",
    blue: "#3b82f6",
    slate: "#94a3b8",
    violet: "#8b5cf6",
  };
  const color = accentColors[accent];

  return (
    <div
      className="rounded-xl p-5 border"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: highlight ? color : "var(--border)",
        borderLeftWidth: highlight ? "4px" : "1px",
      }}
    >
      <p
        className="text-[11px] font-bold tracking-widest uppercase mb-3"
        style={{ color }}
      >
        {label}
      </p>
      <p className="text-4xl font-bold" style={{ color }}>
        {value}
      </p>
      {description && (
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <>
      <Topbar title="Dashboard" subtitle="Tổng quan" />

      <div className="grid grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Sẵn sàng"
          value={stats.ready}
          description="Sẵn sàng đóng gói"
          accent="emerald"
        />
        <StatCard
          label="Đã xuất"
          value={stats.exported}
          description="Đã xuất batch, chờ label"
          accent="slate"
        />
        <StatCard
          label="Đã có label"
          value={stats.labeled}
          description="Có tracking, chờ ship"
          accent="violet"
        />
        <StatCard
          label="Lỗi"
          value={stats.error}
          description="Cần sửa thông tin"
          accent="red"
          highlight
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Tổng đơn" value={stats.total} accent="slate" />
        <StatCard
          label="Chưa xử lý"
          value={stats.new}
          description="Chờ Validate"
          accent="blue"
        />
        <StatCard label="Số batch" value={stats.batches} accent="slate" />
      </div>

      <div
        className="rounded-xl p-6 border"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <h3 className="font-bold text-lg text-white mb-3">Hoạt động gần đây</h3>
        {stats.new > 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Có{" "}
            <span className="font-bold" style={{ color: "#60a5fa" }}>
              {stats.new}
            </span>{" "}
            đơn NEW chưa được validate. Bấm{" "}
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              &quot;Validate &amp; Gán thùng&quot;
            </span>{" "}
            để xử lý.
          </p>
        ) : stats.total === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Chưa có đơn hàng nào. Bấm{" "}
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              &quot;Đồng bộ&quot;
            </span>{" "}
            để kéo đơn từ Google Sheets.
          </p>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Hệ thống đang ổn định. Tất cả đơn đã được xử lý.
          </p>
        )}
      </div>
    </>
  );
}
