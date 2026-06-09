import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryMovements } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

/**
 * GET /api/inventory/movements?warehouseCode=WEST&productId=dragon
 * Lịch sử biến động tồn của 1 (kho × product) — mới nhất trước, tối đa 100 dòng.
 */
export const GET = withAuth(
  async (req) => {
    try {
      const url = new URL(req.url);
      const warehouseCode = url.searchParams.get("warehouseCode");
      const productId = url.searchParams.get("productId");

      if (!warehouseCode || !productId) {
        return NextResponse.json(
          { success: false, error: "Thiếu warehouseCode / productId" },
          { status: 400 },
        );
      }

      const rows = await db
        .select({
          id: inventoryMovements.id,
          delta: inventoryMovements.delta,
          type: inventoryMovements.type,
          refOrderKey: inventoryMovements.refOrderKey,
          note: inventoryMovements.note,
          createdBy: inventoryMovements.createdBy,
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
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
