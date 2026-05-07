import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * One-shot fix cho các đơn bị ERROR oan từ bug cũ của tracking import:
 * - status = ERROR + có trackingNumber + errorNote = "Không tạo được label - cần kiểm tra lại"
 * → restore status dựa trên data có sẵn:
 *   - deliveredAt IS NOT NULL → DELIVERED
 *   - lastTrackingAt IS NOT NULL → IN_TRANSIT
 *   - else → LABEL_CREATED
 */
async function handler(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET chưa setup" },
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

  const candidates = await db
    .select({
      uniqueKey: orders.uniqueKey,
      orderId: orders.orderId,
      trackingNumber: orders.trackingNumber,
      lastTrackingAt: orders.lastTrackingAt,
      deliveredAt: orders.deliveredAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "ERROR"),
        isNotNull(orders.trackingNumber),
        eq(orders.errorNote, "Không tạo được label - cần kiểm tra lại"),
      ),
    );

  let toLabel = 0;
  let toInTransit = 0;
  let toDelivered = 0;
  const now = new Date();

  for (const c of candidates) {
    let newStatus: "LABEL_CREATED" | "IN_TRANSIT" | "DELIVERED";
    if (c.deliveredAt) {
      newStatus = "DELIVERED";
      toDelivered++;
    } else if (c.lastTrackingAt) {
      newStatus = "IN_TRANSIT";
      toInTransit++;
    } else {
      newStatus = "LABEL_CREATED";
      toLabel++;
    }

    await db
      .update(orders)
      .set({
        status: newStatus,
        errorNote: null,
        updatedAt: now,
      })
      .where(eq(orders.uniqueKey, c.uniqueKey));
  }

  return NextResponse.json({
    success: true,
    found: candidates.length,
    restored: {
      LABEL_CREATED: toLabel,
      IN_TRANSIT: toInTransit,
      DELIVERED: toDelivered,
    },
    message: `Restored ${candidates.length} đơn: ${toLabel} → LABEL_CREATED, ${toInTransit} → IN_TRANSIT, ${toDelivered} → DELIVERED`,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
