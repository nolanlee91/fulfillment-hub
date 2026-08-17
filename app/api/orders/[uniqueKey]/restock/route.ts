import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { restockOrder } from "@/lib/inventory";
import { writeSheetFields } from "@/lib/sync/write-back";

const CANCEL_NOTE = "Hủy trước khi pick up";

/**
 * POST /api/orders/[uniqueKey]/restock
 * Body: { mode: "RETURN" | "CANCEL_PICKUP" }
 *
 * Cộng LẠI tồn kho cho đơn không giao được (đảo đúng phần đã trừ; đơn chưa từng
 * trừ thì không cộng gì → không tạo tồn ảo).
 *   - RETURN        : hàng hoàn về (đơn FAILED). Chỉ cộng lại tồn.
 *   - CANCEL_PICKUP : huỷ trước khi carrier pickup (đơn LABEL_CREATED). Cộng lại
 *                     tồn + đổi status FAILED + ghi "Hủy trước khi pick up" vào cột
 *                     Tracking URL trên sheet khách.
 * STAFF/SUPER_ADMIN.
 */
export const POST = withAuth(
  async (req, user, { params }: { params: Promise<{ uniqueKey: string }> }) => {
    try {
      const { uniqueKey } = await params;
      const body = await req.json().catch(() => ({}));
      const mode = body?.mode;
      if (mode !== "RETURN" && mode !== "CANCEL_PICKUP") {
        return NextResponse.json(
          { success: false, error: "mode phải là RETURN hoặc CANCEL_PICKUP" },
          { status: 400 },
        );
      }

      const [o] = await db
        .select({
          uniqueKey: orders.uniqueKey,
          status: orders.status,
          orderId: orders.orderId,
        })
        .from(orders)
        .where(eq(orders.uniqueKey, uniqueKey));
      if (!o) {
        return NextResponse.json(
          { success: false, error: "Order not found" },
          { status: 404 },
        );
      }

      const note =
        mode === "RETURN"
          ? `Hoàn kho: hàng trả về (${user.username})`
          : `Hoàn kho: huỷ trước pickup (${user.username})`;

      // 1) Cộng lại tồn (đảo ORDER_OUT). Idempotent.
      const res = await restockOrder(uniqueKey, note, user.username);

      // 2) CANCEL_PICKUP: đổi trạng thái + ghi ngược sheet.
      let sheet: { ok: boolean; reason?: string } | null = null;
      if (mode === "CANCEL_PICKUP") {
        await db
          .update(orders)
          .set({
            // CANCELLED (huỷ), KHÔNG phải FAILED — FAILED chỉ dành cho hàng bị return.
            status: "CANCELLED",
            lastTrackingEvent: CANCEL_NOTE,
            lastTrackingAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.uniqueKey, uniqueKey));
        sheet = await writeSheetFields(uniqueKey, { trackingUrl: CANCEL_NOTE });
      }

      const parts: string[] = [];
      if (res.restocked > 0) parts.push(`cộng lại ${res.addedBack} vào tồn kho`);
      else if (res.alreadyDone) parts.push("đã cộng lại tồn trước đó");
      else parts.push("đơn chưa từng bị trừ tồn nên không cộng lại");
      if (mode === "CANCEL_PICKUP") {
        parts.push(
          sheet?.ok
            ? 'đã ghi "Hủy trước khi pick up" lên sheet'
            : `ghi sheet lỗi (${sheet?.reason ?? "?"})`,
        );
      }

      return NextResponse.json({
        success: true,
        mode,
        restocked: res.restocked,
        addedBack: res.addedBack,
        alreadyDone: res.alreadyDone,
        sheetOk: sheet?.ok ?? null,
        message: `${o.orderId}: ${parts.join("; ")}.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("restock error:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
