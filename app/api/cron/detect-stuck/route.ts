import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const STUCK_THRESHOLD_DAYS = 3;
const STUCK_NOTE = `Không có cập nhật trong ${STUCK_THRESHOLD_DAYS} ngày`;

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
  const threshold = new Date(now.getTime() - STUCK_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

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
    flagged: flagged.length,
    thresholdDays: STUCK_THRESHOLD_DAYS,
    thresholdAt: threshold.toISOString(),
    message: `Đã đánh dấu ${flagged.length} đơn STUCK (không cập nhật ${STUCK_THRESHOLD_DAYS} ngày).`,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
