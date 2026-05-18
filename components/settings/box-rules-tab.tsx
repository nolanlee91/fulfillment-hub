"use client";

import { useEffect, useState, useCallback } from "react";

interface ProductInfo {
  id: string;
  name: string;
}

interface BoxInfo {
  code: string;
  name: string;
}

interface Rule {
  productId: string;
  boxCode: string;
  maxQty: number;
}

export function BoxRulesTab() {
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [boxes, setBoxes] = useState<BoxInfo[]>([]);
  const [matrix, setMatrix] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/box-rules");
    const data = await res.json();
    if (data.success) {
      setProducts(data.data.products);
      setBoxes(data.data.boxes);
      const m: Record<string, number> = {};
      for (const r of data.data.rules) {
        m[`${r.productId}_${r.boxCode}`] = r.maxQty;
      }
      setMatrix(m);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const updateCell = useCallback(
    async (productId: string, boxCode: string, value: number) => {
      const key = `${productId}_${boxCode}`;
      setSavingCell(key);
      try {
        const res = await fetch("/api/box-rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            boxCode,
            maxQty: value,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setMatrix((prev) => ({ ...prev, [key]: value }));
        } else {
          alert("Error: " + data.error);
        }
      } finally {
        setSavingCell(null);
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="p-12 text-center" style={{ color: "var(--text-secondary)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div>
      <p
        className="text-xs mb-4"
        style={{ color: "var(--text-muted)" }}
      >
        Click a cell to edit the max quantity. Auto-saves on blur.
      </p>

      <div className="overflow-x-auto">
        <table
          className="border-collapse"
          style={{ borderColor: "var(--border)" }}
        >
          <thead>
            <tr style={{ backgroundColor: "var(--bg-tertiary)" }}>
              <th
                className="text-left px-4 py-3 text-[11px] font-bold tracking-widest uppercase sticky left-0 z-10 border-r"
                style={{
                  color: "var(--text-muted)",
                  backgroundColor: "var(--bg-tertiary)",
                  borderColor: "var(--border)",
                  minWidth: "180px",
                }}
              >
                Product
              </th>
              {boxes.map((b) => (
                <th
                  key={b.code}
                  className="text-center px-3 py-3 text-[11px] font-bold tracking-widest uppercase border-l"
                  style={{
                    color: "var(--accent)",
                    borderColor: "var(--border)",
                    minWidth: "80px",
                  }}
                >
                  {b.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p, idx) => (
              <tr
                key={p.id}
                className="border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <td
                  className="px-4 py-2 text-sm font-bold sticky left-0 z-10 border-r"
                  style={{
                    color: "var(--text-primary)",
                    backgroundColor:
                      idx % 2 === 0
                        ? "var(--bg-secondary)"
                        : "var(--bg-primary)",
                    borderColor: "var(--border)",
                  }}
                >
                  {p.name}
                </td>
                {boxes.map((b) => {
                  const key = `${p.id}_${b.code}`;
                  const value = matrix[key] ?? 0;
                  const isSaving = savingCell === key;

                  return (
                    <td
                      key={b.code}
                      className="border-l p-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <input
                        type="number"
                        min={0}
                        defaultValue={value}
                        onBlur={(e) => {
                          const newVal = Number(e.target.value) || 0;
                          if (newVal !== value) {
                            updateCell(p.id, b.code, newVal);
                          }
                        }}
                        className="w-full text-center font-mono text-sm py-2"
                        style={{
                          backgroundColor: "transparent",
                          color: value > 0 ? "var(--text-primary)" : "var(--text-muted)",
                          border: "none",
                          outline: isSaving ? `2px solid var(--accent)` : "none",
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
