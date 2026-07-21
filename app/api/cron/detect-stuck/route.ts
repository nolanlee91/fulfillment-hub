import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, gte, isNull, lt, or, sql } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STUCK_THRESHOLD_BUSINESS_DAYS = 3;
const STUCK_NOTE = `Không có cập nhật trong ${STUCK_THRESHOLD_BUSINESS_DAYS} ngày làm việc`;

/**
 * Trả về timestamp của n ngày làm việc trước `from`, skip Saturday (6) + Sunday (0).
 *
 * Ví dụ với from=Thursday: -3 BD = Monday cùng tuần.
 * Ví dụ với from=Monday: -3 BD = Wednesday tuần trước (skip Sun + Sat).
 */
function businessDaysAgo(n: number, from: Date = new Date()): Date {
  const d = new Date(from);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return d;
}

async function handler(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET chưa setup trên server" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

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
        or(
          isNull(orders.attentionReason),
          eq(orders.attentionReason, "STUCK"),
        ),
      ),
    )
    .returning({ uniqueKey: orders.uniqueKey });

  // Tự HEAL: đơn đang gắn STUCK nhưng đã có cập nhật trở lại (lastTrackingAt ≥ ngưỡng)
  // → gỡ cờ. Lưới an toàn nếu processor bỏ sót (chỉ đụng cờ STUCK, không đụng cờ khác).
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

  return NextResponse.json({
    success: true,
    flagged: flagged.length,
    cleared: cleared.length,
    thresholdBusinessDays: STUCK_THRESHOLD_BUSINESS_DAYS,
    thresholdAt: threshold.toISOString(),
    message: `Đã đánh dấu ${flagged.length} đơn STUCK, gỡ ${cleared.length} đơn đã có cập nhật lại (ngưỡng ${STUCK_THRESHOLD_BUSINESS_DAYS} ngày làm việc).`,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
