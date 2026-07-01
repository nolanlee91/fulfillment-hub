import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderPayments } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { recomputeOrderReconSummary } from "@/lib/reconciliation/summary";

/**
 * POST /api/orders/[uniqueKey]/accounted
 * Body: { accounted: boolean } — book/unbook TẤT CẢ khoản của đơn (tiện lợi bulk).
 * Muốn book từng khoản riêng dùng /payments/[paymentId].
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
      if (accounted) {
        // Book mọi khoản CHƯA booked (giữ nguyên khoản đã book trước đó)
        await db
          .update(orderPayments)
          .set({ accountedAt: now, accountedBy: user.username })
          .where(
            and(
              eq(orderPayments.orderUniqueKey, uniqueKey),
              isNull(orderPayments.accountedAt),
            ),
          );
      } else {
        // Unbook tất cả
        await db
          .update(orderPayments)
          .set({ accountedAt: null, accountedBy: null })
          .where(eq(orderPayments.orderUniqueKey, uniqueKey));
      }

      await recomputeOrderReconSummary(uniqueKey);

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
