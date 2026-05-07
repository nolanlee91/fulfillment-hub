import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackingFiles } from "@/lib/db/schema";
import { asc, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * One-shot: trả về tổng số file APT đã processed + 5 file cũ nhất + 5 file mới nhất.
 * Dùng để check date range của events còn trên SFTP.
 */
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

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(trackingFiles);

  const oldest = await db
    .select({ filename: trackingFiles.filename })
    .from(trackingFiles)
    .orderBy(asc(trackingFiles.filename))
    .limit(5);

  const newest = await db
    .select({ filename: trackingFiles.filename })
    .from(trackingFiles)
    .orderBy(desc(trackingFiles.filename))
    .limit(5);

  return NextResponse.json({
    success: true,
    total: count,
    oldest: oldest.map((f) => f.filename),
    newest: newest.map((f) => f.filename),
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
