"use client";

import { useEffect, useRef, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, Button } from "@/components/ui";

interface Batch {
  id: string;
  totalOrders: number;
  labeledCount: number;
  platform: "CLICKSHIP" | "EST" | null;
  createdAt: string;
  exportedAt: string | null;
  deletedAt: string | null;
  deletedReason: string | null;
  deletedBy: string | null;
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Batch | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [sortingId, setSortingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sortTargetRef = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/batches");
    const data = await res.json();
    if (data.success) setBatches(data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function exportBatch(batch: Batch) {
    setExporting(batch.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batch.id)}/export`);
      if (!res.ok) {
        const errData = await res.json();
        setMessage({ text: errData.error || "Export failed", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const isEst = batch.platform === "EST";
      a.download = isEst ? `EST_${batch.id}.csv` : `clickship_${batch.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({
        text: `Downloaded ${isEst ? "CSV" : "Excel"} file for batch ${batch.id}`,
        type: "success",
      });
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      setExporting(null);
      setTimeout(() => setMessage(null), 5000);
    }
  }

  async function handleSortFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset để chọn lại cùng file được
    const batchId = sortTargetRef.current;
    if (!file || !batchId) return;
    setSortingId(batchId);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/batches/${encodeURIComponent(batchId)}/sort-labels`,
        { method: "POST", body: fd },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ text: err.error || "Sắp label thất bại", type: "error" });
        return;
      }
      // Báo cáo lệch thừa/thiếu (server encode bằng encodeURIComponent(JSON)).
      let report: {
        total: number;
        matched: number;
        extraPages: number;
        extraIds: string[];
        missingOrders: number;
        missingIds: string[];
      } | null = null;
      try {
        const raw = res.headers.get("X-Sort-Report");
        if (raw) report = JSON.parse(decodeURIComponent(raw));
      } catch {
        report = null;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labels_${batchId}_sorted.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      const warnings: string[] = [];
      if (report && report.extraPages > 0) {
        const ids = report.extraIds.join(", ");
        warnings.push(
          `${report.extraPages} trang thừa không thuộc batch (đẩy xuống cuối): ${ids}${report.extraPages > report.extraIds.length ? "…" : ""}`,
        );
      }
      if (report && report.missingOrders > 0) {
        const ids = report.missingIds.join(", ");
        warnings.push(
          `${report.missingOrders} đơn trong batch chưa thấy label: ${ids}${report.missingOrders > report.missingIds.length ? "…" : ""}`,
        );
      }
      setMessage({
        text:
          warnings.length > 0
            ? `Đã sắp label ${batchId} — ⚠ ${warnings.join(" | ")}`
            : `Đã sắp label theo mặt hàng cho ${batchId} (khớp đủ ${report?.matched ?? ""} đơn)`,
        type: warnings.length > 0 ? "error" : "success",
      });
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      setSortingId(null);
      setTimeout(() => setMessage(null), 8000);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleteBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ text: data.error || "Xóa batch thất bại", type: "error" });
        return;
      }
      setMessage({ text: data.message, type: "success" });
      setDeleteTarget(null);
      setDeleteReason("");
      await load();
    } catch (e) {
      setMessage({ text: (e as Error).message, type: "error" });
    } finally {
      setDeleteBusy(false);
      setTimeout(() => setMessage(null), 6000);
    }
  }

  function formatDate(s: string): string {
    if (!s) return "—";
    const d = new Date(s);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <>
      <Topbar title="Batches" subtitle="Operations" />

      {/* Input ẩn dùng chung cho nút "Sắp label" của mọi batch */}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleSortFile}
      />

      <Card padding="none" className="mb-4 px-4 py-3 flex items-center justify-between">
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="font-bold">{batches.length}</span> batch
        </div>
        {message && (
          <span
            className="text-xs px-3 py-1.5 rounded font-semibold"
            style={
              message.type === "success"
                ? { backgroundColor: "rgba(22, 163, 74, 0.10)", color: "#15803d" }
                : { backgroundColor: "rgba(220, 38, 38, 0.10)", color: "#dc2626" }
            }
          >
            {message.text}
          </span>
        )}
      </Card>

      <div className="table-shell">
        {loading ? (
          <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
            Loading...
          </div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center">
            <span
              className="material-symbols-outlined text-5xl"
              style={{ color: "var(--text-muted)" }}
            >
              package_2
            </span>
            <p className="mt-3 font-semibold">No batches yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Go to Orders → select READY orders → click &quot;Create Batch&quot;
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Batch ID
                  </th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Type
                  </th>
                  <th
                    className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase"
                    title="Số label đã up / tổng đơn trong batch"
                  >
                    Labeled / Total
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Created
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Note
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold tracking-widest uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const isEst = b.platform === "EST";
                  const isDeleted = !!b.deletedAt;
                  return (
                    <tr key={b.id} style={isDeleted ? { opacity: 0.55 } : undefined}>
                      <td className="px-4 py-3 font-mono text-sm font-bold">
                        {b.id}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`payment-${isEst ? "COD" : "PREPAID"} px-2 py-0.5 rounded text-[10px] font-bold tracking-wider`}
                        >
                          {isEst ? "COD" : "Standard"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span
                          style={{
                            color:
                              b.labeledCount >= b.totalOrders
                                ? "var(--color-success)"
                                : b.labeledCount > 0
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                            fontWeight: 700,
                          }}
                        >
                          {b.labeledCount}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>/{b.totalOrders}</span>
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {formatDate(b.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ maxWidth: 280 }}>
                        {isDeleted ? (
                          <div>
                            <div style={{ color: "var(--color-danger)" }}>
                              {b.deletedReason}
                            </div>
                            <div className="mt-0.5" style={{ color: "var(--text-muted)" }}>
                              Đã xóa
                              {b.deletedBy ? ` bởi ${b.deletedBy}` : ""}
                              {b.deletedAt ? ` · ${formatDate(b.deletedAt)}` : ""}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isDeleted ? (
                            <Button variant="secondary" icon="delete" disabled>
                              Đã xóa
                            </Button>
                          ) : (
                            <>
                              <button
                                onClick={() => exportBatch(b)}
                                disabled={exporting === b.id}
                                className="btn btn-primary"
                              >
                                <span className="material-symbols-outlined text-[16px]">download</span>
                                {exporting === b.id ? "Downloading..." : isEst ? "Download CSV" : "Download Excel"}
                              </button>
                              <button
                                onClick={() => {
                                  sortTargetRef.current = b.id;
                                  fileRef.current?.click();
                                }}
                                disabled={sortingId === b.id}
                                className="btn btn-secondary"
                                title="Tải file PDF label (từ ClickShip) lên → sắp lại trang theo mặt hàng để in đóng gói tuần tự"
                              >
                                <span className="material-symbols-outlined text-[16px]">sort</span>
                                {sortingId === b.id ? "Đang sắp..." : "Sắp label"}
                              </button>
                              <Button
                                variant="danger"
                                icon="delete"
                                onClick={() => {
                                  setDeleteTarget(b);
                                  setDeleteReason("");
                                }}
                                title="Xóa batch — đơn sẽ về lại READY"
                              >
                                Xóa
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal xác nhận xóa batch + nhập lý do */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => {
            if (!deleteBusy) setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="material-symbols-outlined text-[20px]"
                  style={{ color: "var(--color-danger)" }}
                >
                  warning
                </span>
                <h3 className="font-bold text-base">Xóa batch {deleteTarget.id}?</h3>
              </div>
              <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                {deleteTarget.totalOrders} đơn trong batch sẽ chuyển về trạng thái{" "}
                <span className="font-semibold">READY</span> để tạo batch lại. Chỉ xóa được
                khi tất cả đơn đang ở EXPORTED.
              </p>

              <label className="filter-label">Lý do xóa batch (bắt buộc)</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="VD: tách 30 đơn acai đi nhanh khỏi 70 đơn đi thường"
                className="filter-input w-full mt-1"
                style={{ resize: "vertical", minHeight: 72 }}
                disabled={deleteBusy}
              />

              <div className="flex items-center justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteBusy}
                >
                  Hủy
                </Button>
                <Button
                  variant="danger"
                  icon="delete"
                  onClick={confirmDelete}
                  disabled={deleteBusy || !deleteReason.trim()}
                >
                  {deleteBusy ? "Đang xóa..." : "Xác nhận xóa"}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
