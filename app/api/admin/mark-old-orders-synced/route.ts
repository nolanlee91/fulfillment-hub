import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, isNull, sql, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-shot: mark TẤT CẢ đơn LABEL_CREATED+ hiện có là "đã sync về sheet"
 * (set syncedToSheetAt = NOW) → cron và manual sync sẽ skip toàn bộ đơn cũ.
 * Chỉ đơn mới (sau thời điểm này) đi qua /api/tracking/import mới sync lên sheet.
 *
 * SUPER_ADMIN only. Chạy 1 lần xong xóa endpoint.
 */
export const GET = withAuth(
  async () => {
    const now = new Date();

    const updated = await db
      .update(orders)
      .set({ syncedToSheetAt: now })
      .where(
        and(
          sql`${orders.trackingNumber} IS NOT NULL`,
          isNull(orders.syncedToSheetAt),
          inArray(orders.status, [
            "LABEL_CREATED",
            "IN_TRANSIT",
            "DELIVERED",
            "FAILED",
          ]),
        ),
      )
      .returning({ uniqueKey: orders.uniqueKey });

    return NextResponse.json({
      success: true,
      marked: updated.length,
      message: `Đã mark ${updated.length} đơn cũ là "đã sync về sheet". Từ giờ cron/manual sẽ skip các đơn này. Chỉ đơn mới import label mới sync.`,
    });
  },
  { roles: ["SUPER_ADMIN"] },
);
