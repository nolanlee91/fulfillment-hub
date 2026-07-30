import { NextRequest, NextResponse } from "next/server";
import { runDetectStuck } from "@/lib/carrier-tracking/detect-stuck";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDetectStuck();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Cron detect-stuck error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
