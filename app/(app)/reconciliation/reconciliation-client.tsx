"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { Button, Card } from "@/components/ui";

type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";

interface UploadResult {
  totalInFile: number;
  matched: number;
  unmatched: number;
  unmatchedOrderIds: string[];
  skippedCOD: number;
  message: string;
}

interface UnreconciledOrder {
  uniqueKey: string;
  orderId: string;
  productName: string;
  name: string;
  quantity: number;
  status: string;
  shipDate: string | null;
}

export default function ReconciliationClient({
  role,
  customerId,
}: {
  role: Role;
  customerId: string | null;
}) {
  return (
    <>
      <Topbar title="Đối soát thanh toán" subtitle="Reconciliation" />

      <UploadSection role={role} />

      <UnreconciledList role={role} customerId={customerId} />
    </>
  );
}

// ============================================================================
// Section 1: Upload Excel file (orderID + refNumber)
// ============================================================================
function UploadSection({ role }: { role: Role }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/reconciliation/upload-ref", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        setFile(null);
        const input = document.getElementById("ref-file-input") as HTMLInputElement;
        if (input) input.value = "";
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Card padding="lg" className="mb-4">
        <h3 className="font-bold text-lg mb-1">Upload file đối soát (ETF)</h3>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          File Excel (.xlsx) với 2 cột: <b>Mã đơn hàng</b> + <b>Mã Ref</b> (lấy từ email noti ngân hàng). App match orderID → gán Ref cho đơn của
          {role === "CUSTOMER" ? " bạn" : " khách"}.
        </p>

        <label
          className="text-[11px] font-bold tracking-widest uppercase block mb-2"
          style={{ color: "var(--text-muted)" }}
        >
          File Excel (.xlsx)
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
          {uploading ? "Đang xử lý..." : "Upload"}
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
          <h3 className="font-bold text-lg mb-4">Kết quả</h3>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <ResultCard label="Khớp" value={result.matched} accent="emerald" hint="Đã gán Ref" />
            <ResultCard label="Không khớp" value={result.unmatched} accent="red" hint="OrderID không tìm thấy" />
            <ResultCard label="Bỏ qua COD" value={result.skippedCOD} accent="slate" hint="Đơn COD không cần đối soát" />
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
                Mã đơn không khớp ({result.unmatchedOrderIds.length}
                {result.unmatched > result.unmatchedOrderIds.length ? `+, hiện 50 đầu` : ""}):
              </p>
              <p className="font-mono text-[11px] leading-relaxed">
                {result.unmatchedOrderIds.join(", ")}
              </p>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

// ============================================================================
// Section 2: List unreconciled orders (đã giao, đã có label, prepaid)
// ============================================================================
function UnreconciledList({ role, customerId }: { role: Role; customerId: string | null }) {
  const [orders, setOrders] = useState<UnreconciledOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load đơn của customer (CUSTOMER tự động filter, STAFF có thể chọn customer sau)
    const params = new URLSearchParams();
    params.set("excludeTerminal", "false");
    params.set("payment", "PREPAID");
    if (role !== "CUSTOMER" && customerId) params.set("customer", customerId);

    fetch(`/api/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const unrec = (d.data as Array<UnreconciledOrder & { reconciledAt: string | null; paymentMethod: string }>).filter(
            (o) => !o.reconciledAt && o.paymentMethod === "PREPAID",
          );
          setOrders(unrec);
        }
      })
      .finally(() => setLoading(false));
  }, [role, customerId]);

  if (loading) {
    return (
      <Card padding="lg">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Đang tải...
        </p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <h3 className="font-bold text-lg mb-1">Đơn prepaid chưa đối soát</h3>
      <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
        Danh sách đơn prepaid của {role === "CUSTOMER" ? "bạn" : "customer"} chưa có Mã Ref. Upload file để gán Ref hàng loạt.
      </p>

      {orders.length === 0 ? (
        <p className="text-sm py-4" style={{ color: "var(--text-secondary)" }}>
          ✓ Tất cả đơn prepaid đã được đối soát.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-[11px] font-bold tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                <th className="py-2 pr-3">Order ID</th>
                <th className="py-2 pr-3">Recipient</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 100).map((o) => (
                <tr
                  key={o.uniqueKey}
                  className="border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="py-2 pr-3 font-mono text-[12px]">{o.orderId}</td>
                  <td className="py-2 pr-3">{o.name}</td>
                  <td className="py-2 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {o.productName}
                  </td>
                  <td className="py-2 pr-3 text-right font-bold">{o.quantity}</td>
                  <td className="py-2 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {o.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length > 100 && (
            <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
              Hiện 100/{orders.length} đơn. Up file Ref để xử lý hàng loạt.
            </p>
          )}
        </div>
      )}
    </Card>
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
  accent: "emerald" | "red" | "slate";
  hint: string;
}) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    emerald: { bg: "rgba(74, 222, 128, 0.08)", fg: "#15803d", border: "#15803d" },
    red: { bg: "rgba(220, 38, 38, 0.08)", fg: "#dc2626", border: "#ef4444" },
    slate: { bg: "rgba(100, 116, 139, 0.08)", fg: "#475569", border: "#475569" },
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
