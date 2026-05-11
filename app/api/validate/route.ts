import { NextResponse } from "next/server";
import { validateAndAssignAll } from "@/lib/sync/validate";
import { withAuth } from "@/lib/auth/api-guard";

export const maxDuration = 60;

async function handleValidate() {
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

export const POST = withAuth(handleValidate, { roles: ["SUPER_ADMIN", "STAFF"] });
export const GET = withAuth(handleValidate, { roles: ["SUPER_ADMIN", "STAFF"] });
