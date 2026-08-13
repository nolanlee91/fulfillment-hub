import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderPayments } from "@/lib/db/schema";
import { and, inArray, isNull } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { recomputeOrderReconSummary } from "@/lib/reconciliation/summary";

export const maxDuration = 60;

/**
 * POST /api/orders/accounted-bulk
 * Body: { uniqueKeys: string[] } — hạch toán (book) HÀNG LOẠT mọi khoản CHƯA book
 * của các đơn này (tiện book cả list đã lọc thay vì tick từng đơn).
 *
 * Idempotent: chỉ đụng khoản accountedAt null; khoản đã book giữ nguyên người/ngày.
 * Recompute summary mức đơn cho từng đơn bị ảnh hưởng. STAFF/SUPER_ADMIN.
 */
export const POST = withAuth(
  async (req, user) => {
    try {
      const body = await req.json().catch(() => ({}));
      const keys: string[] = Array.isArray(body?.uniqueKeys)
        ? Array.from(
            new Set(
              body.uniqueKeys
                .map((x: unknown) => String(x ?? "").trim())
                .filter((x: string) => x.length > 0),
            ),
          )
        : [];
      if (keys.length === 0) {
        return NextResponse.json(
          { success: false, error: "uniqueKeys must be a non-empty string[]" },
          { status: 400 },
        );
      }

      // Các khoản CHƯA book của những đơn này.
      const unbooked = await db
        .select({ id: orderPayments.id, key: orderPayments.orderUniqueKey })
        .from(orderPayments)
        .where(
          and(
            inArray(orderPayments.orderUniqueKey, keys),
            isNull(orderPayments.accountedAt),
          ),
        );

      const now = new Date();
      const affectedKeys = Array.from(new Set(unbooked.map((p) => p.key)));
      if (unbooked.length > 0) {
        await db
          .update(orderPayments)
          .set({ accountedAt: now, accountedBy: user.username })
          .where(
            and(
              inArray(orderPayments.orderUniqueKey, keys),
              isNull(orderPayments.accountedAt), // guard race
            ),
          );
        for (const k of affectedKeys) await recomputeOrderReconSummary(k);
      }

      return NextResponse.json({
        success: true,
        booked: unbooked.length,
        orders: affectedKeys.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("accounted-bulk error:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["STAFF", "SUPER_ADMIN"] },
);
