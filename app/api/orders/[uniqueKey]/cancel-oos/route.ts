import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { writeSheetFields } from "@/lib/sync/write-back";

const OOS_NOTE = "hết hàng";

/**
 * POST /api/orders/[uniqueKey]/cancel-oos
 * Huỷ đơn ở tab "Hết hàng": chuyển status FAILED + ghi "hết hàng" vào cột Tracking
 * Number & Tracking URL trên sheet khách. KHÔNG cộng/trừ tồn (đơn chưa từng tạo
 * label nên chưa đụng tồn). Chỉ áp cho đơn đang OUT_OF_STOCK. STAFF/SUPER_ADMIN.
 */
export const POST = withAuth(
  async (_req, user, { params }: { params: Promise<{ uniqueKey: string }> }) => {
    try {
      const { uniqueKey } = await params;
      const [o] = await db
        .select({ status: orders.status, orderId: orders.orderId })
        .from(orders)
        .where(eq(orders.uniqueKey, uniqueKey));
      if (!o) {
        return NextResponse.json(
          { success: false, error: "Order not found" },
          { status: 404 },
        );
      }
      if (o.status !== "OUT_OF_STOCK") {
        return NextResponse.json(
          { success: false, error: `Đơn không ở trạng thái Hết hàng (đang ${o.status})` },
          { status: 400 },
        );
      }

      // 1) Ghi "hết hàng" lên sheet (tracking number + url).
      const sheet = await writeSheetFields(uniqueKey, {
        trackingNumber: OOS_NOTE,
        trackingUrl: OOS_NOTE,
      });

      // 2) Chuyển đơn sang Thất bại.
      await db
        .update(orders)
        .set({
          status: "FAILED",
          lastTrackingEvent: "Huỷ - hết hàng",
          lastTrackingAt: new Date(),
          errorNote: `Huỷ do hết hàng (${user.username})`,
          updatedAt: new Date(),
        })
        .where(eq(orders.uniqueKey, uniqueKey));

      return NextResponse.json({
        success: true,
        sheetOk: sheet.ok,
        message: sheet.ok
          ? `${o.orderId}: đã huỷ (hết hàng) và ghi lên sheet.`
          : `${o.orderId}: đã huỷ (hết hàng); ghi sheet lỗi (${sheet.reason ?? "?"}).`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("cancel-oos error:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
