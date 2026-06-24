/**
 * Đánh dấu đơn FitJvC5Ji7jR = đã TRẢ VỀ (hàng đã về kho), khớp thực tế.
 * Canada Post giao vào parcel locker (1442) rồi thu hồi mà không phát mã RTS →
 * app vẫn để DELIVERED. Set tay về FAILED + xóa deliveredAt.
 *
 * Chạy: npx tsx --env-file=.env.local scripts/set-fitjvc-returned.ts
 */
import { db } from "../lib/db";
import { orders } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const UNIQUE_KEY = "venatureco_fitgum_acai_FitJvC5Ji7jR";

async function main() {
  const [before] = await db
    .select({ status: orders.status, deliveredAt: orders.deliveredAt })
    .from(orders)
    .where(eq(orders.uniqueKey, UNIQUE_KEY));
  if (!before) {
    console.log("✗ Không tìm thấy đơn", UNIQUE_KEY);
    process.exit(1);
  }
  console.log("Trước:", before.status, "deliveredAt =", before.deliveredAt?.toISOString());

  await db
    .update(orders)
    .set({
      status: "FAILED",
      deliveredAt: null,
      attentionReason: null,
      attentionAt: null,
      attentionNote: null,
      errorNote: "Trả về kho — giao parcel locker không nhận, CP thu hồi (set tay)",
      updatedAt: new Date(),
    })
    .where(eq(orders.uniqueKey, UNIQUE_KEY));

  const [after] = await db
    .select({ status: orders.status, deliveredAt: orders.deliveredAt, errorNote: orders.errorNote })
    .from(orders)
    .where(eq(orders.uniqueKey, UNIQUE_KEY));
  console.log("Sau  :", after.status, "deliveredAt =", after.deliveredAt, "| note:", after.errorNote);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
