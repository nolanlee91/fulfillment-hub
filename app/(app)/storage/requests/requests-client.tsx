"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, Button } from "@/components/ui";
import { Dropdown } from "@/components/ui/dropdown";

interface ReqItem {
  id: string;
  palletId: string;
  units: number;
  uom: "PALLET" | "UNIT";
  confirmedUnits: number | null;
  palletCode: string | null;
  productName: string | null;
  unitCount: number | null;
}
interface PickupRequest {
  id: string;
  customerId: string;
  status: "PENDING" | "DONE" | "CANCELLED";
  requestedDate: string | null;
  note: string | null;
  createdAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  customerConfirmedAt: string | null;
  customerConfirmedBy: string | null;
  items: ReqItem[];
}
interface Customer {
  id: string;
  name: string;
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
function itemLabel(it: ReqItem): string {
  const head = it.productName ? `${it.productName} · ${it.palletCode}` : it.palletCode;
  return it.uom === "PALLET" ? `${head} (whole pallet)` : `${head} × ${it.units} units`;
}

export default function RequestsClient() {
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fStatus, setFStatus] = useState("");
  const [confirming, setConfirming] = useState<PickupRequest | null>(null);

  const custName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of customers) m[c.id] = c.name;
    return m;
  }, [customers]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fStatus) params.set("status", fStatus);
    const res = await fetch(`/api/storage/requests?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      setRequests(data.data.requests);
      setCustomers(data.data.customers);
    }
    setLoading(false);
  }, [fStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(id: string, action: string) {
    const res = await fetch(`/api/storage/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!data.success) alert(data.error);
    await load();
  }
  async function cancel(id: string) {
    if (!confirm("Cancel this request?")) return;
    await post(id, "cancel");
  }
  async function del(id: string) {
    if (!confirm("Xóa hẳn yêu cầu này? Không hoàn tác.")) return;
    await post(id, "delete");
  }

  return (
    <>
      <Topbar title="Pickup Requests" subtitle="Storage" showSync={false} />

      <div className="flex items-center gap-2 mb-3">
        <Dropdown
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: "PENDING", label: "Pending" },
            { value: "DONE", label: "Done" },
            { value: "CANCELLED", label: "Cancelled" },
            { value: "", label: "All" },
          ]}
        />
      </div>

      <Card padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--text-secondary)] border-b">
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Wanted date</th>
              <th className="px-3 py-2">Items</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Staff confirm</th>
              <th className="px-3 py-2">Customer confirm</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  Loading…
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  No requests.
                </td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b text-sm align-top">
                  <td className="px-3 py-2">{custName[r.customerId] ?? r.customerId}</td>
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
                    {r.note && (
                      <div className="text-xs text-[var(--text-secondary)] mt-1">“{r.note}”</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: STATUS_COLOR[r.status] }}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <ConfirmCell
                      at={r.confirmedAt}
                      who={r.confirmedBy}
                      pending="chờ chốt"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <ConfirmCell
                      at={r.customerConfirmedAt}
                      who={r.customerConfirmedBy}
                      pending="chưa đồng ý"
                    />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="flex gap-2 justify-end">
                      {r.status === "PENDING" && (
                        <>
                          <Button
                            variant="secondary"
                            className="text-xs"
                            onClick={() => cancel(r.id)}
                          >
                            Cancel
                          </Button>
                          <Button
                            icon="check"
                            className="text-xs"
                            onClick={() => setConfirming(r)}
                          >
                            Confirm
                          </Button>
                        </>
                      )}
                      {r.status !== "DONE" && (
                        <Button
                          variant="secondary"
                          icon="delete"
                          className="text-xs"
                          title="Delete request"
                          onClick={() => del(r.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {confirming && (
        <ConfirmModal
          request={confirming}
          customerName={custName[confirming.customerId] ?? confirming.customerId}
          onClose={() => setConfirming(null)}
          onDone={async () => {
            setConfirming(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function ConfirmCell({
  at,
  who,
  pending,
}: {
  at: string | null;
  who: string | null;
  pending: string;
}) {
  if (!at) {
    return <span className="text-xs text-[var(--text-secondary)]">— {pending}</span>;
  }
  return (
    <span className="text-xs font-medium" style={{ color: "#15803d" }}>
      <span className="material-symbols-outlined text-[13px] align-middle">check_circle</span>{" "}
      {who ?? ""}
      <span className="block text-[10px] text-[var(--text-secondary)]">{fmtDate(at)}</span>
    </span>
  );
}

function ConfirmModal({
  request,
  customerName,
  onClose,
  onDone,
}: {
  request: PickupRequest;
  customerName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  // confirmedUnits mặc định = số yêu cầu (PALLET = toàn bộ tồn).
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const it of request.items) {
      m[it.id] = String(it.uom === "PALLET" ? (it.unitCount ?? it.units) : it.units);
    }
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setSaving(true);
    try {
      const confirmations: Record<string, number> = {};
      for (const it of request.items) confirmations[it.id] = Number(vals[it.id]) || 0;
      const res = await fetch(`/api/storage/requests/${request.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", confirmations }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Confirm failed");
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
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Confirm pickup</h2>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]">
            close
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          {customerName} — enter the actual units taken when goods leave the warehouse.
        </p>

        <div className="space-y-2 mb-4">
          {request.items.map((it) => (
            <div key={it.id} className="flex items-center gap-3">
              <div className="flex-1 text-sm">
                <span className="font-mono text-xs">{it.palletCode}</span> · {it.productName}
                <span className="text-[var(--text-secondary)]">
                  {" "}
                  (req {it.uom === "PALLET" ? "whole" : `${it.units}u`}, {it.unitCount} in stock)
                </span>
              </div>
              <input
                className="filter-input w-24"
                type="number"
                min={0}
                value={vals[it.id] ?? ""}
                onChange={(e) => setVals((v) => ({ ...v, [it.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving} icon={saving ? "hourglass_empty" : "check"}>
            {saving ? "Saving…" : "Confirm & done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
