import { db } from "@/lib/db";
import { orders, orderPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Recompute các cột reconciliation SUMMARY trên `orders` từ bảng con `order_payments`.
 * Gọi ở cuối MỌI endpoint mutate payment (upload/add/update/delete/book).
 *
 * Semantics:
 *   - reconciledAt   = MIN(payments.reconciledAt), null nếu đơn không còn khoản nào.
 *   - accountedAt    = chỉ set khi MỌI khoản đã booked (đơn "fully booked"); nếu còn
 *                      1 khoản chưa booked → null (partial vẫn coi là chưa booked xong).
 *   - accountedBy    = người book của khoản book cuối cùng (khi fully booked).
 *   - paymentType/refNumber/paymentProofUrl = của khoản MỚI NHẤT (representative,
 *     cho tooltip recon-cell + hiển thị legacy). Drawer đọc full list riêng.
 */
export async function recomputeOrderReconSummary(uniqueKey: string): Promise<void> {
  const pays = await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.orderUniqueKey, uniqueKey));

  if (pays.length === 0) {
    await db
      .update(orders)
      .set({
        paymentType: null,
        refNumber: null,
        paymentProofUrl: null,
        reconciledAt: null,
        accountedAt: null,
        accountedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(orders.uniqueKey, uniqueKey));
    return;
  }

  // Khoản mới nhất (theo createdAt) làm representative cho summary hiển thị.
  const sortedByCreated = [...pays].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const latest = sortedByCreated[0];

  const reconciledAt = pays.reduce<Date>(
    (min, p) => (p.reconciledAt < min ? p.reconciledAt : min),
    pays[0].reconciledAt,
  );

  const allBooked = pays.every((p) => p.accountedAt !== null);
  let accountedAt: Date | null = null;
  let accountedBy: string | null = null;
  if (allBooked) {
    // Khoản book cuối cùng (accountedAt lớn nhất) → đại diện fully-booked.
    const lastBooked = pays.reduce((max, p) =>
      p.accountedAt! > max.accountedAt! ? p : max,
    );
    accountedAt = lastBooked.accountedAt;
    accountedBy = lastBooked.accountedBy;
  }

  await db
    .update(orders)
    .set({
      paymentType: latest.paymentType,
      refNumber: latest.refNumber,
      paymentProofUrl: latest.proofUrl,
      reconciledAt,
      accountedAt,
      accountedBy,
      updatedAt: new Date(),
    })
    .where(eq(orders.uniqueKey, uniqueKey));
}
