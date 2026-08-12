"use client";

import { useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

interface UploadResult {
  totalInFile: number;
  added: number;
  updated: number;
  unmatched: number;
  unmatchedOrderIds: string[];
  skippedCOD: number;
  blockedBooked: number;
  blockedBookedOrderIds: string[];
  message: string;
}

interface Conflict {
  orderId: string;
  existing: { type: string; ref: string | null }[];
  hasBooked: boolean;
  canUpdate: boolean;
}

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  ETF: "ETF",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  MONEY_ORDER: "Money order",
};

function describeExisting(items: { type: string; ref: string | null }[]): string {
  return items
    .map((it) =>
      it.ref
        ? `${PAYMENT_TYPE_LABEL[it.type] ?? it.type} ${it.ref}`
        : `${PAYMENT_TYPE_LABEL[it.type] ?? it.type} (image)`,
    )
    .join(", ");
}

export default function ReconciliationClient() {
  return (
    <>
      <Topbar title="Reconciliation" subtitle="Match payments to your orders" />
      <UploadSection />
    </>
  );
}

// ============================================================================
// Section 1: Upload Excel file (orderID + refNumber)
// ============================================================================
function UploadSection() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Popup conflict — khi có Order ID đã có mã ETF trước đó.
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "update" | "add">>({});

  function clearFileInput() {
    setFile(null);
    const input = document.getElementById("ref-file-input") as HTMLInputElement;
    if (input) input.value = "";
  }

  /** Gửi request. resolutions != null → pha 2 (đã chọn xong ở popup). */
  async function submit(withResolutions: Record<string, "update" | "add"> | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (withResolutions) fd.append("resolutions", JSON.stringify(withResolutions));

      const res = await fetch("/api/reconciliation/upload-ref", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error);
        return;
      }
      if (data.needsResolution) {
        // Mở popup — mặc định "add" (an toàn, không xóa dữ liệu cũ). Khách chủ động
        // chọn "update" khi muốn thay khoản nhầm.
        const conf = data.conflicts as Conflict[];
        const init: Record<string, "update" | "add"> = {};
        for (const c of conf) init[c.orderId] = "add";
        setConflicts(conf);
        setResolutions(init);
        return;
      }
      // Đã apply xong
      setResult(data);
      setConflicts(null);
      clearFileInput();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const runUpload = () => submit(null);
  const confirmResolutions = () => submit(resolutions);

  return (
    <>
      <Card padding="lg" className="mb-4">
        <div className="flex items-start justify-between mb-1 gap-3">
          <h3 className="font-bold text-lg">Upload reconciliation file (ETF)</h3>
          <a
            href="/api/reconciliation/template"
            download
            className="text-xs font-semibold inline-flex items-center gap-1 px-3 py-1.5 rounded transition-colors shrink-0"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            <span className="material-symbols-outlined text-[15px]">download</span>
            Download template
          </a>
        </div>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Excel file (.xlsx) with 2 columns: <b>Order ID</b> + <b>Ref Number</b> (from your bank email notification). The Order ID column accepts either the Order ID or the tracking number — the app matches each row and assigns the Ref to your orders.
        </p>

        <label
          className="text-[11px] font-bold tracking-widest uppercase block mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          Excel file (.xlsx)
        </label>
        <input
          id="ref-file-input"
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={uploading}
          className="w-full px-3 py-2.5 rounded text-sm cursor-pointer"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
          }}
        />
        {file && (
          <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
            Selected: <span className="font-semibold">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
          </p>
        )}

        <Button
          variant="primary"
          icon="upload"
          onClick={runUpload}
          disabled={!file || uploading}
          className="mt-5"
        >
          {uploading ? "Processing..." : "Upload"}
        </Button>

        {error && (
          <div
            className="mt-4 px-4 py-2.5 rounded text-sm font-semibold"
            style={{ backgroundColor: "rgba(220, 38, 38, 0.10)", color: "#dc2626" }}
          >
            {error}
          </div>
        )}
      </Card>

      {result && (
        <Card padding="lg" className="mb-4">
          <h3 className="font-bold text-lg mb-4">Results</h3>

          <div className="grid grid-cols-4 gap-3 mb-4">
            <ResultCard label="Added" value={result.added} accent="emerald" hint="New payments assigned" />
            <ResultCard label="Updated" value={result.updated} accent="sky" hint="Replaced wrong ref" />
            <ResultCard label="Unmatched" value={result.unmatched} accent="red" hint="Order ID / tracking not found" />
            <ResultCard label="COD skipped" value={result.skippedCOD} accent="slate" hint="COD orders don't need reconciliation" />
          </div>

          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {result.message}
          </p>

          {result.unmatchedOrderIds.length > 0 && (
            <div
              className="mt-4 px-4 py-3 rounded text-xs"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                color: "#a16207",
                border: "1px solid rgba(245, 158, 11, 0.2)",
              }}
            >
              <p className="font-semibold mb-2">
                Order IDs / trackings not found ({result.unmatchedOrderIds.length}
                {result.unmatched > result.unmatchedOrderIds.length ? `+, showing first 50` : ""}):
              </p>
              <p className="font-mono text-[11px] leading-relaxed">
                {result.unmatchedOrderIds.join(", ")}
              </p>
            </div>
          )}

          {result.blockedBooked > 0 && (
            <div
              className="mt-4 px-4 py-3 rounded text-xs"
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.08)",
                color: "#a16207",
                border: "1px solid rgba(245, 158, 11, 0.2)",
              }}
            >
              <p className="font-semibold mb-2">
                {result.blockedBooked} mã đã hạch toán — KHÔNG cho Update (chỉ Bổ sung):
              </p>
              <p className="font-mono text-[11px] leading-relaxed">
                {result.blockedBookedOrderIds.join(", ")}
              </p>
            </div>
          )}
        </Card>
      )}

      {conflicts && (
        <ConflictModal
          conflicts={conflicts}
          resolutions={resolutions}
          setResolutions={setResolutions}
          onCancel={() => setConflicts(null)}
          onConfirm={confirmResolutions}
          busy={uploading}
        />
      )}
    </>
  );
}

