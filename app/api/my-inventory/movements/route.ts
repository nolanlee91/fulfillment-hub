import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryMovements, products } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/my-inventory/movements?warehouseCode=WEST&productId=xxx
 * Lịch sử biến động tồn cho KHÁCH — chỉ xem được product thuộc customerId
 * của chính họ (check ownership trước khi query movements).
 */
export const GET = withAuth(
  async (req, user) => {
    try {
      const url = new URL(req.url);
      const warehouseCode = url.searchParams.get("warehouseCode");
      const productId = url.searchParams.get("productId");

      if (!warehouseCode || !productId) {
        return NextResponse.json(
          { success: false, error: "Missing warehouseCode / productId" },
          { status: 400 },
        );
      }

      const [product] = await db
        .select({ customerId: products.customerId })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);
      if (!product || !user.customerId || product.customerId !== user.customerId) {
        return NextResponse.json(
          { success: false, error: "Not found" },
          { status: 404 },
        );
      }

      const rows = await db
        .select({
          id: inventoryMovements.id,
          delta: inventoryMovements.delta,
          type: inventoryMovements.type,
          refOrderKey: inventoryMovements.refOrderKey,
          note: inventoryMovements.note,
          createdAt: inventoryMovements.createdAt,
        })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.warehouseCode, warehouseCode),
            eq(inventoryMovements.productId, productId),
          ),
        )
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(100);

      return NextResponse.json({ success: true, data: rows });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["CUSTOMER"] },
);
