import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

interface RouteContext {
  params: Promise<{ orderUniqueKey: string }>;
}

/**
 * POST /api/flags/[orderUniqueKey]/resolve
 *  → gỡ cờ. Chỉ STAFF + SUPER_ADMIN.
 */
export const POST = withAuth<RouteContext>(
  async (_req, user, ctx) => {
    try {
      const { orderUniqueKey } = await ctx.params;

      const existing = await db
        .select({ id: flags.id, currentColor: flags.currentColor })
        .from(flags)
        .where(eq(flags.orderUniqueKey, orderUniqueKey))
        .limit(1);
      if (existing.length === 0) {
        return NextResponse.json(
          { success: false, error: "Đơn này chưa có cờ" },
          { status: 404 },
        );
      }
      if (existing[0].currentColor === null) {
        return NextResponse.json(
          { success: false, error: "Cờ đã được gỡ trước đó" },
          { status: 400 },
        );
      }

      await db
        .update(flags)
        .set({
          currentColor: null,
          resolvedAt: new Date(),
          resolvedBy: user.id,
        })
        .where(eq(flags.id, existing[0].id));

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
