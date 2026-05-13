"use client";

import { useCallback, useEffect, useState } from "react";

export type FlagColor = "red" | "yellow" | null;

/**
 * Fetch toàn bộ đơn có flag (đỏ, vàng, đã gỡ) → Map<orderUniqueKey, FlagColor>.
 * Key có trong map nghĩa là đơn từng được gắn cờ (kể cả đã gỡ).
 * Key không có nghĩa là chưa từng gắn cờ.
 */
export function useFlagMap(): {
  map: Map<string, FlagColor>;
  refetch: () => Promise<void>;
} {
  const [map, setMap] = useState<Map<string, FlagColor>>(new Map());

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/flags?status=red,yellow,resolved");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const m = new Map<string, FlagColor>();
        for (const row of json.data as Array<{
          orderUniqueKey: string;
          currentColor: FlagColor;
        }>) {
          m.set(row.orderUniqueKey, row.currentColor);
        }
        setMap(m);
      }
    } catch {
      // ignore — flag map là phụ trợ, không phải critical
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { map, refetch };
}
