import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-shot fix: các đơn IN_TRANSIT có lastTrackingEvent là code "Delivered"
 * (1408/1409/1476/1496/1498) bị thiếu khỏi DELIVERED_CODES → set DELIVERED
 * + deliveredAt + clear attention.
 *
 * Pattern: `<code> — Delivered...` (xem processor.ts:185).
 *
 * SUPER_ADMIN only. Xóa endpoint sau khi chạy xong (giống fix-orphan-errors).
 */
export const GET = withAuth(
  async () => {
    const missedCodes = ["1408", "1409", "1476", "1496", "1498"];
    const now = new Date();

    const pattern = sql`(${sql.join(
      missedCodes.map((c) => sql`${orders.lastTrackingEvent} LIKE ${c + " %"}`),
      sql` OR `,
    )})`;

    const candidates = await db
      .select({
        uniqueKey: orders.uniqueKey,
        orderId: orders.orderId,
        trackingNumber: orders.trackingNumber,
        lastTrackingEvent: orders.lastTrackingEvent,
        lastTrackingAt: orders.lastTrackingAt,
        attentionReason: orders.attentionReason,
      })
      .from(orders)
      .where(and(eq(orders.status, "IN_TRANSIT"), pattern))
      .limit(2000);

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        fixed: 0,
        message: "Không có đơn nào cần fix.",
      });
    }

    // Update từng đơn để set deliveredAt = lastTrackingAt (mỗi đơn 1 giá trị khác nhau)
    let updated = 0;
    const samples: typeof candidates = [];
    for (const o of candidates) {
      await db
        .update(orders)
        .set({
          status: "DELIVERED",
          deliveredAt: o.lastTrackingAt ?? now,
          attentionReason: null,
          attentionAt: null,
          attentionNote: null,
          updatedAt: now,
        })
        .where(eq(orders.uniqueKey, o.uniqueKey));
      updated += 1;
      if (samples.length < 10) samples.push(o);
    }

    return NextResponse.json({
      success: true,
      fixed: updated,
      samples: samples.map((s) => ({
        orderId: s.orderId,
        trackingNumber: s.trackingNumber,
        wasAttention: s.attentionReason,
        lastEvent: s.lastTrackingEvent,
        deliveredAt: s.lastTrackingAt,
      })),
      message: `Đã fix ${updated} đơn IN_TRANSIT → DELIVERED (event 1408/1409/1476/1496/1498).`,
    });
  },
  { roles: ["SUPER_ADMIN"] },
);
