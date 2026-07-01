import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderPayments } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/orders/[uniqueKey]/payments
 * Danh sách khoản thanh toán của 1 đơn (drawer lazy-fetch khi mở).
 * CUSTOMER: chỉ đơn của customer mình. STAFF/SUPER_ADMIN: mọi đơn.
 */
export const GET = withAuth(
  async (_req, user, { params }: { params: Promise<{ uniqueKey: string }> }) => {
    try {
      const { uniqueKey } = await params;

      // Verify quyền xem đơn
      const [order] = await db
        .select({ uniqueKey: orders.uniqueKey, customerId: orders.customerId })
        .from(orders)
        .where(eq(orders.uniqueKey, uniqueKey));

      if (!order) {
        return NextResponse.json(
          { success: false, error: "Order not found" },
          { status: 404 },
        );
      }
      if (user.role === "CUSTOMER" && order.customerId !== user.customerId) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      const payments = await db
        .select({
          id: orderPayments.id,
          paymentType: orderPayments.paymentType,
          refNumber: orderPayments.refNumber,
          proofUrl: orderPayments.proofUrl,
          reconciledAt: orderPayments.reconciledAt,
          accountedAt: orderPayments.accountedAt,
          accountedBy: orderPayments.accountedBy,
          createdAt: orderPayments.createdAt,
        })
        .from(orderPayments)
        .where(eq(orderPayments.orderUniqueKey, uniqueKey))
        .orderBy(asc(orderPayments.createdAt));

      const bookedCount = payments.filter((p) => p.accountedAt !== null).length;

      return NextResponse.json({
        success: true,
        payments,
        total: payments.length,
        bookedCount,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
);
