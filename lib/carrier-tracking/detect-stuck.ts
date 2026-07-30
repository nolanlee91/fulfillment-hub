import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

const STUCK_THRESHOLD_BUSINESS_DAYS = 3;
const STUCK_NOTE = `Không có cập nhật trong ${STUCK_THRESHOLD_BUSINESS_DAYS} ngày làm việc`;

/**
 * Timestamp của n ngày làm việc trước `from`, skip Saturday (6) + Sunday (0).
 */
function businessDaysAgo(n: number, from: Date = new Date()): Date {
  const d = new Date(from);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return d;
}

export interface DetectStuckResult {
  success: true;
  flagged: number;
  cleared: number;
  thresholdBusinessDays: number;
  thresholdAt: string;
  message: string;
}

/**
 * Đánh cờ STUCK ("No update") cho đơn IN_TRANSIT không có event ≥ 3 ngày làm việc,
 * và tự gỡ cờ khi đơn đã có cập nhật lại. Dùng chung bởi route + scheduler in-app.
 */
export async function runDetectStuck(): Promise<DetectStuckResult> {
  const now = new Date();
  const threshold = businessDaysAgo(STUCK_THRESHOLD_BUSINESS_DAYS, now);

  const flagged = await db
    .update(orders)
    .set({
      attentionReason: "STUCK",
      attentionAt: now,
      attentionNote: STUCK_NOTE,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.status, "IN_TRANSIT"),
        sql`${orders.trackingNumber} IS NOT NULL`,
        sql`${orders.lastTrackingAt} IS NOT NULL`,
        lt(orders.lastTrackingAt, threshold),
        or(isNull(orders.attentionReason), eq(orders.attentionReason, "STUCK")),
      ),
    )
    .returning({ uniqueKey: orders.uniqueKey });

  // Tự HEAL: đơn STUCK đã có cập nhật lại (lastTrackingAt ≥ ngưỡng) → gỡ cờ.
  const cleared = await db
    .update(orders)
    .set({
      attentionReason: null,
      attentionAt: null,
      attentionNote: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.attentionReason, "STUCK"),
        sql`${orders.lastTrackingAt} IS NOT NULL`,
        gte(orders.lastTrackingAt, threshold),
      ),
    )
    .returning({ uniqueKey: orders.uniqueKey });

  return {
    success: true,
    flagged: flagged.length,
    cleared: cleared.length,
    thresholdBusinessDays: STUCK_THRESHOLD_BUSINESS_DAYS,
    thresholdAt: threshold.toISOString(),
    message: `Đã đánh dấu ${flagged.length} đơn STUCK, gỡ ${cleared.length} đơn đã có cập nhật lại (ngưỡng ${STUCK_THRESHOLD_BUSINESS_DAYS} ngày làm việc).`,
  };
}