// ============================================================================
// Popup chọn Update / Bổ sung cho từng Order ID trùng mã
// ============================================================================
function ConflictModal({
  conflicts,
  resolutions,
  setResolutions,
  onCancel,
  onConfirm,
  busy,
}: {
  conflicts: Conflict[];
  resolutions: Record<string, "update" | "add">;
  setResolutions: (r: Record<string, "update" | "add">) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  function setChoice(orderId: string, choice: "update" | "add") {
    setResolutions({ ...resolutions, [orderId]: choice });
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.55)", zIndex: 100 }}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-lg shadow-2xl"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-bold text-lg">These orders already have a Ref</h3>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            For each order, choose <b>Update</b> (replace the existing entry — a wrong ref/image)
            or <b>Add</b> (a second payment). Orders already booked can only be added to.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {conflicts.map((c) => (
            <div
              key={c.orderId}
              className="flex items-center gap-3 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold">{c.orderId}</p>
                <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                  Existing: {describeExisting(c.existing) || "—"}
                  {c.hasBooked && (
                    <span className="ml-2 font-semibold" style={{ color: "#a16207" }}>
                      · booked
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ChoiceButton
                  active={resolutions[c.orderId] === "update"}
                  disabled={!c.canUpdate}
                  onClick={() => c.canUpdate && setChoice(c.orderId, "update")}
                  title={c.canUpdate ? "Replace the existing entry" : "Booked — cannot update"}
                >
                  Update
                </ChoiceButton>
                <ChoiceButton
                  active={resolutions[c.orderId] === "add"}
                  disabled={false}
                  onClick={() => setChoice(c.orderId, "add")}
                  title="Add as a second payment"
                >
                  Add
                </ChoiceButton>
              </div>
            </div>
          ))}
        </div>

        <div
          className="px-5 py-3 border-t flex justify-end gap-2"
          style={{ borderColor: "var(--border)" }}
        >
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" onClick={onConfirm} disabled={busy}>
            {busy ? "Processing..." : "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChoiceButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-3 py-1.5 rounded text-[12px] font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        backgroundColor: active ? "var(--accent)" : "var(--bg-tertiary)",
        color: active ? "#fff" : "var(--text-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </button>
  );
}


function ResultCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent: "emerald" | "red" | "slate" | "amber" | "sky";
  hint: string;
}) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    emerald: { bg: "rgba(74, 222, 128, 0.08)", fg: "#15803d", border: "#15803d" },
    red: { bg: "rgba(220, 38, 38, 0.08)", fg: "#dc2626", border: "#ef4444" },
    slate: { bg: "rgba(100, 116, 139, 0.08)", fg: "#475569", border: "#475569" },
    amber: { bg: "rgba(245, 158, 11, 0.08)", fg: "#a16207", border: "#f59e0b" },
    sky: { bg: "rgba(14, 165, 233, 0.08)", fg: "#0369a1", border: "#0ea5e9" },
  };
  const c = palette[accent];
  return (
    <div
      className="rounded-lg p-4 border-l-4"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <p
        className="text-[11px] font-bold tracking-widest uppercase mb-2"
        style={{ color: c.fg }}
      >
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ color: c.fg }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    </div>
  );
}
