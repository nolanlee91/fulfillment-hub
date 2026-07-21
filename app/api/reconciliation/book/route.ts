import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderPayments } from "@/lib/db/schema";
import { and, inArray, isNull } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { recomputeOrderReconSummary } from "@/lib/reconciliation/summary";

export const maxDuration = 60;

/**
 * POST /api/reconciliation/book
 * Body: { paymentIds: string[] } — book (hạch toán) HÀNG LOẠT nhiều KHOẢN cùng lúc.
 *
 * Chỉ book khoản CHƯA book (accountedAt null); khoản đã book bỏ qua (idempotent,
 * không đè người/ngày book cũ). Recompute summary mức đơn cho từng đơn bị ảnh hưởng.
 * STAFF/SUPER_ADMIN only.
 */
export const POST = withAuth(
  async (req, user) => {
    try {
      const body = await req.json().catch(() => ({}));
      const ids: string[] = Array.isArray(body?.paymentIds)
        ? Array.from(
            new Set(
              body.paymentIds
                .map((x: unknown) => String(x ?? "").trim())
                .filter((x: string) => x.length > 0),
            ),
          )
        : [];
      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: "paymentIds must be a non-empty string[]" },
          { status: 400 },
        );
      }

      const pays = await db
        .select({
          id: orderPayments.id,
          orderUniqueKey: orderPayments.orderUniqueKey,
          accountedAt: orderPayments.accountedAt,
        })
        .from(orderPayments)
        .where(inArray(orderPayments.id, ids));

      const foundIds = new Set(pays.map((p) => p.id));
      const notFound = ids.filter((id) => !foundIds.has(id));
      const toBook = pays.filter((p) => p.accountedAt === null);
      const alreadyBooked = pays.length - toBook.length;

      const now = new Date();
      if (toBook.length > 0) {
        await db
          .update(orderPayments)
          .set({ accountedAt: now, accountedBy: user.username })
          .where(
            and(
              inArray(
                orderPayments.id,
                toBook.map((p) => p.id),
              ),
              isNull(orderPayments.accountedAt), // guard chống race: chỉ khoản còn chưa book
            ),
          );
        // Đồng bộ summary mức đơn (accountedAt đơn = set khi MỌI khoản đã book).
        const keys = Array.from(new Set(toBook.map((p) => p.orderUniqueKey)));
        for (const k of keys) await recomputeOrderReconSummary(k);
      }

      return NextResponse.json({
        success: true,
        booked: toBook.length,
        alreadyBooked,
        notFound: notFound.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Bulk book error:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["STAFF", "SUPER_ADMIN"] },
);
