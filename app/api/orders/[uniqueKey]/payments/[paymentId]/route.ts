import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderPayments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { deleteObject, keyFromPublicUrl } from "@/lib/storage/r2";
import { recomputeOrderReconSummary } from "@/lib/reconciliation/summary";

export const maxDuration = 60;

type Ctx = { params: Promise<{ uniqueKey: string; paymentId: string }> };

/**
 * POST /api/orders/[uniqueKey]/payments/[paymentId]
 * Body: { accounted: boolean } — book/unbook 1 KHOẢN thanh toán.
 * STAFF/SUPER_ADMIN only.
 */
export const POST = withAuth(
  async (req, user, { params }: Ctx) => {
    try {
      const { uniqueKey, paymentId } = await params;
      const body = await req.json().catch(() => ({}));
      const accounted = body?.accounted === true;

      const [payment] = await db
        .select({ id: orderPayments.id })
        .from(orderPayments)
        .where(
          and(
            eq(orderPayments.id, paymentId),
            eq(orderPayments.orderUniqueKey, uniqueKey),
          ),
        );

      if (!payment) {
        return NextResponse.json(
          { success: false, error: "Payment not found" },
          { status: 404 },
        );
      }

      const now = new Date();
      await db
        .update(orderPayments)
        .set({
          accountedAt: accounted ? now : null,
          accountedBy: accounted ? user.username : null,
        })
        .where(eq(orderPayments.id, paymentId));

      await recomputeOrderReconSummary(uniqueKey);

      return NextResponse.json({
        success: true,
        paymentId,
        accountedAt: accounted ? now.toISOString() : null,
        accountedBy: accounted ? user.username : null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["STAFF", "SUPER_ADMIN"] },
);

/**
 * DELETE /api/orders/[uniqueKey]/payments/[paymentId]
 * Xóa 1 khoản thanh toán (xóa cả object R2 nếu có ảnh chứng từ).
 * STAFF/SUPER_ADMIN only.
 */
export const DELETE = withAuth(
  async (_req, _user, { params }: Ctx) => {
    try {
      const { uniqueKey, paymentId } = await params;

      const [payment] = await db
        .select({ id: orderPayments.id, proofUrl: orderPayments.proofUrl })
        .from(orderPayments)
        .where(
          and(
            eq(orderPayments.id, paymentId),
            eq(orderPayments.orderUniqueKey, uniqueKey),
          ),
        );

      if (!payment) {
        return NextResponse.json(
          { success: false, error: "Payment not found" },
          { status: 404 },
        );
      }

      // Xóa object R2 nếu có (best-effort)
      if (payment.proofUrl) {
        const key = keyFromPublicUrl(payment.proofUrl);
        if (key) {
          try {
            await deleteObject(key);
          } catch (e) {
            console.error("R2 delete failed (continuing):", e);
          }
        }
      }

      await db.delete(orderPayments).where(eq(orderPayments.id, paymentId));
      await recomputeOrderReconSummary(uniqueKey);

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["STAFF", "SUPER_ADMIN"] },
);
