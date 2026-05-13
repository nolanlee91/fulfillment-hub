import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { flags, orders, customers, products } from "@/lib/db/schema";
import { eq, and, or, desc, isNull } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/flags?status=red,yellow,resolved&customer=<id>
 *
 * List đơn gắn cờ. CUSTOMER tự động filter customerId.
 *  - status: csv của 'red' | 'yellow' | 'resolved'. Mặc định trả về cả 3.
 *  - customer: filter theo customerId (chỉ STAFF + SUPER_ADMIN).
 */
export const GET = withAuth(async (req, user) => {
  try {
    const { searchParams } = new URL(req.url);
    const statusRaw = searchParams.get("status");
    const customerFilter = searchParams.get("customer");

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
    } else if (customerFilter) {
      conditions.push(eq(orders.customerId, customerFilter));
    }

    if (statusRaw) {
      const statusList = statusRaw.split(",").map((s) => s.trim());
      const orConds = [];
      if (statusList.includes("red")) orConds.push(eq(flags.currentColor, "red"));
      if (statusList.includes("yellow")) orConds.push(eq(flags.currentColor, "yellow"));
      if (statusList.includes("resolved")) orConds.push(isNull(flags.currentColor));
      if (orConds.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }
      conditions.push(or(...orConds)!);
    }

    const rows = await db
      .select({
        flagId: flags.id,
        orderUniqueKey: flags.orderUniqueKey,
        orderId: orders.orderId,
        customerId: orders.customerId,
        customerName: customers.name,
        productId: orders.productId,
        productName: products.name,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
        currentColor: flags.currentColor,
        resolvedAt: flags.resolvedAt,
        lastMessageAt: flags.lastMessageAt,
        createdAt: flags.createdAt,
      })
      .from(flags)
      .innerJoin(orders, eq(flags.orderUniqueKey, orders.uniqueKey))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(products, eq(orders.productId, products.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(flags.lastMessageAt))
      .limit(500);

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
});

