import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { inventoryTracking } from "@/lib/db/schema";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { trackingId } from "@/lib/inventory";

const TrackSchema = z.object({
  warehouseCode: z.string().min(1),
  productId: z.string().min(1),
  tracked: z.boolean().optional(),
  trackedSince: z.string().nullable().optional(), // ISO date hoặc null
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
});

/**
 * PUT /api/inventory/track
 * Bật/tắt theo dõi 1 mặt hàng ở 1 kho + đặt ngày bắt đầu theo dõi / ngưỡng cảnh báo.
 * Tạo mới (on_hand = 0) nếu chưa có. Không đụng tồn hiện có.
 */
export const PUT = withAuth(
  async (req) => {
    try {
      const body = await req.json();
      const p = TrackSchema.parse(body);

      const id = trackingId(p.warehouseCode, p.productId);
      const trackedSince =
        p.trackedSince === undefined
          ? undefined
          : p.trackedSince
            ? new Date(p.trackedSince)
            : null;
      const now = new Date();

      await db
        .insert(inventoryTracking)
        .values({
          id,
          warehouseCode: p.warehouseCode,
          productId: p.productId,
          tracked: p.tracked ?? true,
          trackedSince: trackedSince ?? null,
          lowStockThreshold: p.lowStockThreshold ?? null,
          onHand: 0,
        })
        .onConflictDoUpdate({
          target: inventoryTracking.id,
          set: {
            ...(p.tracked !== undefined ? { tracked: p.tracked } : {}),
            ...(trackedSince !== undefined ? { trackedSince } : {}),
            ...(p.lowStockThreshold !== undefined
              ? { lowStockThreshold: p.lowStockThreshold }
              : {}),
            updatedAt: now,
          },
        });

      return NextResponse.json({ success: true });
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
