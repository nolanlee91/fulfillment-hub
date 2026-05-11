import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, trackingFiles } from "@/lib/db/schema";
import { eq, inArray, desc, gte, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnostic one-shot endpoint cho vấn đề đơn STUCK nhưng đã giao.
 *
 * GET /api/admin/diag-stuck?tn=1031358662919206,1031358662072208
 *
 * Trả về:
 *  - cronHealth: số file APT pull trong 24h/3d/7d, 10 file gần nhất
 *  - trackingLookup: với mỗi tn cung cấp, full DB state
 *  - stuckSamples: 15 đơn STUCK random + state để xem pattern
 *
 * SUPER_ADMIN only. Không modify gì, chỉ READ.
 */
export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const tnParam = url.searchParams.get("tn") || "";
    const requestedTns = tnParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const since24h = new Date(now.getTime() - day);
    const since3d = new Date(now.getTime() - 3 * day);
    const since7d = new Date(now.getTime() - 7 * day);

    // === 1. Cron health ===
    const [c24] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trackingFiles)
      .where(gte(trackingFiles.processedAt, since24h));
    const [c3d] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trackingFiles)
      .where(gte(trackingFiles.processedAt, since3d));
    const [c7d] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trackingFiles)
      .where(gte(trackingFiles.processedAt, since7d));

    const recentFiles = await db
      .select({
        filename: trackingFiles.filename,
        processedAt: trackingFiles.processedAt,
        totalRows: trackingFiles.totalRows,
        totalUpdated: trackingFiles.totalUpdated,
      })
      .from(trackingFiles)
      .orderBy(desc(trackingFiles.processedAt))
      .limit(10);

    // === 2. Tracking lookup ===
    let trackingLookup: Array<Record<string, unknown>> = [];
    if (requestedTns.length > 0) {
      const rows = await db
        .select({
          uniqueKey: orders.uniqueKey,
          orderId: orders.orderId,
          customerId: orders.customerId,
          trackingNumber: orders.trackingNumber,
          trackingUrl: orders.trackingUrl,
          status: orders.status,
          lastTrackingEvent: orders.lastTrackingEvent,
          lastTrackingAt: orders.lastTrackingAt,
          attentionReason: orders.attentionReason,
          attentionAt: orders.attentionAt,
          attentionNote: orders.attentionNote,
          deliveredAt: orders.deliveredAt,
          batchId: orders.batchId,
          syncedAt: orders.syncedAt,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(inArray(orders.trackingNumber, requestedTns));

      const foundTns = new Set(rows.map((r) => r.trackingNumber));
      const missing = requestedTns.filter((tn) => !foundTns.has(tn));

      trackingLookup = [
        ...rows.map((r) => ({ ...r, found: true })),
        ...missing.map((tn) => ({
          trackingNumber: tn,
          found: false,
          note: "Không tìm thấy trong orders.tracking_number (có thể format không khớp)",
        })),
      ];
    }

    // === 3. Sample 15 STUCK orders ===
    const stuckSamples = await db
      .select({
        orderId: orders.orderId,
        customerId: orders.customerId,
        trackingNumber: orders.trackingNumber,
        status: orders.status,
        lastTrackingEvent: orders.lastTrackingEvent,
        lastTrackingAt: orders.lastTrackingAt,
        attentionAt: orders.attentionAt,
        attentionNote: orders.attentionNote,
      })
      .from(orders)
      .where(eq(orders.attentionReason, "STUCK"))
      .orderBy(desc(orders.attentionAt))
      .limit(15);

    return NextResponse.json(
      {
        success: true,
        now: now.toISOString(),
        cronHealth: {
          aptFilesLast24h: Number(c24?.count ?? 0),
          aptFilesLast3d: Number(c3d?.count ?? 0),
          aptFilesLast7d: Number(c7d?.count ?? 0),
          recentFiles,
        },
        trackingLookup,
        stuckSamples,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  },
  { roles: ["SUPER_ADMIN"] },
);
