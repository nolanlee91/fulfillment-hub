import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, customers, orderPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

export const maxDuration = 30;

/**
 * POST /api/reconciliation/lookup-refs
 * Body: { refNumbers: string[] }
 *
 * Kế toán paste list ref number (HOẶC Mã đơn) từ email noti → app trả về:
 *  - matched: khớp theo REF (ETF), theo MÃ ĐƠN, hoặc theo TRACKING NUMBER (đơn đã
 *    đối soát, kể cả non-ETF không có ref). `matchBy` = "REF" | "ORDER" | "TRACKING".
 *  - unmatched: token không phải ref, không phải mã đơn/tracking đã đối soát
 *    (khách chưa upload, hoặc gõ sai).
 *
 * STAFF/SUPER_ADMIN only.
 */
export const POST = withAuth(
  async (req) => {
    try {
      const body = await req.json();
      const rawRefs = body?.refNumbers;
      if (!Array.isArray(rawRefs)) {
        return NextResponse.json(
          { success: false, error: "refNumbers must be a string[]" },
          { status: 400 },
        );
      }

      // Normalize + dedup
      const refs = Array.from(
        new Set(
          rawRefs
            .map((r) => String(r ?? "").trim())
            .filter((r) => r.length > 0),
        ),
      );

      if (refs.length === 0) {
        return NextResponse.json({
          success: true,
          totalInput: 0,
          matched: [],
          unmatched: [],
        });
      }

      // Cột chung cho cả 2 kiểu khớp (theo ref / theo mã đơn).
      const selectCols = {
        paymentId: orderPayments.id,
        refNumber: orderPayments.refNumber,
        orderId: orders.orderId,
        trackingNumber: orders.trackingNumber,
        uniqueKey: orders.uniqueKey,
        customerId: orders.customerId,
        customerName: customers.name,
        name: orders.name,
        quantity: orders.quantity,
        paymentMethod: orders.paymentMethod,
        paymentType: orderPayments.paymentType,
        codAmount: orders.codAmount,
        reconciledAt: orderPayments.reconciledAt,
        accountedAt: orderPayments.accountedAt,
        status: orders.status,
      };

      // 1. Khớp theo REF NUMBER (ETF). Mỗi khoản ETF 1 dòng.
      const refRows = await db
        .select(selectCols)
        .from(orderPayments)
        .innerJoin(orders, eq(orderPayments.orderUniqueKey, orders.uniqueKey))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(inArray(orderPayments.refNumber, refs));

      const matchedRefs = new Set(
        refRows.map((r) => r.refNumber).filter((r): r is string => !!r),
      );
      const remaining = refs.filter((r) => !matchedRefs.has(r));

      // 2. Token còn lại: thử coi như MÃ ĐƠN đã đối soát (kể cả non-ETF, refNumber=null).
      //    innerJoin orderPayments → chỉ đơn ĐÃ có khoản đối soát mới ra.
      let orderRows: typeof refRows = [];
      if (remaining.length > 0) {
        orderRows = await db
          .select(selectCols)
          .from(orders)
          .innerJoin(orderPayments, eq(orderPayments.orderUniqueKey, orders.uniqueKey))
          .leftJoin(customers, eq(orders.customerId, customers.id))
          .where(inArray(orders.orderId, remaining));
      }
      const matchedOrderIds = new Set(orderRows.map((r) => r.orderId));

      // 3. Token còn lại: thử coi như TRACKING NUMBER của đơn đã đối soát.
      const remainingAfterOrder = remaining.filter((r) => !matchedOrderIds.has(r));
      let trackingRows: typeof refRows = [];
      if (remainingAfterOrder.length > 0) {
        trackingRows = await db
          .select(selectCols)
          .from(orders)
          .innerJoin(orderPayments, eq(orderPayments.orderUniqueKey, orders.uniqueKey))
          .leftJoin(customers, eq(orders.customerId, customers.id))
          .where(inArray(orders.trackingNumber, remainingAfterOrder));
      }
      const matchedTrackings = new Set(
        trackingRows.map((r) => r.trackingNumber).filter((t): t is string => !!t),
      );

      // 4. Không phải ref, mã đơn, hay tracking đã đối soát → thật sự không tìm thấy.
      const unmatched = remainingAfterOrder.filter((r) => !matchedTrackings.has(r));

      const matched = [
        ...refRows.map((r) => ({ ...r, matchBy: "REF" as const })),
        ...orderRows.map((r) => ({ ...r, matchBy: "ORDER" as const })),
        ...trackingRows.map((r) => ({ ...r, matchBy: "TRACKING" as const })),
      ];

      return NextResponse.json({
        success: true,
        totalInput: refs.length,
        matched,
        unmatched,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Lookup refs error:", error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
