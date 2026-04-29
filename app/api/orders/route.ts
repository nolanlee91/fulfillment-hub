import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, customers, products, boxes } from "@/lib/db/schema";
import { eq, and, or, like, sql, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // READY | ERROR | NEW | EXPORTED
    const customerId = searchParams.get("customer");
    const productId = searchParams.get("product");
    const search = searchParams.get("search");

    const conditions = [];
    if (status) conditions.push(eq(orders.status, status as "READY" | "ERROR" | "NEW" | "EXPORTED"));
    if (customerId) conditions.push(eq(orders.customerId, customerId));
    if (productId) conditions.push(eq(orders.productId, productId));
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
