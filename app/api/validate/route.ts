import { NextResponse } from "next/server";
import { validateAndAssignAll } from "@/lib/sync/validate";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";

export const maxDuration = 60;

async function handleValidate(_req: unknown, user: CurrentUser) {
  try {
    // CUSTOMER → chỉ validate đơn của chính họ. STAFF/ADMIN → toàn bộ như cũ.
    const customerId =
      user.role === "CUSTOMER" ? (user.customerId ?? undefined) : undefined;
    if (user.role === "CUSTOMER" && !customerId) {
      return NextResponse.json(
        { success: false, error: "Tài khoản chưa gắn khách hàng" },
        { status: 403 },
      );
    }

    const result = await validateAndAssignAll(customerId);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Validate error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAuth(handleValidate, {
  roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"],
});
export const GET = withAuth(handleValidate, {
  roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"],
});
