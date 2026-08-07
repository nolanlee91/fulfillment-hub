import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  warehouses,
  products,
  inventoryTracking,
} from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/my-inventory
 * Tồn kho cho tài khoản KHÁCH — chỉ trả product thuộc customerId của chính họ,
 * chỉ dòng đang tracked (read-only, không lộ threshold/khách khác).
 */
export const GET = withAuth(
  async (_req, user) => {
    try {
      if (!user.customerId) {
        return NextResponse.json({
          success: true,
          data: { warehouses: [], tracking: [] },
        });
      }

      const warehouseList = await db
        .select({
          code: warehouses.code,
          name: warehouses.name,
          region: warehouses.region,
        })
        .from(warehouses)
        .where(eq(warehouses.active, true))
        .orderBy(asc(warehouses.code));

      const tracking = await db
        .select({
          warehouseCode: inventoryTracking.warehouseCode,
          productId: inventoryTracking.productId,
          productName: products.name,
          trackedSince: inventoryTracking.trackedSince,
          onHand: inventoryTracking.onHand,
          updatedAt: inventoryTracking.updatedAt,
        })
        .from(inventoryTracking)
        .innerJoin(products, eq(products.id, inventoryTracking.productId))
        .where(
          and(
            eq(products.customerId, user.customerId),
            eq(inventoryTracking.tracked, true),
          ),
        )
        .orderBy(asc(inventoryTracking.warehouseCode), asc(products.name));

      return NextResponse.json({
        success: true,
        data: { warehouses: warehouseList, tracking },
      });
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
