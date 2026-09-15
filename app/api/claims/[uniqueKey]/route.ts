import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

const PatchSchema = z.object({
  // null = gỡ đánh dấu, quay về "chưa nộp"
  claimStatus: z.enum(["FILED", "APPROVED", "REJECTED"]).nullable(),
  claimAmount: z.union([z.number(), z.string()]).nullable().optional(),
  claimNote: z.string().max(500).nullable().optional(),
});

/**
 * PATCH /api/claims/[uniqueKey]
 * Body: { claimStatus, claimAmount?, claimNote? }
 *
 * Đánh dấu tiến trình claim của 1 đơn. STAFF/SUPER_ADMIN.
 */
export const PATCH = withAuth(
  async (req, user, { params }: { params: Promise<{ uniqueKey: string }> }) => {
    try {
      const { uniqueKey } = await params;
      const body = await req.json().catch(() => null);
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" },
          { status: 400 },
        );
      }
      const { claimStatus, claimAmount, claimNote } = parsed.data;

      const [o] = await db
        .select({ uniqueKey: orders.uniqueKey, orderId: orders.orderId, claimFiledAt: orders.claimFiledAt })
        .from(orders)
        .where(eq(orders.uniqueKey, uniqueKey));
      if (!o) {
        return NextResponse.json({ success: false, error: "Không tìm thấy đơn" }, { status: 404 });
      }

      const update: Record<string, unknown> = {
        claimStatus,
        updatedAt: new Date(),
      };

      // Giữ nguyên mốc nộp lần đầu; gỡ hẳn về "chưa nộp" thì xoá.
      if (claimStatus === null) {
        update.claimFiledAt = null;
        update.claimAmount = null;
      } else if (!o.claimFiledAt) {
        update.claimFiledAt = new Date();
      }

      if (claimAmount !== undefined) {
        update.claimAmount = claimAmount === null ? null : String(claimAmount);
      }
      if (claimNote !== undefined) update.claimNote = claimNote;

      await db.update(orders).set(update).where(eq(orders.uniqueKey, uniqueKey));

      return NextResponse.json({
        success: true,
        message: `${o.orderId}: ${claimStatus ? `đánh dấu ${claimStatus}` : "gỡ về chưa nộp"} (${user.username}).`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("claims PATCH error:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
