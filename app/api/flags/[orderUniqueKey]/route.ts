import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flags, flagMessages, orders, customers, products } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

interface RouteContext {
  params: Promise<{ orderUniqueKey: string }>;
}

/**
 * GET /api/flags/[orderUniqueKey]
 *  → { order, flag, messages }
 *
 * Trả về order info kể cả khi chưa có flag (UI cần hiển thị header).
 * CUSTOMER: 403 nếu order không thuộc customerId của họ.
 */
export const GET = withAuth<RouteContext>(async (_req, user, ctx) => {
  try {
    const { orderUniqueKey } = await ctx.params;

    const orderRows = await db
      .select({
        uniqueKey: orders.uniqueKey,
        orderId: orders.orderId,
        customerId: orders.customerId,
        customerName: customers.name,
        productId: orders.productId,
        productName: products.name,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
      })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .where(eq(orders.uniqueKey, orderUniqueKey))
      .limit(1);

    if (orderRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy đơn" },
        { status: 404 },
      );
    }
    const order = orderRows[0];

    if (user.role === "CUSTOMER") {
      if (!user.customerId || order.customerId !== user.customerId) {
        return NextResponse.json(
          { success: false, error: "Không có quyền truy cập đơn này" },
          { status: 403 },
        );
      }
    }

    const flagRows = await db
      .select({
        id: flags.id,
        currentColor: flags.currentColor,
        resolvedAt: flags.resolvedAt,
        createdAt: flags.createdAt,
        lastMessageAt: flags.lastMessageAt,
      })
      .from(flags)
      .where(eq(flags.orderUniqueKey, orderUniqueKey))
      .limit(1);

    const flag = flagRows[0] ?? null;

    let messages: Array<{
      id: string;
      userId: string;
      userRole: string;
      userName: string;
      content: string;
      createdAt: Date;
    }> = [];
    if (flag) {
      messages = await db
        .select({
          id: flagMessages.id,
          userId: flagMessages.userId,
          userRole: flagMessages.userRole,
          userName: flagMessages.userName,
          content: flagMessages.content,
          createdAt: flagMessages.createdAt,
        })
        .from(flagMessages)
        .where(eq(flagMessages.flagId, flag.id))
        .orderBy(asc(flagMessages.createdAt));
    }

    return NextResponse.json({
      success: true,
      data: { order, flag, messages },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
});
