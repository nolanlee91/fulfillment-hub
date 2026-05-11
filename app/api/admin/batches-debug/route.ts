import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { batches, orders } from "@/lib/db/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Debug endpoint: trả về 20 batch gần nhất + so sánh số đơn snapshot
 * (batches.totalOrders) vs số đơn thực tế (count orders WHERE batch_id = X).
 *
 * Discrepancy = batch có totalOrders > 0 nhưng thực tế không còn order nào
 * → đơn đã bị xóa hoặc batch_id bị reset (do sync ERROR_UPDATED).
 *
 * Optional ?id=<batchId> → trả về detail của batch đó: orders hiện tại + orders
 * cập nhật trong ±10 phút quanh batch.createdAt (để truy đơn bị "rớt").
 */
export const GET = withAuth(
  async (req) => {
    const url = new URL(req.url);
    const targetBatchId = url.searchParams.get("id");

    if (targetBatchId) {
      // Detail mode
      const [batch] = await db
        .select()
        .from(batches)
        .where(eq(batches.id, targetBatchId));

      if (!batch) {
        return NextResponse.json(
          { success: false, error: `Batch ${targetBatchId} not found` },
          { status: 404 },
        );
      }

      const inBatch = await db
        .select({
          orderId: orders.orderId,
          customerId: orders.customerId,
          productId: orders.productId,
          status: orders.status,
          updatedAt: orders.updatedAt,
        })
        .from(orders)
        .where(eq(orders.batchId, targetBatchId))
        .limit(100);

      // Orders updated within ±10 min of batch creation (suspect đã từng ở trong batch này)
      const window = 10 * 60 * 1000;
      const before = new Date(batch.createdAt.getTime() - window);
      const after = new Date(batch.createdAt.getTime() + window);

      const aroundCreate = await db
        .select({
          orderId: orders.orderId,
          customerId: orders.customerId,
          status: orders.status,
          batchId: orders.batchId,
          updatedAt: orders.updatedAt,
          errorNote: orders.errorNote,
        })
        .from(orders)
        .where(and(gte(orders.updatedAt, before), lte(orders.updatedAt, after)))
        .limit(100);

      return NextResponse.json({
        success: true,
        batch,
        inBatchCount: inBatch.length,
        inBatch,
        aroundCreateCount: aroundCreate.length,
        aroundCreate,
      });
    }

    // Summary mode: 20 batch gần nhất
    const recentBatches = await db
      .select()
      .from(batches)
      .orderBy(desc(batches.createdAt))
      .limit(20);

    const summary = [];
    for (const b of recentBatches) {
      const [actualCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.batchId, b.id));

      summary.push({
        id: b.id,
        platform: b.platform,
        createdAt: b.createdAt,
        exportedAt: b.exportedAt,
        totalOrdersStored: b.totalOrders,
        actualOrdersCount: Number(actualCount?.count ?? 0),
        missing: b.totalOrders - Number(actualCount?.count ?? 0),
      });
    }

    return NextResponse.json({ success: true, batches: summary });
  },
  { roles: ["SUPER_ADMIN"] },
);
