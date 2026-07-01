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
 * Kế toán paste list ref number từ email noti → app trả về:
 *  - matched: list đơn đã có ref khớp (kèm customer info, ngày reconciled)
 *  - unmatched: list ref không tìm thấy đơn nào (customer chưa upload, hoặc ref sai)
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

      // Query order_payments (per-khoản) join orders + customer name.
      // Mỗi khoản ETF là 1 dòng → 1 ref có thể khớp đúng 1 khoản của 1 đơn.
      const rows = await db
        .select({
          refNumber: orderPayments.refNumber,
          orderId: orders.orderId,
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
        })
        .from(orderPayments)
        .innerJoin(orders, eq(orderPayments.orderUniqueKey, orders.uniqueKey))
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(inArray(orderPayments.refNumber, refs));

      const matchedRefs = new Set(rows.map((r) => r.refNumber).filter((r): r is string => !!r));
      const unmatched = refs.filter((r) => !matchedRefs.has(r));

      return NextResponse.json({
        success: true,
        totalInput: refs.length,
        matched: rows,
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
