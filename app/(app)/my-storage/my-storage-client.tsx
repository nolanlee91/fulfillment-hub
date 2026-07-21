"use client";

import { useCallback, useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button } from "@/components/ui";

interface PalletItem {
  id: string;
  productName: string;
  unitCount: number;
  initialUnits: number;
}
interface Pallet {
  id: string;
  palletCode: string;
  productName: string;
  unitCount: number;
  initialUnits: number;
  receivedAt: string;
  items: PalletItem[];
}
interface ReqItem {
  id: string;
  palletId: string;
  palletItemId: string | null;
  units: number;
  uom: "PALLET" | "UNIT";
  confirmedUnits: number | null;
  palletCode: string | null;
  productName: string | null;
}
// 1 dòng SKU để khách chọn (phẳng từ pallets → items).
interface SkuRow {
  palletId: string;
  palletItemId: string;
  palletCode: string;
  productName: string;
  unitCount: number;
}
interface PickupRequest {
  id: string;
  status: "PENDING" | "DONE" | "CANCELLED";
  requestedDate: string | null;
  note: string | null;
  createdAt: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  customerConfirmedBy: string | null;
  customerConfirmedAt: string | null;
  items: ReqItem[];
}

const STATUS_LABEL: Record<PickupRequest["status"], string> = {
  PENDING: "Pending",
  DONE: "Picked up",
  CANCELLED: "Cancelled",
};
const STATUS_COLOR: Record<PickupRequest["status"], string> = {
  PENDING: "#a16207",
  DONE: "#15803d",
  CANCELLED: "#b91c1c",
};
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA");
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
/** ISO (UTC) → chuỗi "YYYY-MM-DDTHH:mm" giờ địa phương cho input datetime-local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function daysStored(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
function itemLabel(it: ReqItem): string {
  const head = it.productName ? `${it.productName} · ${it.palletCode}` : it.palletCode;
  return it.uom === "PALLET" ? `${head} (cả pallet)` : `${head} × ${it.units} units`;
}

export default function MyStorageClient() {
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [builder, setBuilder] = useState<PickupRequest | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/storage/requests");
    const data = await res.json();
    if (data.success) {
      setPallets(data.data.pallets);
      setRequests(data.data.requests);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: string, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/storage/requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!data.success) alert(data.error);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Topbar title="My Storage" subtitle="Warehouse" showSync={false} />

      {/* ---- Pallets in storage ---- */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Hàng đang lưu kho</h2>
        <Button
          icon="local_shipping"
          onClick={() => setBuilder("new")}
          disabled={pallets.length === 0}
        >
          Yêu cầu lấy hàng
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)] py-8 text-center">Loading…</p>
      ) : pallets.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-8 text-center">
          Chưa có pallet nào trong kho.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {pallets.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-mono text-[11px] text-[var(--text-secondary)]">
                  {p.palletCode}
                  {p.items && p.items.length > 1 && (
                    <span className="ml-1 text-[var(--accent)]">· trộn</span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold leading-none">{p.unitCount}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">còn / {p.initialUnits}</div>
                </div>
              </div>
              {/* Danh sách SKU trong pallet */}
              <div className="mt-2 space-y-0.5">
                {(p.items && p.items.length ? p.items : [{ id: p.id, productName: p.productName, unitCount: p.unitCount }]).map(
                  (it) => (
                    <div key={it.id} className="text-sm flex justify-between">
                      <span className="font-medium">{it.productName}</span>
                      <span className="text-[var(--text-secondary)]">{it.unitCount}</span>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                Nhận {fmtDate(p.receivedAt)} · {daysStored(p.receivedAt)} ngày
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- My pickup requests ---- */}
      <h2 className="text-sm font-semibold mb-2">Yêu cầu lấy hàng của tôi</h2>
      {requests.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">
          Chưa có yêu cầu nào.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const canConfirm = r.status === "DONE" && !r.customerConfirmedAt;
            const canDelete = r.status === "PENDING" || r.status === "CANCELLED";
            const agreed = r.confirmedAt && r.customerConfirmedAt;
            return (
              <div
                key={r.id}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
              >
                {/* header row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Tạo {fmtDate(r.createdAt)}
                    {r.requestedDate && ` · muốn lấy ${fmtDateTime(r.requestedDate)}`}
                  </div>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: STATUS_COLOR[r.status] }}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>

                {/* items */}
                <ul className="space-y-0.5 mb-2">
                  {r.items.map((it) => (
                    <li key={it.id} className="text-sm">
                      {itemLabel(it)}
                      {r.status === "DONE" && it.confirmedUnits != null && (
                        <span className="text-[var(--text-secondary)]"> → đã lấy {it.confirmedUnits}</span>
                      )}
                    </li>
                  ))}
                </ul>

                {/* two-sided confirm */}
                <div className="flex flex-wrap gap-2 mb-2">
                  <ConfirmBadge
                    label="Kho"
                    ok={!!r.confirmedAt}
                    detail={r.confirmedAt ? `${r.confirmedBy ?? ""} · ${fmtDate(r.confirmedAt)}` : "chờ kho chốt"}
                  />
                  <ConfirmBadge
                    label="Khách"
                    ok={!!r.customerConfirmedAt}
                    detail={r.customerConfirmedAt ? fmtDate(r.customerConfirmedAt) : "chưa đồng ý"}
                  />
                  {agreed && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: "rgba(22,163,74,0.12)", color: "#15803d" }}>
                      ✓ Đã thống nhất
                    </span>
                  )}
                </div>

                {/* actions */}
                <div className="flex flex-wrap gap-2">
                  {canConfirm && (
                    <Button
                      icon="check_circle"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, "customer_confirm")}
                    >
                      Đồng ý
                    </Button>
                  )}
                  {r.status === "PENDING" && (
                    <Button variant="secondary" className="text-xs" onClick={() => setBuilder(r)}>
                      Sửa
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="secondary"
                      icon="delete"
                      className="text-xs"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, "delete", "Xóa hẳn yêu cầu này?")}
                    >
                      Xóa
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {builder && (
        <RequestBuilder
          pallets={pallets}
          existing={builder === "new" ? null : builder}
          onClose={() => setBuilder(null)}
          onDone={async () => {
            setBuilder(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function ConfirmBadge({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1"
      style={
        ok
          ? { backgroundColor: "rgba(22,163,74,0.10)", color: "#15803d" }
          : { backgroundColor: "rgba(100,116,139,0.12)", color: "#64748b" }
      }
    >
      <span className="material-symbols-outlined text-[13px]">
        {ok ? "check_circle" : "schedule"}
      </span>
      <b>{label}:</b> {detail}
    </span>
  );
}

interface Row {
  include: boolean;
  whole: boolean;
  units: string;
}

function RequestBuilder({
  pallets,
  existing,
  onClose,
  onDone,
}: {
  pallets: Pallet[];
  existing: PickupRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  // Phẳng pallets → danh sách SKU (mỗi dòng 1 SKU để chọn).
  const skus: SkuRow[] = pallets.flatMap((p) =>
    (p.items && p.items.length
      ? p.items
      : [{ id: p.id, productName: p.productName, unitCount: p.unitCount, initialUnits: p.initialUnits }]
    ).map((it) => ({
      palletId: p.id,
      palletItemId: it.id,
      palletCode: p.palletCode,
      productName: it.productName,
      unitCount: it.unitCount,
    })),
  );

  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const m: Record<string, Row> = {};
    for (const s of skus) m[s.palletItemId] = { include: false, whole: false, units: "" };
    if (existing) {
      for (const it of existing.items) {
        const key = it.palletItemId ?? it.palletId; // legacy fallback
        if (m[key]) {
          m[key] = {
            include: true,
            whole: it.uom === "PALLET",
            units: it.uom === "PALLET" ? "" : String(it.units),
          };
        }
      }
    }
    return m;
  });
  const [reqDate, setReqDate] = useState(
    existing?.requestedDate ? toLocalInput(existing.requestedDate) : "",
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setRow(id: string, patch: Partial<Row>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  }

  async function submit() {
    setError("");
    const items: {
      palletId: string;
      palletItemId: string;
      units: number;
      uom: "PALLET" | "UNIT";
    }[] = [];
    for (const s of skus) {
      const row = rows[s.palletItemId];
      if (!row?.include) continue;
      if (row.whole) {
        items.push({ palletId: s.palletId, palletItemId: s.palletItemId, units: s.unitCount, uom: "PALLET" });
      } else {
        const u = Number(row.units);
        if (!u || u < 1) {
          setError(`Nhập số units cho ${s.productName} (hoặc chọn lấy hết)`);
          return;
        }
        if (u > s.unitCount) {
          setError(`${s.productName} chỉ còn ${s.unitCount} units`);
          return;
        }
        items.push({ palletId: s.palletId, palletItemId: s.palletItemId, units: u, uom: "UNIT" });
      }
    }
    if (items.length === 0) {
      setError("Chọn ít nhất 1 SKU");
      return;
    }
    if (!reqDate) {
      setError("Chọn ngày giờ muốn lấy hàng");
      return;
    }
    // datetime-local là giờ địa phương → đổi sang ISO (UTC) để lưu đúng mốc.
    const requestedDate = new Date(reqDate).toISOString();

    setSaving(true);
    try {
      const url = existing
        ? `/api/storage/requests/${existing.id}`
        : "/api/storage/requests";
      const body = existing
        ? { action: "edit", items, requestedDate, note }
        : { items, requestedDate, note };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Failed");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">
            {existing ? "Sửa yêu cầu lấy hàng" : "Yêu cầu lấy hàng"}
          </h2>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]">
            close
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {skus.map((s) => {
            const row = rows[s.palletItemId];
            return (
              <div
                key={s.palletItemId}
                className="rounded-lg border p-2.5"
                style={{
                  borderColor: row.include ? "var(--accent)" : "var(--border)",
                  background: row.include ? "var(--accent-bg)" : "transparent",
                }}
              >
                {/* Dòng 1: tên SKU + mã pallet + tồn */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(e) => setRow(s.palletItemId, { include: e.target.checked })}
                    className="w-4 h-4 mt-0.5 shrink-0"
                  />
                  <span className="text-sm leading-tight">
                    <b>{s.productName}</b>
                    <span className="text-[var(--text-secondary)]"> · còn {s.unitCount}u</span>
                    <span className="block font-mono text-[11px] text-[var(--text-secondary)]">
                      {s.palletCode}
                    </span>
                  </span>
                </label>

                {/* Dòng 2: chỉ hiện khi đã chọn — lấy hết / nhập units */}
                {row.include && (
                  <div className="flex items-center gap-3 mt-2 pl-6">
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={row.whole}
                        onChange={(e) => setRow(s.palletItemId, { whole: e.target.checked })}
                      />
                      lấy hết
                    </label>
                    <input
                      className="filter-input flex-1"
                      type="number"
                      min={1}
                      max={s.unitCount}
                      placeholder={`số units (tối đa ${s.unitCount})`}
                      disabled={row.whole}
                      value={row.units}
                      onChange={(e) => setRow(s.palletItemId, { units: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <label className="flex flex-col gap-1 mb-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Ngày giờ muốn lấy <span className="text-red-600">*</span>
          </span>
          <input
            className="filter-input w-full"
            type="datetime-local"
            required
            value={reqDate}
            onChange={(e) => setReqDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 mb-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Ghi chú (không bắt buộc)</span>
          <input
            className="filter-input w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Bạn có thể sửa yêu cầu tới khi kho chốt số cuối lúc lấy hàng.
        </p>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            icon={saving ? "hourglass_empty" : "local_shipping"}
          >
            {saving ? "Đang lưu…" : existing ? "Lưu thay đổi" : "Gửi yêu cầu"}
          </Button>
        </div>
      </div>
    </div>
  );
}
