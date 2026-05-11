import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STUCK_THRESHOLD_BUSINESS_DAYS = 3;
const STUCK_NOTE = `Không có cập nhật trong ${STUCK_THRESHOLD_BUSINESS_DAYS} ngày làm việc`;

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

/**
 * One-shot: CLEAR tất cả STUCK hiện có rồi RECOMPUTE theo logic mới
 * (business days). Đơn nào còn đủ điều kiện sẽ được flag lại ngay,
 * không cần đợi cron 6h.
 *
 * SUPER_ADMIN only.
 */
export const GET = withAuth(
  async () => {
    const now = new Date();
    const threshold = businessDaysAgo(STUCK_THRESHOLD_BUSINESS_DAYS, now);

    // 1. CLEAR tất cả STUCK
    const cleared = await db
      .update(orders)
      .set({
        attentionReason: null,
        attentionAt: null,
        attentionNote: null,
        updatedAt: now,
      })
      .where(eq(orders.attentionReason, "STUCK"))
      .returning({ uniqueKey: orders.uniqueKey });

    // 2. RECOMPUTE flag STUCK theo logic mới
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
          or(
            isNull(orders.attentionReason),
            eq(orders.attentionReason, "STUCK"),
          ),
        ),
      )
      .returning({ uniqueKey: orders.uniqueKey });

    return NextResponse.json({
      success: true,
      cleared: cleared.length,
      flagged: flagged.length,
      thresholdBusinessDays: STUCK_THRESHOLD_BUSINESS_DAYS,
      thresholdAt: threshold.toISOString(),
      message: `Đã clear ${cleared.length} STUCK cũ, flag lại ${flagged.length} đơn theo logic ${STUCK_THRESHOLD_BUSINESS_DAYS} ngày làm việc.`,
    });
  },
  { roles: ["SUPER_ADMIN"] },
);
