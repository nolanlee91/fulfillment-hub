import { NextResponse } from "next/server";
import { syncAllSheets } from "@/lib/sync/sync";

export const maxDuration = 60; // Vercel/Next limit, Railway không bị giới hạn

export async function POST() {
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

// Cho phép GET để test từ browser
export async function GET() {
  return POST();
}
