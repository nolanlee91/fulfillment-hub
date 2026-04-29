import { NextResponse } from "next/server";
import { validateAndAssignAll } from "@/lib/sync/validate";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await validateAndAssignAll();
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Validate error:", error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return POST();
}
