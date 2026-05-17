import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { db } from "@/lib/db";
import { orders, batches, trackingFiles, syncLogs, flags } from "@/lib/db/schema";
import { sql, desc, asc, isNotNull, eq } from "drizzle-orm";
import { requirePageRole } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

async function getDashboardData() {
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
    errorUpdated: 0,
    exported: 0,
    exportedClickship: 0,
    exportedEst: 0,
    labeled: 0,
    inTransit: 0,
    delivered: 0,
    failed: 0,
  };

  // Count EXPORTED by platform (qua join batches)
  const exportedByPlatform = await db
    .select({
      platform: batches.platform,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .leftJoin(batches, eq(orders.batchId, batches.id))
    .where(eq(orders.status, "EXPORTED"))
    .groupBy(batches.platform);

  for (const row of exportedByPlatform) {
    const c = Number(row.count);
    if (row.platform === "CLICKSHIP") stats.exportedClickship = c;
    else if (row.platform === "EST") stats.exportedEst = c;
  }

  for (const row of statusCounts) {
    const count = Number(row.count);
    stats.total += count;
    if (row.status === "NEW") stats.new = count;
    else if (row.status === "READY") stats.ready = count;
    else if (row.status === "ERROR") stats.error = count;
    else if (row.status === "ERROR_UPDATED") stats.errorUpdated = count;
    else if (row.status === "EXPORTED") stats.exported = count;
    else if (row.status === "LABEL_CREATED") stats.labeled = count;
    else if (row.status === "IN_TRANSIT") stats.inTransit = count;
    else if (row.status === "DELIVERED") stats.delivered = count;
    else if (row.status === "FAILED") stats.failed = count;
  }

  const attentionRows = await db
    .select({
      reason: orders.attentionReason,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(isNotNull(orders.attentionReason))
    .groupBy(orders.attentionReason);

  const attention = {
    total: 0,
    addressError: 0,
    delayed: 0,
    noticeCard: 0,
    stuck: 0,
  };
  for (const r of attentionRows) {
    const c = Number(r.count);
    attention.total += c;
    if (r.reason === "ADDRESS_ERROR") attention.addressError = c;
    else if (r.reason === "DELAYED") attention.delayed = c;
    else if (r.reason === "NOTICE_CARD") attention.noticeCard = c;
    else if (r.reason === "STUCK") attention.stuck = c;
  }

  const [batchCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(batches);

  const recentBatches = await db
    .select({
      id: batches.id,
      totalOrders: batches.totalOrders,
      platform: batches.platform,
      createdAt: batches.createdAt,
      exportedAt: batches.exportedAt,
    })
    .from(batches)
    .orderBy(desc(batches.createdAt))
    .limit(4);

  const recentPulls = await db
    .select({
      filename: trackingFiles.filename,
      processedAt: trackingFiles.processedAt,
      totalRows: trackingFiles.totalRows,
      totalUpdated: trackingFiles.totalUpdated,
    })
    .from(trackingFiles)
    .orderBy(desc(trackingFiles.processedAt))
    .limit(4);

  const [aptFilesCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trackingFiles);

  const [oldestFile] = await db
    .select({ filename: trackingFiles.filename })
    .from(trackingFiles)
    .orderBy(asc(trackingFiles.filename))
    .limit(1);

  const [newestFile] = await db
    .select({ filename: trackingFiles.filename })
    .from(trackingFiles)
    .orderBy(desc(trackingFiles.filename))
    .limit(1);

  const lastSync = await db
    .select({
      startedAt: syncLogs.startedAt,
      completedAt: syncLogs.completedAt,
      totalAdded: syncLogs.totalAdded,
      totalErrors: syncLogs.totalErrors,
    })
    .from(syncLogs)
    .orderBy(desc(syncLogs.startedAt))
    .limit(1);

  const recentAttention = await db
    .select({
      orderId: orders.orderId,
      attentionReason: orders.attentionReason,
      attentionAt: orders.attentionAt,
      attentionNote: orders.attentionNote,
    })
    .from(orders)
    .where(isNotNull(orders.attentionReason))
    .orderBy(desc(orders.attentionAt))
    .limit(5);

  const flagCounts = { red: 0, yellow: 0, resolved: 0 };
  try {
    const flagRows = await db
      .select({
        color: flags.currentColor,
        count: sql<number>`count(*)::int`,
      })
      .from(flags)
      .groupBy(flags.currentColor);
    for (const row of flagRows) {
      const c = Number(row.count);
      if (row.color === "red") flagCounts.red = c;
      else if (row.color === "yellow") flagCounts.yellow = c;
      else flagCounts.resolved = c;
    }
  } catch {
    // Bảng flags chưa tồn tại (chưa chạy migration) — trả 0 để dashboard không vỡ
  }

  return {
    stats: { ...stats, batches: Number(batchCount?.count ?? 0) },
    attention,
    flagCounts,
    recentBatches,
    recentPulls,
    aptFiles: {
      total: Number(aptFilesCount?.count ?? 0),
      oldest: oldestFile?.filename ?? null,
      newest: newestFile?.filename ?? null,
    },
    lastSync: lastSync[0] ?? null,
    recentAttention,
  };
}

function parseAptFileDate(filename: string | null): string {
  if (!filename) return "—";
  const m = filename.match(/_(\d{8})/);
  if (!m) return "?";
  const d = m[1];
  return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: string;
  accent: string;
  href: string;
  subInfo?: { label: string; value: string | number };
}

function KpiCard({ label, value, icon, accent, href, subInfo }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="card card-interactive p-4 relative overflow-hidden block group"
    >
      <div className="flex items-start justify-between mb-2">
        <p
          className="text-[10px] font-bold tracking-[0.14em] uppercase"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </p>
        <span
          className="material-symbols-outlined text-[20px] transition-opacity"
          style={{ color: accent, opacity: 0.6 }}
        >
          {icon}
        </span>
      </div>
      <p className="text-[28px] font-bold leading-none tracking-tight" style={{ color: accent }}>
        {value.toLocaleString()}
      </p>
      {subInfo && (
        <p className="text-[11px] mt-2.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{subInfo.value}</span>
          <span>{subInfo.label}</span>
        </p>
      )}
      <span
        className="material-symbols-outlined text-[14px] absolute bottom-3 right-3 opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ color: accent }}
      >
        arrow_outward
      </span>
    </Link>
  );
}

interface PipelineBoxProps {
  count?: number;
  label: string | string[];
  color?: string;
}

const ABOVE_SLOT_HEIGHT = 36;

function AboveSlot({ text, maxWidth }: { text?: string; maxWidth?: number }) {
  return (
    <div
      className="flex items-end justify-center w-full px-1"
      style={{ minHeight: ABOVE_SLOT_HEIGHT }}
    >
      {text && (
        <p
          className="text-[10px] font-semibold tracking-wider uppercase text-center leading-tight pb-1"
          style={{ color: "var(--text-muted)", maxWidth: maxWidth ?? 140 }}
        >
          {text}
        </p>
      )}
    </div>
  );
}

function PipelineBox({ count, label, color }: PipelineBoxProps) {
  const labels = Array.isArray(label) ? label : [label];

  if (count === undefined) {
    return (
      <div className="shrink-0 flex flex-col items-center text-center" style={{ width: 108 }}>
        <AboveSlot />
        <div
          className="rounded-md px-2.5 py-2 w-full flex flex-col items-center justify-center"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px dashed var(--border)",
            minHeight: 64,
          }}
        >
          {labels.map((l, i) => (
            <p
              key={i}
              className="text-[11px] font-semibold leading-tight"
              style={{ color: "var(--text-secondary)" }}
            >
              {l}
            </p>
          ))}
        </div>
        <div style={{ height: 22 }} />
      </div>
    );
  }

  return (
    <div className="shrink-0 flex flex-col items-center text-center" style={{ width: 88 }}>
      <AboveSlot />
      <div
        className="rounded-md py-2 w-full flex items-center justify-center"
        style={{
          backgroundColor: `${color}1f`,
          border: `1px solid ${color}40`,
          minHeight: 64,
          boxShadow: `0 0 0 1px ${color}1a, 0 4px 16px -8px ${color}40`,
        }}
      >
        <p className="text-[26px] font-bold leading-none" style={{ color }}>
          {count}
        </p>
      </div>
      <div className="mt-2 text-center leading-tight">
        {labels.map((l, i) => (
          <p
            key={i}
            className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function PipelineArrow({
  caption,
  captionAbove,
  width = 108,
}: {
  caption: string;
  captionAbove?: string;
  width?: number;
}) {
  return (
    <div className="shrink-0 flex flex-col items-center px-1" style={{ width }}>
      <AboveSlot text={captionAbove} maxWidth={width - 8} />
      <div className="flex items-center w-full" style={{ height: 64 }}>
        <div
          className="flex-1 h-px"
          style={{
            background:
              "linear-gradient(to right, rgba(34,211,238,0.05), rgba(34,211,238,0.45) 60%, rgba(34,211,238,0.65))",
          }}
        />
        <svg width="6" height="10" className="shrink-0" style={{ marginLeft: -1 }}>
          <path
            d="M0 0 L6 5 L0 10"
            stroke="rgba(34,211,238,0.75)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p
        className="text-[10px] font-semibold tracking-wider uppercase mt-2 text-center leading-tight"
        style={{ color: "var(--text-muted)", maxWidth: width - 8 }}
      >
        {caption}
      </p>
    </div>
  );
}

interface BranchPillData {
  count?: number;
  label: string;
  sublabel?: string;
  color: string;
  pulse?: boolean;
}

function BranchFork({
  top,
  bottom,
  belowLabel,
  bottomSpur,
}: {
  top: BranchPillData;
  bottom: BranchPillData;
  belowLabel?: string | string[];
  bottomSpur?: BranchPillData;
}) {
  const stroke = "rgba(148, 163, 184, 0.4)";
  const labels = belowLabel
    ? Array.isArray(belowLabel)
      ? belowLabel
      : [belowLabel]
    : [];
  // Pill height 40, gap 8, total 88. Top pill center y=20, bottom y=68, mid y=44.
  return (
    <div className="shrink-0 flex flex-col items-center">
      <AboveSlot />
      <div className="flex items-center" style={{ height: 88 }}>
        <svg width="32" height="88" className="shrink-0">
          <line x1="0" y1="44" x2="14" y2="44" stroke={stroke} strokeWidth="1" />
          <line x1="14" y1="44" x2="32" y2="20" stroke={stroke} strokeWidth="1" />
          <line x1="14" y1="44" x2="32" y2="68" stroke={stroke} strokeWidth="1" />
        </svg>
        <div className="flex flex-col gap-2">
          <BranchPill {...top} />
          <BranchPill {...bottom} />
        </div>
        {bottomSpur && (
          <div className="flex flex-col gap-2 ml-1">
            <div style={{ height: 40 }} />
            <div className="flex items-center">
              <svg width="24" height="2" className="shrink-0">
                <line
                  x1="0"
                  y1="1"
                  x2="24"
                  y2="1"
                  stroke={`${bottomSpur.color}80`}
                  strokeWidth="1.2"
                  strokeDasharray="3 2"
                />
              </svg>
              <BranchPill {...bottomSpur} />
            </div>
          </div>
        )}
        {!bottomSpur && (
          <svg width="32" height="88" className="shrink-0">
            <line x1="0" y1="20" x2="18" y2="44" stroke={stroke} strokeWidth="1" />
            <line x1="0" y1="68" x2="18" y2="44" stroke={stroke} strokeWidth="1" />
            <line x1="18" y1="44" x2="32" y2="44" stroke={stroke} strokeWidth="1" />
          </svg>
        )}
      </div>
      <div className="mt-2 text-center leading-tight" style={{ minHeight: labels.length > 0 ? 0 : 24 }}>
        {labels.map((l, i) => (
          <p
            key={i}
            className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function BranchPill({ count, label, sublabel, color, pulse }: BranchPillData) {
  const hasCount = count !== undefined;
  return (
    <div
      className="relative flex items-center rounded-md px-3"
      style={{
        backgroundColor: `${color}1f`,
        border: `1px solid ${color}40`,
        minWidth: 124,
        height: 40,
        justifyContent: hasCount ? "space-between" : "center",
        gap: 12,
        boxShadow: `0 0 0 1px ${color}1a, 0 4px 14px -8px ${color}50`,
      }}
    >
      {pulse && hasCount && count > 0 && (
        <span
          className="absolute"
          style={{
            top: 6,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}`,
            animation: "pipeline-pulse 1.6s ease-in-out infinite",
          }}
        />
      )}
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color }}>
          {label}
        </span>
        {sublabel && (
          <span className="text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>
            {sublabel}
          </span>
        )}
      </div>
      {hasCount && (
        <span className="text-[20px] font-bold leading-none" style={{ color }}>
          {count}
        </span>
      )}
    </div>
  );
}

function timeAgo(date: Date | null): string {
  if (!date) return "—";
  const now = Date.now();
  const diff = Math.floor((now - new Date(date).getTime()) / 1000);
  if (diff < 60) return `${diff}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

const ATTENTION_LABELS: Record<string, string> = {
  ADDRESS_ERROR: "Sai địa chỉ",
  DELAYED: "Delay",
  NOTICE_CARD: "Notice card",
  STUCK: "Không cập nhật",
};

export default async function DashboardPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  const { stats, attention, flagCounts, recentBatches, recentPulls, aptFiles, lastSync, recentAttention } =
    await getDashboardData();

  const inProgress = stats.total - stats.delivered - stats.failed;
  const deliveryRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0;
  const inProgressRate = stats.total > 0 ? Math.round((inProgress / stats.total) * 100) : 0;

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Tổng quan vận hành"
        description="Theo dõi đơn hàng, batch và pipeline xử lý real-time."
      />

      {/* === KPI strip — 6 cards compact, clickable === */}
      <div className="grid grid-cols-6 gap-3 mb-3">
        <KpiCard
          label="Đang xử lý"
          value={inProgress}
          icon="pending_actions"
          accent="var(--color-info)"
          href="/orders"
          subInfo={{ label: `tổng ${stats.total} đơn`, value: `${inProgressRate}%` }}
        />
        <KpiCard
          label="Sẵn sàng đóng gói"
          value={stats.ready}
          icon="inventory_2"
          accent="var(--accent)"
          href="/orders?status=READY"
          subInfo={
            stats.new > 0
              ? { label: "đơn mới chờ validate", value: stats.new }
              : { label: "tất cả đã validate", value: "✓" }
          }
        />
        <KpiCard
          label="Đã giao"
          value={stats.delivered}
          icon="task_alt"
          accent="var(--color-teal)"
          href="/delivered"
          subInfo={{ label: `giao thành công trên ${stats.total} đơn`, value: `${deliveryRate}%` }}
        />
        <KpiCard
          label="Cần chú ý"
          value={attention.total}
          icon="priority_high"
          accent="var(--color-pink)"
          href="/orders?attention=any"
          subInfo={
            attention.total > 0
              ? {
                  label: "đơn đang flag",
                  value: [
                    attention.noticeCard ? `${attention.noticeCard} notice` : null,
                    attention.addressError ? `${attention.addressError} address` : null,
                    attention.delayed ? `${attention.delayed} delay` : null,
                    attention.stuck ? `${attention.stuck} stuck` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—",
                }
              : { label: "không có đơn cần chú ý", value: "✓" }
          }
        />
        <KpiCard
          label="Đơn cờ đỏ"
          value={flagCounts.red}
          icon="flag"
          accent="#ef4444"
          href="/flags?filter=red"
          subInfo={{
            label: flagCounts.red > 0 ? "đơn KDE vừa nhắn" : "không có đơn",
            value: flagCounts.red > 0 ? "!" : "✓",
          }}
        />
        <KpiCard
          label="Đơn cờ vàng"
          value={flagCounts.yellow}
          icon="flag"
          accent="#f59e0b"
          href="/flags?filter=yellow"
          subInfo={{
            label: flagCounts.yellow > 0 ? "khách đang chờ" : "không có đơn",
            value: flagCounts.yellow > 0 ? "!" : "✓",
          }}
        />
      </div>

      {/* === Pipeline === */}
      <div className="card p-4 mb-3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p
              className="text-[10px] font-bold tracking-[0.14em] uppercase mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Luồng xử lý đơn
            </p>
            <h3 className="text-sm font-semibold text-white">Pipeline trạng thái</h3>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="live-dot" />
            <span>Cập nhật real-time</span>
          </div>
        </div>
        <div className="flex items-center justify-between overflow-x-auto pb-2 gap-1">
          <PipelineBox label={["Data khách", "Google Sheet"]} />
          <PipelineArrow caption="Đồng bộ" width={88} />
          <PipelineBox count={stats.new + stats.ready + stats.errorUpdated} label="Sẵn sàng" color="#4ade80" />
          <PipelineArrow
            captionAbove="Tạo Batch"
            caption="Xuất file upload lên ClickShip & EST"
          />
          <BranchFork
            top={{ count: stats.exportedClickship, label: "ClickShip", color: "#4ade80" }}
            bottom={{ count: stats.exportedEst, label: "EST", color: "#fbbf24" }}
            belowLabel={["Đã upload", "chờ label"]}
          />
          <PipelineArrow
            captionAbove="Download label từ ClickShip/EST"
            caption="Tải label về máy"
          />
          <PipelineBox label="Label Downloaded" />
          <PipelineArrow
            captionAbove="Upload label lên KDE-app"
            caption="Đối soát vận chuyển"
          />
          <PipelineBox
            count={stats.labeled + stats.inTransit}
            label={["Đơn cần", "xử lý"]}
            color="#60a5fa"
          />
          <BranchFork
            top={{ count: stats.labeled, label: "Có label", color: "#a78bfa" }}
            bottom={{ count: stats.inTransit, label: "Đang vận chuyển", color: "#38bdf8", pulse: true }}
            bottomSpur={
              attention.total > 0
                ? { count: attention.total, label: "Cần chú ý", color: "#f472b6", pulse: true }
                : undefined
            }
          />
        </div>
        {stats.error > 0 && (
          <div
            className="mt-4 pt-4 border-t flex items-center gap-6 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-[16px]"
                style={{ color: "var(--color-danger)" }}
              >
                error
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>
                  {stats.error}
                </span>{" "}
                đơn lỗi cần sửa
              </span>
            </div>
          </div>
        )}
      </div>

      {/* === 2-column: Recent batches + Activity === */}
      <div className="grid grid-cols-3 gap-4 mb-3">
        {/* Recent batches */}
        <div className="card p-4 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p
                className="text-[10px] font-bold tracking-[0.14em] uppercase mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Hoạt động gần đây
              </p>
              <h3 className="text-sm font-semibold text-white">Batch mới nhất</h3>
            </div>
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {stats.batches} batch tổng
            </span>
          </div>

          {recentBatches.length === 0 ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-muted)" }}>
              Chưa có batch nào.
            </p>
          ) : (
            <div className="space-y-1.5">
              {recentBatches.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: b.exportedAt
                          ? "rgba(20, 184, 166, 0.12)"
                          : "rgba(148, 163, 184, 0.12)",
                      }}
                    >
                      <span
                        className="material-symbols-outlined text-[18px]"
                        style={{
                          color: b.exportedAt ? "var(--color-teal)" : "var(--color-slate)",
                        }}
                      >
                        {b.exportedAt ? "check_circle" : "package_2"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-semibold text-white truncate">
                        {b.id}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {b.totalOrders} đơn
                        {b.platform && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider"
                            style={{
                              backgroundColor: b.platform === "EST"
                                ? "rgba(245, 158, 11, 0.15)"
                                : "rgba(74, 222, 128, 0.10)",
                              color: b.platform === "EST" ? "#fbbf24" : "#4ade80",
                            }}
                          >
                            {b.platform}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      {b.exportedAt ? "Đã upload" : "Đang dựng"}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {timeAgo(b.exportedAt ?? b.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p
                className="text-[10px] font-bold tracking-[0.14em] uppercase mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                System
              </p>
              <h3 className="text-sm font-semibold text-white">Live activity</h3>
            </div>
            <span className="live-dot" />
          </div>

          <div className="space-y-3">
            <ActivityRow
              icon="cloud_sync"
              iconColor="var(--color-info)"
              title="Đồng bộ Google Sheets"
              detail={
                lastSync
                  ? `+${lastSync.totalAdded} mới · ${lastSync.totalErrors} lỗi`
                  : "Chưa chạy lần nào"
              }
              time={timeAgo(lastSync?.completedAt ?? lastSync?.startedAt ?? null)}
            />
            <ActivityRow
              icon="download"
              iconColor="var(--color-teal)"
              title="Pull tracking events"
              detail={
                recentPulls[0]
                  ? `+${recentPulls[0].totalUpdated} đơn cập nhật`
                  : "Chưa có file"
              }
              time={timeAgo(recentPulls[0]?.processedAt ?? null)}
            />
            <div
              className="border-t pt-3 mt-3"
              style={{ borderColor: "var(--border)" }}
            >
              <p
                className="text-[10px] font-bold tracking-widest uppercase mb-2"
                style={{ color: "var(--text-muted)" }}
              >
                Đơn vừa flag
              </p>
              {recentAttention.length === 0 ? (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Không có flag mới.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recentAttention.slice(0, 3).map((a) => (
                    <div key={a.orderId} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`attention-${a.attentionReason}`}
                          style={{ height: "18px", padding: "0 6px", fontSize: "9px" }}
                        >
                          {ATTENTION_LABELS[a.attentionReason ?? ""] ?? a.attentionReason}
                        </span>
                        <span className="text-[11px] font-mono truncate" style={{ color: "var(--text-secondary)" }}>
                          {a.orderId}
                        </span>
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
                        {timeAgo(a.attentionAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* === Recent APT pulls === */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p
              className="text-[10px] font-bold tracking-[0.14em] uppercase mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              Tracking ingest
            </p>
            <h3 className="text-sm font-semibold text-white">Pull file gần nhất</h3>
          </div>
          <div className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
            <p>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>
                {aptFiles.total}
              </span>{" "}
              file · từ{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                {parseAptFileDate(aptFiles.oldest)}
              </span>{" "}
              đến{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                {parseAptFileDate(aptFiles.newest)}
              </span>
            </p>
            <p className="text-[10px] mt-0.5">Cron 15 phút/lần</p>
          </div>
        </div>

        {recentPulls.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>
            Chưa có file nào được pull.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {recentPulls.map((p) => (
              <div
                key={p.filename}
                className="rounded-md p-3"
                style={{ backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--border)" }}
              >
                <p className="text-[10px] font-mono truncate" style={{ color: "var(--text-muted)" }} title={p.filename}>
                  {p.filename.replace("APT_0001031358_", "").replace(".csv", "")}
                </p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[18px] font-bold text-white leading-none">
                    {p.totalUpdated}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    / {p.totalRows} events
                  </span>
                </div>
                <p className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>
                  {timeAgo(p.processedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

interface ActivityRowProps {
  icon: string;
  iconColor: string;
  title: string;
  detail: string;
  time: string;
}

function ActivityRow({ icon, iconColor, title, detail, time }: ActivityRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: `${iconColor}1f` }}
      >
        <span className="material-symbols-outlined text-[16px]" style={{ color: iconColor }}>
          {icon}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-white">{title}</p>
        <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
          {detail} · {time}
        </p>
      </div>
    </div>
  );
}
