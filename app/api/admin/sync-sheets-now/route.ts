import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { syncTrackingToSheet } from "@/lib/sync/write-back";
import { withAuth } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 200;

/**
 * Manual trigger sync sheets cho SUPER_ADMIN (mở URL từ browser).
 * Khác /api/cron/sync-source-sheets ở chỗ:
 *  - Auth bằng session (withAuth) thay vì Bearer
 *  - Cho test ngay + backfill hàng loạt không phải đợi cron 30p
 *
 * Optional: ?uniqueKey=<key> để chỉ sync 1 đơn cụ thể (test 1 case).
 */
export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const specificKey = url.searchParams.get("uniqueKey");

    if (specificKey) {
      const result = await syncTrackingToSheet(specificKey);
      return NextResponse.json({ success: true, result });
    }

    const candidates = await db
      .select({ uniqueKey: orders.uniqueKey })
      .from(orders)
      .where(
        and(
          sql`${orders.trackingNumber} IS NOT NULL`,
          isNull(orders.syncedToSheetAt),
          sql`${orders.status} IN ('LABEL_CREATED', 'IN_TRANSIT', 'DELIVERED', 'FAILED')`,
        ),
      )
      .limit(BATCH_LIMIT);

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        scanned: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        message: "Không có đơn nào cần sync (tất cả đã synced_to_sheet_at hoặc chưa có tracking)",
      });
    }

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const skipReasons: Record<string, number> = {};
    const failSamples: string[] = [];
    const syncedSamples: string[] = [];

    for (const c of candidates) {
      try {
        const res = await syncTrackingToSheet(c.uniqueKey);
        if (res.success) {
          synced += 1;
          if (syncedSamples.length < 5) syncedSamples.push(c.uniqueKey);
        } else if (res.skipped) {
          skipped += 1;
          const r = res.reason ?? "unknown";
          skipReasons[r] = (skipReasons[r] || 0) + 1;
        } else {
          failed += 1;
          if (failSamples.length < 5) failSamples.push(`${c.uniqueKey}: ${res.reason}`);
        }
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        if (failSamples.length < 5) failSamples.push(`${c.uniqueKey}: ${msg}`);
      }
    }

    return NextResponse.json({
      success: true,
      scanned: candidates.length,
      synced,
      skipped,
      failed,
      skipReasons,
      syncedSamples,
      failSamples,
      message: `Đã quét ${candidates.length} đơn: synced ${synced}, skipped ${skipped}, failed ${failed}.`,
    });
  },
  { roles: ["SUPER_ADMIN"] },
);
