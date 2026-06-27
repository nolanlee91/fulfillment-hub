"use client";

import { useCallback, useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, Button } from "@/components/ui";

interface Pallet {
  id: string;
  palletCode: string;
  productName: string;
  unitCount: number;
  initialUnits: number;
  receivedAt: string;
}
interface ReqItem {
  id: string;
  palletId: string;
  units: number;
  uom: "PALLET" | "UNIT";
  confirmedUnits: number | null;
  palletCode: string | null;
  productName: string | null;
}
interface PickupRequest {
  id: string;
  status: "PENDING" | "DONE" | "CANCELLED";
  requestedDate: string | null;
  note: string | null;
  createdAt: string;
  items: ReqItem[];
}

const STATUS_LABEL: Record<PickupRequest["status"], string> = {
  PENDING: "Pending",
  DONE: "Done",
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
function daysStored(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
function itemLabel(it: ReqItem): string {
  return it.uom === "PALLET"
    ? `${it.palletCode} (whole pallet)`
    : `${it.palletCode} × ${it.units} units`;
}

export default function MyStorageClient() {
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [builder, setBuilder] = useState<PickupRequest | "new" | null>(null);

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

  async function cancel(id: string) {
    if (!confirm("Cancel this request?")) return;
    const res = await fetch(`/api/storage/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const data = await res.json();
    if (!data.success) alert(data.error);
    await load();
  }

  return (
    <>
      <Topbar title="My Storage" subtitle="Warehouse" showSync={false} />

      {/* Pallets in storage */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">Pallets in storage</h2>
        <Button
          icon="local_shipping"
          onClick={() => setBuilder("new")}
          disabled={pallets.length === 0}
        >
          Request pickup
        </Button>
      </div>
      <Card padding="none" className="overflow-x-auto mb-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--text-secondary)] border-b">
              <th className="px-3 py-2">Pallet</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2 text-right">Days</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  Loading…
                </td>
              </tr>
            ) : pallets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  No pallets in storage.
                </td>
              </tr>
            ) : (
              pallets.map((p) => (
                <tr key={p.id} className="border-b text-sm">
                  <td className="px-3 py-2 font-mono text-xs">{p.palletCode}</td>
                  <td className="px-3 py-2">{p.productName}</td>
                  <td className="px-3 py-2 text-right font-semibold">{p.unitCount}</td>
                  <td className="px-3 py-2">{fmtDate(p.receivedAt)}</td>
                  <td className="px-3 py-2 text-right">{daysStored(p.receivedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* My requests */}
      <h2 className="text-sm font-semibold mb-2">My pickup requests</h2>
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--text-secondary)] border-b">
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Wanted date</th>
              <th className="px-3 py-2">Items</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--text-secondary)]">
                  No requests yet.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b text-sm align-top">
                  <td className="px-3 py-2">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2">{fmtDate(r.requestedDate)}</td>
                  <td className="px-3 py-2">
                    <ul className="space-y-0.5">
                      {r.items.map((it) => (
                        <li key={it.id} className="text-xs">
                          {itemLabel(it)}
                          {r.status === "DONE" && it.confirmedUnits != null && (
                            <span className="text-[var(--text-secondary)]">
                              {" "}
                              → took {it.confirmedUnits}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: STATUS_COLOR[r.status] }}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.status === "PENDING" && (
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="secondary"
                          className="text-xs"
                          onClick={() => setBuilder(r)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          className="text-xs"
                          onClick={() => cancel(r.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

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
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const m: Record<string, Row> = {};
    for (const p of pallets) m[p.id] = { include: false, whole: false, units: "" };
    if (existing) {
      for (const it of existing.items) {
        if (m[it.palletId]) {
          m[it.palletId] = {
            include: true,
            whole: it.uom === "PALLET",
            units: it.uom === "PALLET" ? "" : String(it.units),
          };
        }
      }
    }
    return m;
  });
  const [reqDate, setReqDate] = useState(existing?.requestedDate?.slice(0, 10) ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setRow(id: string, patch: Partial<Row>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  }

  async function submit() {
    setError("");
    const items: { palletId: string; units: number; uom: "PALLET" | "UNIT" }[] = [];
    for (const p of pallets) {
      const row = rows[p.id];
      if (!row?.include) continue;
      if (row.whole) {
        items.push({ palletId: p.id, units: p.unitCount, uom: "PALLET" });
      } else {
        const u = Number(row.units);
        if (!u || u < 1) {
          setError(`Enter units for ${p.palletCode} (or pick the whole pallet)`);
          return;
        }
        if (u > p.unitCount) {
          setError(`${p.palletCode} only has ${p.unitCount} units`);
          return;
        }
        items.push({ palletId: p.id, units: u, uom: "UNIT" });
      }
    }
    if (items.length === 0) {
      setError("Select at least one pallet");
      return;
    }

    setSaving(true);
    try {
      const url = existing
        ? `/api/storage/requests/${existing.id}`
        : "/api/storage/requests";
      const body = existing
        ? { action: "edit", items, requestedDate: reqDate || null, note }
        : { items, requestedDate: reqDate || null, note };
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">
            {existing ? "Edit pickup request" : "Request pickup"}
          </h2>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]">
            close
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {pallets.map((p) => {
            const row = rows[p.id];
            return (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.include}
                  onChange={(e) => setRow(p.id, { include: e.target.checked })}
                />
                <div className="flex-1">
                  <span className="font-mono text-xs">{p.palletCode}</span> · {p.productName}
                  <span className="text-[var(--text-secondary)]"> ({p.unitCount}u)</span>
                </div>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    disabled={!row.include}
                    checked={row.whole}
                    onChange={(e) => setRow(p.id, { whole: e.target.checked })}
                  />
                  whole
                </label>
                <input
                  className="filter-input w-20"
                  type="number"
                  min={1}
                  max={p.unitCount}
                  placeholder="units"
                  disabled={!row.include || row.whole}
                  value={row.units}
                  onChange={(e) => setRow(p.id, { units: e.target.value })}
                />
              </div>
            );
          })}
        </div>

        <label className="flex flex-col gap-1 mb-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Preferred pickup date (optional)
          </span>
          <input
            className="filter-input w-full"
            type="date"
            value={reqDate}
            onChange={(e) => setReqDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 mb-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Note (optional)</span>
          <input
            className="filter-input w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <p className="text-xs text-[var(--text-secondary)] mb-3">
          You can edit this request until our staff confirm the final amount at pickup.
        </p>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            icon={saving ? "hourglass_empty" : "local_shipping"}
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Submit request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
