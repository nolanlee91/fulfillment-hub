import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { syncTrackingToSheet } from "@/lib/sync/write-back";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 200;

async function handler(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET chưa setup" },
      { status: 500 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  // Đơn có tracking nhưng chưa sync về sheet
  const candidates = await db
    .select({ uniqueKey: orders.uniqueKey })
    .from(orders)
    .where(
      and(
        sql`${orders.trackingNumber} IS NOT NULL`,
        isNull(orders.syncedToSheetAt),
        // Chỉ sync các đơn đã có label trở lên (đã thực sự đi)
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
      message: "Không có đơn nào cần sync",
    });
  }

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  const skipReasons: Record<string, number> = {};
  const failSamples: string[] = [];

  for (const c of candidates) {
    try {
      const res = await syncTrackingToSheet(c.uniqueKey);
      if (res.success) synced += 1;
      else if (res.skipped) {
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
    failSamples,
    message: `Đã quét ${candidates.length} đơn: synced ${synced}, skipped ${skipped}, failed ${failed}.`,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
