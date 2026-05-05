import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, customers, products } from "@/lib/db/schema";
import { eq, and, or, sql, desc, inArray } from "drizzle-orm";
import { z } from "zod";

const DeleteOrdersSchema = z.object({
  uniqueKeys: z.array(z.string()).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // READY | ERROR | NEW | EXPORTED
    const customerId = searchParams.get("customer");
    const productId = searchParams.get("product");
    const payment = searchParams.get("payment"); // PREPAID | COD
    const search = searchParams.get("search");

    const conditions = [];
    if (status) {
      const statusList = status.split(",") as Array<"READY" | "ERROR" | "ERROR_UPDATED" | "NEW" | "EXPORTED" | "LABEL_CREATED">;
      if (statusList.length === 1) {
        conditions.push(eq(orders.status, statusList[0]));
      } else {
        conditions.push(or(...statusList.map((s) => eq(orders.status, s)))!);
      }
    }
    if (customerId) conditions.push(eq(orders.customerId, customerId));
    if (productId) conditions.push(eq(orders.productId, productId));
    if (payment === "PREPAID" || payment === "COD") {
      conditions.push(eq(orders.paymentMethod, payment));
    }
    if (search) {
      const s = `%${search.toLowerCase()}%`;
      conditions.push(
        or(
          sql`lower(${orders.orderId}) like ${s}`,
          sql`lower(${orders.name}) like ${s}`,
          sql`lower(${orders.phone}) like ${s}`,
          sql`lower(${orders.zipcode}) like ${s}`,
        ),
      );
    }

    const rows = await db
      .select({
        uniqueKey: orders.uniqueKey,
        orderId: orders.orderId,
        customerId: orders.customerId,
        productId: orders.productId,
        productName: products.name,
        orderDate: orders.orderDate,
        name: orders.name,
        city: orders.city,
        zipcode: orders.zipcode,
        phone: orders.phone,
        quantity: orders.quantity,
        paymentMethod: orders.paymentMethod,
        codAmount: orders.codAmount,
        note: orders.note,
        status: orders.status,
        boxCode: orders.boxCode,
        errorNote: orders.errorNote,
        batchId: orders.batchId,
      })
      .from(orders)
      .leftJoin(products, eq(orders.productId, products.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.syncedAt))
      .limit(500);

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function POST() {
  // Get distinct customers + products for filters
  try {
    const customerList = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.active, true));

    const productList = await db
      .select({ id: products.id, name: products.name, customerId: products.customerId })
      .from(products)
      .where(eq(products.active, true));

    return NextResponse.json({
      success: true,
      data: { customers: customerList, products: productList },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * DELETE: bulk xóa đơn theo uniqueKeys.
 * Cho xóa mọi status. Giữ nguyên batches.totalOrders (snapshot lịch sử).
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { uniqueKeys } = DeleteOrdersSchema.parse(body);

    const deleted = await db
      .delete(orders)
      .where(inArray(orders.uniqueKey, uniqueKeys))
      .returning({ uniqueKey: orders.uniqueKey });

    return NextResponse.json({
      success: true,
      deleted: deleted.length,
      message: `Đã xóa ${deleted.length} đơn`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
