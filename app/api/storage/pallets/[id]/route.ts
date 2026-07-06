import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { deletePallet } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE 1 pallet — dọn pallet test / nhập nhầm. CHỈ STAFF/SUPER_ADMIN.
 * Chặn nếu pallet đang bị pickup request tham chiếu (deletePallet ném lỗi).
 */
export const DELETE = withAuth<RouteContext>(
  async (_req, _user, ctx) => {
    try {
      const { id } = await ctx.params;
      await deletePallet(id);
      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
