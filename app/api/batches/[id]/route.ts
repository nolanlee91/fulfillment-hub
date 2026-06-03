import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, batches } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DeleteBatchSchema = z.object({
  reason: z.string().trim().min(1, "Cần nhập lý do xóa batch"),
});

/**
 * DELETE: xóa (soft-delete) một batch.
 *  - CHỈ cho xóa khi TẤT CẢ đơn trong batch đang ở EXPORTED.
 *    Nếu có đơn đã đi xa hơn (LABEL_CREATED/IN_TRANSIT/DELIVERED/...) → báo lỗi, không xóa.
 *  - Khi hợp lệ: revert toàn bộ đơn về READY (batch_id = null) để tạo batch lại.
 *  - Batch row giữ lại (deleted_at/reason/by) để lưu lý do cho audit; ẩn khỏi list.
 */
export const DELETE = withAuth<RouteContext>(
  async (req, user, ctx) => {
    try {
      const { id: batchId } = await ctx.params;
      const body = await req.json().catch(() => ({}));
      const { reason } = DeleteBatchSchema.parse(body);

      const [batch] = await db
        .select({ id: batches.id, deletedAt: batches.deletedAt })
        .from(batches)
        .where(eq(batches.id, batchId));

      if (!batch) {
        return NextResponse.json(
          { success: false, error: "Batch không tồn tại" },
          { status: 404 },
        );
      }
      if (batch.deletedAt) {
        return NextResponse.json(
          { success: false, error: "Batch đã bị xóa trước đó" },
          { status: 400 },
        );
      }

      // Chặn xóa nếu còn đơn đã đi xa hơn EXPORTED (đã có label / đang giao / đã giao...).
      const [advancedRow] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.batchId, batchId), sql`${orders.status} <> 'EXPORTED'`));
      const advanced = advancedRow?.c ?? 0;
      if (advanced > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Không thể xóa: còn ${advanced} đơn đã đi xa hơn EXPORTED (đã có label / đang giao). Chỉ xóa được khi tất cả đơn đang ở trạng thái EXPORTED.`,
          },
          { status: 409 },
        );
      }

      const now = new Date();

      // Hợp lệ: revert toàn bộ đơn EXPORTED của batch về READY.
      const reverted = await db
        .update(orders)
        .set({ status: "READY", batchId: null, updatedAt: now })
        .where(and(eq(orders.batchId, batchId), eq(orders.status, "EXPORTED")))
        .returning({ uniqueKey: orders.uniqueKey });

      // Soft-delete batch (giữ lý do).
      await db
        .update(batches)
        .set({ deletedAt: now, deletedReason: reason, deletedBy: user.username })
        .where(eq(batches.id, batchId));

      return NextResponse.json({
        success: true,
        reverted: reverted.length,
        message: `Đã xóa batch ${batchId} — ${reverted.length} đơn về READY`,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { success: false, error: error.issues[0]?.message ?? "Dữ liệu không hợp lệ" },
          { status: 400 },
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
