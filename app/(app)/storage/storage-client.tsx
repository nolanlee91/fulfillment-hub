"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Card, Button } from "@/components/ui";
import { Dropdown } from "@/components/ui/dropdown";

interface Pallet {
  id: string;
  palletCode: string;
  customerId: string;
  warehouseCode: string;
  productName: string;
  unitCount: number;
  initialUnits: number;
  status: "IN_STORAGE" | "PICKED_UP" | "DISPOSED";
  receivedAt: string;
  pickedUpAt: string | null;
  note: string | null;
}
interface Customer {
  id: string;
  name: string;
}
interface Warehouse {
  code: string;
  name: string;
  region: string;
}

const STATUS_LABEL: Record<Pallet["status"], string> = {
  IN_STORAGE: "Trong kho",
  PICKED_UP: "Đã lấy",
  DISPOSED: "Đã hủy",
};
const STATUS_COLOR: Record<Pallet["status"], string> = {
  IN_STORAGE: "#15803d",
  PICKED_UP: "#475569",
  DISPOSED: "#b91c1c",
};

function daysStored(receivedAt: string, pickedUpAt: string | null): number {
  const end = pickedUpAt ? new Date(pickedUpAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(receivedAt).getTime()) / 86_400_000));
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA");
}

export default function StorageClient() {
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  const [fStatus, setFStatus] = useState<string>("IN_STORAGE");
  const [fWarehouse, setFWarehouse] = useState<string>("");

  const [showReceive, setShowReceive] = useState(false);
  const [pickup, setPickup] = useState<Pallet | null>(null);

  const custName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of customers) m[c.id] = c.name;
    return m;
  }, [customers]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (fStatus) params.set("status", fStatus);
    if (fWarehouse) params.set("warehouse", fWarehouse);
    const res = await fetch(`/api/storage/pallets?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      setPallets(data.data.pallets);
      setCustomers(data.data.customers);
      setWarehouses(data.data.warehouses);
    }
    setLoading(false);
  }, [fStatus, fWarehouse]);

  useEffect(() => {
    load();
  }, [load]);

  const inStorage = pallets.filter((p) => p.status === "IN_STORAGE");
  const totalUnits = inStorage.reduce((s, p) => s + p.unitCount, 0);

  return (
    <>
      <Topbar title="Storage" subtitle="Lưu kho" showSync={false} />

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card>
          <div className="text-xs text-[var(--text-secondary)]">Pallet trong kho</div>
          <div className="text-2xl font-bold">{inStorage.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-secondary)]">Tổng unit tồn</div>
          <div className="text-2xl font-bold">{totalUnits.toLocaleString()}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-secondary)]">Số khách gửi</div>
          <div className="text-2xl font-bold">
            {new Set(inStorage.map((p) => p.customerId)).size}
          </div>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Dropdown
          value={fStatus}
          onChange={setFStatus}
          options={[
            { value: "IN_STORAGE", label: "Trong kho" },
            { value: "PICKED_UP", label: "Đã lấy" },
            { value: "", label: "Tất cả trạng thái" },
          ]}
        />
        <Dropdown
          value={fWarehouse}
          onChange={setFWarehouse}
          placeholder="Tất cả kho"
          options={[
            { value: "", label: "Tất cả kho" },
            ...warehouses.map((w) => ({ value: w.code, label: w.name })),
          ]}
        />
        <div className="ml-auto">
          <Button icon="add" onClick={() => setShowReceive(true)}>
            Nhập kho
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-[var(--text-secondary)] border-b">
              <th className="px-3 py-2">Mã pallet</th>
              <th className="px-3 py-2">Khách</th>
              <th className="px-3 py-2">Sản phẩm</th>
              <th className="px-3 py-2 text-right">Tồn / Nhập</th>
              <th className="px-3 py-2">Kho</th>
              <th className="px-3 py-2">Ngày nhập</th>
              <th className="px-3 py-2 text-right">Số ngày</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  Đang tải…
                </td>
              </tr>
            ) : pallets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[var(--text-secondary)]">
                  Chưa có pallet. Bấm <span className="font-semibold">Nhập kho</span> để thêm.
                </td>
              </tr>
            ) : (
              pallets.map((p) => (
                <tr key={p.id} className="border-b text-sm hover:bg-[rgba(0,0,0,0.02)]">
                  <td className="px-3 py-2 font-mono text-xs">{p.palletCode}</td>
                  <td className="px-3 py-2">{custName[p.customerId] ?? p.customerId}</td>
                  <td className="px-3 py-2">{p.productName}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-semibold">{p.unitCount}</span>
                    <span className="text-[var(--text-secondary)]"> / {p.initialUnits}</span>
                  </td>
                  <td className="px-3 py-2">{p.warehouseCode}</td>
                  <td className="px-3 py-2">{fmtDate(p.receivedAt)}</td>
                  <td className="px-3 py-2 text-right">{daysStored(p.receivedAt, p.pickedUpAt)}</td>
                  <td className="px-3 py-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: STATUS_COLOR[p.status] }}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.status === "IN_STORAGE" && (
                      <Button
                        variant="secondary"
                        icon="outbox"
                        className="text-xs"
                        onClick={() => setPickup(p)}
                      >
                        Pickup
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showReceive && (
        <ReceiveModal
          customers={customers}
          warehouses={warehouses}
          onClose={() => setShowReceive(false)}
          onDone={async () => {
            setShowReceive(false);
            await load();
          }}
        />
      )}
      {pickup && (
        <PickupModal
          pallet={pickup}
          onClose={() => setPickup(null)}
          onDone={async () => {
            setPickup(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="material-symbols-outlined text-[20px]">
            close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 mb-3">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

function ReceiveModal({
  customers,
  warehouses,
  onClose,
  onDone,
}: {
  customers: Customer[];
  warehouses: Warehouse[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [warehouseCode, setWarehouseCode] = useState(warehouses[0]?.code ?? "");
  const [productName, setProductName] = useState("");
  const [unitsPerPallet, setUnitsPerPallet] = useState("");
  const [palletCount, setPalletCount] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nPallet = Math.max(0, Math.floor(Number(palletCount) || 0));
  const estFee = nPallet * 10; // $10/pallet phí nhận

  async function submit() {
    setError("");
    if (!customerId || !warehouseCode || !productName.trim()) {
      setError("Nhập đủ khách hàng, kho, tên sản phẩm");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/storage/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          warehouseCode,
          productName: productName.trim(),
          unitsPerPallet: Number(unitsPerPallet) || 0,
          palletCount: nPallet,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Lỗi nhập kho");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Nhập kho" onClose={onClose}>
      <Field label="Khách hàng">
        <Dropdown
          value={customerId}
          onChange={setCustomerId}
          placeholder="Chọn khách"
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
      </Field>
      <Field label="Kho">
        <Dropdown
          value={warehouseCode}
          onChange={setWarehouseCode}
          options={warehouses.map((w) => ({ value: w.code, label: w.name }))}
        />
      </Field>
      <Field label="Tên sản phẩm (1 SKU/pallet)">
        <input
          className="filter-input w-full"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="VD: Original"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Số unit / pallet">
          <input
            className="filter-input w-full"
            type="number"
            min={0}
            value={unitsPerPallet}
            onChange={(e) => setUnitsPerPallet(e.target.value)}
            placeholder="100"
          />
        </Field>
        <Field label="Số pallet">
          <input
            className="filter-input w-full"
            type="number"
            min={1}
            value={palletCount}
            onChange={(e) => setPalletCount(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Ghi chú (tùy chọn)">
        <input
          className="filter-input w-full"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Phí nhận ước tính: <span className="font-semibold">${estFee}</span> ({nPallet} pallet × $10)
      </p>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Hủy
        </Button>
        <Button onClick={submit} disabled={saving} icon={saving ? "hourglass_empty" : "add"}>
          {saving ? "Đang lưu…" : `Tạo ${nPallet} pallet`}
        </Button>
      </div>
    </ModalShell>
  );
}

function PickupModal({
  pallet,
  onClose,
  onDone,
}: {
  pallet: Pallet;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"PALLET" | "UNIT">("PALLET");
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const taking = mode === "PALLET" ? pallet.unitCount : Math.min(pallet.unitCount, Number(units) || 0);
  const estFee = mode === "PALLET" ? 10 : (Number(units) || 0) * 1;

  async function submit() {
    setError("");
    if (mode === "UNIT" && (!Number(units) || Number(units) < 1)) {
      setError("Nhập số unit cần lấy");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/storage/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          palletId: pallet.id,
          uom: mode,
          units: mode === "UNIT" ? Number(units) : undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Lỗi pickup");
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Pickup — ${pallet.palletCode}`} onClose={onClose}>
      <p className="text-sm mb-3">
        {pallet.productName} · còn <span className="font-semibold">{pallet.unitCount}</span> unit
      </p>
      <div className="flex gap-2 mb-3">
        <button
          className={`btn ${mode === "PALLET" ? "btn-primary" : "btn-secondary"} text-xs`}
          onClick={() => setMode("PALLET")}
        >
          Lấy nguyên pallet ($10)
        </button>
        <button
          className={`btn ${mode === "UNIT" ? "btn-primary" : "btn-secondary"} text-xs`}
          onClick={() => setMode("UNIT")}
        >
          Lấy lẻ unit ($1/unit)
        </button>
      </div>
      {mode === "UNIT" && (
        <Field label={`Số unit lấy (tối đa ${pallet.unitCount})`}>
          <input
            className="filter-input w-full"
            type="number"
            min={1}
            max={pallet.unitCount}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
          />
        </Field>
      )}
      <Field label="Ghi chú (tùy chọn)">
        <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Lấy <span className="font-semibold">{taking}</span> unit · phí xuất ước tính{" "}
        <span className="font-semibold">${estFee}</span>
        {mode === "PALLET" && " · pallet sẽ rời kho"}
      </p>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Hủy
        </Button>
        <Button onClick={submit} disabled={saving} icon={saving ? "hourglass_empty" : "outbox"}>
          {saving ? "Đang lưu…" : "Xác nhận lấy"}
        </Button>
      </div>
    </ModalShell>
  );
}
