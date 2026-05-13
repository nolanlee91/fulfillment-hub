import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flags, orders } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/flags/counts
 *  → { red, yellow, resolved }
 * CUSTOMER tự động filter customerId.
 */
export const GET = withAuth(async (_req, user) => {
  try {
    const conditions = [];
    if (user.role === "CUSTOMER") {
      if (!user.customerId) {
        return NextResponse.json(
          {
            success: false,
            error: "Tài khoản chưa được gán khách hàng — liên hệ quản trị viên",
          },
          { status: 500 },
        );
      }
      conditions.push(eq(orders.customerId, user.customerId));
    }

    const rows = await db
      .select({
        color: flags.currentColor,
        count: sql<number>`count(*)::int`,
      })
      .from(flags)
      .innerJoin(orders, eq(flags.orderUniqueKey, orders.uniqueKey))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(flags.currentColor);

    let red = 0;
    let yellow = 0;
    let resolved = 0;
    for (const row of rows) {
      if (row.color === "red") red = row.count;
      else if (row.color === "yellow") yellow = row.count;
      else resolved = row.count;
    }

    return NextResponse.json({
      success: true,
      data: { red, yellow, resolved },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
});
