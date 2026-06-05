import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * POST /api/orders/[uniqueKey]/accounted
 * Body: { accounted: boolean } — đánh dấu đơn đã/chưa hạch toán (ghi sổ).
 * STAFF/SUPER_ADMIN only.
 */
export const POST = withAuth(
  async (req, user, { params }: { params: Promise<{ uniqueKey: string }> }) => {
    try {
      const { uniqueKey } = await params;
      const body = await req.json().catch(() => ({}));
      const accounted = body?.accounted === true;

      const [order] = await db
        .select({ uniqueKey: orders.uniqueKey })
        .from(orders)
        .where(eq(orders.uniqueKey, uniqueKey));

      if (!order) {
        return NextResponse.json(
          { success: false, error: "Order not found" },
          { status: 404 },
        );
      }

      const now = new Date();
      await db
        .update(orders)
        .set({
          accountedAt: accounted ? now : null,
          accountedBy: accounted ? user.username : null,
          updatedAt: now,
        })
        .where(eq(orders.uniqueKey, uniqueKey));

      return NextResponse.json({
        success: true,
        accountedAt: accounted ? now.toISOString() : null,
        accountedBy: accounted ? user.username : null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["STAFF", "SUPER_ADMIN"] },
);
