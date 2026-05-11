import { NextResponse } from "next/server";
import { syncAllSheets } from "@/lib/sync/sync";
import { withAuth } from "@/lib/auth/api-guard";

export const maxDuration = 60; // Vercel/Next limit, Railway không bị giới hạn

async function handleSync() {
  try {
    const result = await syncAllSheets("manual");
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

export const POST = withAuth(handleSync, { roles: ["SUPER_ADMIN", "STAFF"] });
export const GET = withAuth(handleSync, { roles: ["SUPER_ADMIN", "STAFF"] });
