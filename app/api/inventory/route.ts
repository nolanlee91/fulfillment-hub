import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  warehouses,
  products,
  inventoryTracking,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/inventory
 * Dữ liệu cho trang Tồn kho:
 *   - warehouses: danh sách kho (WEST/EAST)
 *   - products:   product đang active (để thêm mặt hàng theo dõi)
 *   - tracking:   các (kho × product) đang theo dõi + tồn hiện tại
 */
export const GET = withAuth(
  async () => {
    try {
      const warehouseList = await db
        .select({
          code: warehouses.code,
          name: warehouses.name,
          region: warehouses.region,
        })
        .from(warehouses)
        .where(eq(warehouses.active, true))
        .orderBy(asc(warehouses.code));

      const productList = await db
        .select({
          id: products.id,
          name: products.name,
          customerId: products.customerId,
        })
        .from(products)
        .where(eq(products.active, true))
        .orderBy(asc(products.customerId), asc(products.name));

      const tracking = await db
        .select({
          warehouseCode: inventoryTracking.warehouseCode,
          productId: inventoryTracking.productId,
          productName: products.name,
          customerId: products.customerId,
          tracked: inventoryTracking.tracked,
          trackedSince: inventoryTracking.trackedSince,
          onHand: inventoryTracking.onHand,
          lowStockThreshold: inventoryTracking.lowStockThreshold,
          updatedAt: inventoryTracking.updatedAt,
        })
        .from(inventoryTracking)
        .innerJoin(products, eq(products.id, inventoryTracking.productId))
        .orderBy(
          asc(inventoryTracking.warehouseCode),
          asc(products.customerId),
          asc(products.name),
        );

      return NextResponse.json({
        success: true,
        data: { warehouses: warehouseList, products: productList, tracking },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
