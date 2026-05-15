import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, isNull, sql } from "drizzle-orm";
import { syncTrackingBatch } from "@/lib/sync/write-back";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 100;

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

  const res = await syncTrackingBatch(candidates.map((c) => c.uniqueKey));

  return NextResponse.json({
    success: true,
    scanned: candidates.length,
    synced: res.synced,
    skipped: res.skipped,
    failed: res.failed,
    skipReasons: res.skipReasons,
    failSamples: res.failSamples,
    message: `Đã quét ${candidates.length} đơn: synced ${res.synced}, skipped ${res.skipped}, failed ${res.failed}.`,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
