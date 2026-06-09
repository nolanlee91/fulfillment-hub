import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, customers, products } from "@/lib/db/schema";
import { eq, and, or, sql, desc, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { isRegion } from "@/lib/geo/province";
import { orderWarehouse, type WarehouseCode } from "@/lib/inventory";
import { computeWarehouseMap } from "@/lib/inventory/routing";

const DeleteOrdersSchema = z.object({
  uniqueKeys: z.array(z.string()).min(1),
});

export const GET = withAuth(async (req, user) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // READY | ERROR | NEW | EXPORTED
    const customerId = searchParams.get("customer");
    const productId = searchParams.get("product");
    const payment = searchParams.get("payment"); // PREPAID | COD
    const attention = searchParams.get("attention"); // ADDRESS_ERROR | DELAYED | NOTICE_CARD | STUCK | "any"
    const reconciled = searchParams.get("reconciled"); // "yes" | "no" | null
    const accounted = searchParams.get("accounted"); // "yes" | "no" | null (hạch toán)
    const region = searchParams.get("region"); // WEST | EAST | UNKNOWN | null
    const excludeTerminal = searchParams.get("excludeTerminal") === "true";
    const search = searchParams.get("search");

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
    } else if (customerId) {
      conditions.push(eq(orders.customerId, customerId));
    }

    if (excludeTerminal) {
      conditions.push(ne(orders.status, "DELIVERED"));
      conditions.push(ne(orders.status, "FAILED"));
    }
    if (status) {
      const statusList = status.split(",") as Array<"READY" | "ERROR" | "ERROR_UPDATED" | "NEW" | "EXPORTED" | "LABEL_CREATED">;
      if (statusList.length === 1) {
        conditions.push(eq(orders.status, statusList[0]));
      } else {
        conditions.push(or(...statusList.map((s) => eq(orders.status, s)))!);
      }
    }
    if (productId) conditions.push(eq(orders.productId, productId));
    if (payment === "PREPAID" || payment === "COD") {
      conditions.push(eq(orders.paymentMethod, payment));
    }
    if (attention) {
      if (attention === "any") {
        conditions.push(sql`${orders.attentionReason} IS NOT NULL`);
      } else if (
        attention === "ADDRESS_ERROR" ||
        attention === "DELAYED" ||
        attention === "NOTICE_CARD" ||
        attention === "STUCK"
      ) {
        conditions.push(eq(orders.attentionReason, attention));
      }
    }
    if (reconciled === "yes") {
      conditions.push(sql`${orders.reconciledAt} IS NOT NULL`);
    } else if (reconciled === "no") {
      conditions.push(sql`${orders.reconciledAt} IS NULL`);
    }
    if (accounted === "yes") {
      conditions.push(sql`${orders.accountedAt} IS NOT NULL`);
    } else if (accounted === "no") {
      conditions.push(sql`${orders.accountedAt} IS NULL`);
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
        addressLine1: orders.addressLine1,
        city: orders.city,
        province: orders.province,
        zipcode: orders.zipcode,
        country: orders.country,
        phone: orders.phone,
        quantity: orders.quantity,
        paymentMethod: orders.paymentMethod,
        codAmount: orders.codAmount,
        note: orders.note,
        status: orders.status,
        boxCode: orders.boxCode,
        warehouseCode: orders.warehouseCode,
        errorNote: orders.errorNote,
        batchId: orders.batchId,
        trackingNumber: orders.trackingNumber,
        trackingUrl: orders.trackingUrl,
        deliveredAt: orders.deliveredAt,
        lastTrackingEvent: orders.lastTrackingEvent,
        lastTrackingAt: orders.lastTrackingAt,
        attentionReason: orders.attentionReason,
        attentionAt: orders.attentionAt,
        attentionNote: orders.attentionNote,
        paymentType: orders.paymentType,
        refNumber: orders.refNumber,
        paymentProofUrl: orders.paymentProofUrl,
        reconciledAt: orders.reconciledAt,
        accountedAt: orders.accountedAt,
        accountedBy: orders.accountedBy,
      })
      .from(orders)
      .leftJoin(products, eq(orders.productId, products.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      // Tiebreaker uniqueKey để sort stable — nhiều đơn cùng 1 batch sync có cùng syncedAt,
      // không có tiebreaker thì PostgreSQL trả về thứ tự không deterministic sau UPDATE.
      .orderBy(desc(orders.syncedAt), desc(orders.uniqueKey))
      .limit(500);

    // Gán kho đóng cho từng đơn: ưu tiên kho đã lưu (đơn đã chốt), với đơn chưa
    // chốt thì dùng định tuyến có nhìn tồn kho (region + tồn kho E). Trả về để UI
    // hiện badge, đồng thời lọc theo bộ lọc "Warehouse" (param region: WEST|EAST).
    const isStaff = user.role !== "CUSTOMER";
    const whMap = isStaff ? await computeWarehouseMap() : new Map<string, WarehouseCode>();
    const rowWarehouse = (r: (typeof rows)[number]): WarehouseCode => {
      if (r.warehouseCode === "EAST" || r.warehouseCode === "WEST") return r.warehouseCode;
      return whMap.get(r.uniqueKey) ?? orderWarehouse(r.province, r.country);
    };

    const withWarehouse = rows.map((r) => ({ ...r, warehouse: rowWarehouse(r) }));
    const data = isRegion(region)
      ? withWarehouse.filter((r) => r.warehouse === region)
      : withWarehouse;

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
});

export const POST = withAuth(async (_req, user) => {
  // Get distinct customers + products for filters
  try {
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
      const customerList = await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.active, true), eq(customers.id, user.customerId)));

      const productList = await db
        .select({ id: products.id, name: products.name, customerId: products.customerId })
        .from(products)
        .where(and(eq(products.active, true), eq(products.customerId, user.customerId)));

      return NextResponse.json({
        success: true,
        data: { customers: customerList, products: productList },
      });
    }

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
});

/**
 * DELETE: bulk xóa đơn theo uniqueKeys.
 * Cho xóa mọi status. Giữ nguyên batches.totalOrders (snapshot lịch sử).
 */
export const DELETE = withAuth(
  async (req) => {
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
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
