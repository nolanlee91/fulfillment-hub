import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, customers, products } from "@/lib/db/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { assessClaim, GUARANTEED_SERVICE } from "@/lib/claims";

/**
 * GET /api/claims/late
 *
 * Đơn giao TRỄ so với ngày carrier cam kết → nộp claim đòi lại cước.
 * Query: ?window=open|expired|all (mặc định open) &status=none|FILED|APPROVED|REJECTED
 *        &customer=<id>
 *
 * Sắp theo HẠN NỘP gần nhất trước — đây là thứ tự duy nhất có ích, vì quá hạn
 * là mất trắng dù đơn trễ tới đâu.
 * STAFF/SUPER_ADMIN (claim là việc nội bộ với carrier, khách không thấy).
 */
export const GET = withAuth(
  async (req) => {
    try {
      const { searchParams } = new URL(req.url);
      const windowFilter = searchParams.get("window") ?? "open";
      const statusFilter = searchParams.get("status");
      const customerId = searchParams.get("customer");

      const conditions = [
        isNotNull(orders.guaranteedDeliveryDate),
        isNotNull(orders.deliveredAt),
        eq(orders.serviceType, GUARANTEED_SERVICE),
      ];
      if (customerId) conditions.push(eq(orders.customerId, customerId));
      if (statusFilter === "none") conditions.push(sql`${orders.claimStatus} IS NULL`);
      else if (statusFilter) conditions.push(eq(orders.claimStatus, statusFilter as "FILED"));

      const rows = await db
        .select({
          uniqueKey: orders.uniqueKey,
          orderId: orders.orderId,
          customerId: orders.customerId,
          customerName: customers.name,
          productName: products.name,
          name: orders.name,
          city: orders.city,
          province: orders.province,
          trackingNumber: orders.trackingNumber,
          trackingUrl: orders.trackingUrl,
          serviceType: orders.serviceType,
          shipDate: orders.shipDate,
          guaranteedDeliveryDate: orders.guaranteedDeliveryDate,
          eddCurrent: orders.eddCurrent,
          eddChangeCount: orders.eddChangeCount,
          firstAttemptDate: orders.firstAttemptDate,
          deliveredAt: orders.deliveredAt,
          claimStatus: orders.claimStatus,
          claimFiledAt: orders.claimFiledAt,
          claimAmount: orders.claimAmount,
          claimNote: orders.claimNote,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .leftJoin(products, eq(orders.productId, products.id))
        .where(and(...conditions));

      const assessed = rows
        .map((o) => ({ ...o, claim: assessClaim(o) }))
        .filter((o) => o.claim.isLate)
        .filter((o) =>
          windowFilter === "all"
            ? true
            : windowFilter === "expired"
              ? o.claim.expired
              : !o.claim.expired,
        )
        .sort((a, b) => {
          // Hạn gần nhất lên đầu; cùng hạn thì đơn trễ nhiều hơn lên trước.
          const d = String(a.claim.filingDeadline).localeCompare(String(b.claim.filingDeadline));
          return d !== 0 ? d : b.claim.daysLate - a.claim.daysLate;
        });

      const totals = {
        count: assessed.length,
        totalDaysLate: assessed.reduce((s, o) => s + o.claim.daysLate, 0),
        notFiled: assessed.filter((o) => !o.claimStatus).length,
        filed: assessed.filter((o) => o.claimStatus === "FILED").length,
        approved: assessed.filter((o) => o.claimStatus === "APPROVED").length,
        rejected: assessed.filter((o) => o.claimStatus === "REJECTED").length,
        recovered: assessed
          .filter((o) => o.claimStatus === "APPROVED")
          .reduce((s, o) => s + Number(o.claimAmount ?? 0), 0),
        // Đơn chưa có ngày giao đầu tiên → đang tạm đo bằng ngày hàng được nhận,
        // có thể trễ oan. Phải soi tracking tay trước khi nộp.
        unverified: assessed.filter((o) => o.claim.measuredFrom === "delivered").length,
      };

      return NextResponse.json({ success: true, orders: assessed, totals });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("claims/late error:", error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
