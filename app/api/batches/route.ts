import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, batches } from "@/lib/db/schema";
import { eq, inArray, and, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { allocateBatch } from "@/lib/inventory/stock-check";

const CreateBatchSchema = z.object({
  uniqueKeys: z.array(z.string()).min(1),
  // force=true: bỏ qua cảnh báo thiếu tồn kho, tạo batch luôn (staff đã xác nhận).
  force: z.boolean().optional(),
});

/**
 * Sinh batch_no theo format YYYY-MM-DD-{AM|PM}-NNN.
 */
async function generateBatchNo(): Promise<string> {
  const now = new Date();
  const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const isPM = now.getHours() >= 12;
  const session = isPM ? "PM" : "AM";
  const prefix = `${date}-${session}-`;

  // Tìm số thứ tự lớn nhất hôm nay
  const existing = await db
    .select({ id: batches.id })
    .from(batches)
    .where(sql`${batches.id} LIKE ${prefix + "%"}`);

  let maxSeq = 0;
  for (const b of existing) {
    const seq = Number(b.id.substring(prefix.length));
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }

  return prefix + String(maxSeq + 1).padStart(3, "0");
}

/**
 * GET: list các batch đã tạo
 */
export const GET = withAuth(
  async () => {
  try {
    const rows = await db
      .select({
        id: batches.id,
        totalOrders: batches.totalOrders,
        platform: batches.platform,
        createdAt: batches.createdAt,
        exportedAt: batches.exportedAt,
        deletedAt: batches.deletedAt,
        deletedReason: batches.deletedReason,
        deletedBy: batches.deletedBy,
      })
      .from(batches)
      .orderBy(desc(batches.createdAt));

    // Đếm số đơn ĐÃ CÓ LABEL (trackingNumber != null) theo từng batch → tiến độ up label.
    const labeledRows = await db
      .select({ batchId: orders.batchId, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(sql`${orders.trackingNumber} IS NOT NULL`)
      .groupBy(orders.batchId);
    const labeledMap = new Map<string, number>();
    for (const r of labeledRows) if (r.batchId) labeledMap.set(r.batchId, r.n);

    const data = rows.map((b) => ({ ...b, labeledCount: labeledMap.get(b.id) ?? 0 }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);

/**
 * POST: tạo batch mới từ list uniqueKeys.
 *  - Chỉ chấp nhận đơn READY
 *  - Auto split theo payment method: PREPAID → CLICKSHIP, COD → EST
 *  - Set status = EXPORTED, batch_id = batchNo, platform tương ứng
 */
export const POST = withAuth(
  async (req) => {
  try {
    const body = await req.json();
    const { uniqueKeys, force } = CreateBatchSchema.parse(body);

    // Filter chỉ READY + lấy paymentMethod để split + geo để gán kho.
    // Sort theo syncedAt (FIFO) cho khớp định tuyến ở danh sách đơn.
    const validOrders = await db
      .select({
        uniqueKey: orders.uniqueKey,
        paymentMethod: orders.paymentMethod,
        productId: orders.productId,
        quantity: orders.quantity,
        itemBreakdown: orders.itemBreakdown,
        province: orders.province,
        country: orders.country,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.uniqueKey, uniqueKeys),
          eq(orders.status, "READY"),
        ),
      )
      .orderBy(orders.syncedAt, orders.uniqueKey);

    const skipped = uniqueKeys.length - validOrders.length;

    if (validOrders.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không có đơn READY nào trong ${uniqueKeys.length} đơn được chọn`,
        },
        { status: 400 },
      );
    }

    // Phân bổ kho + tách đơn thiếu tồn (greedy FIFO, breakdown-aware, WEST hữu hạn).
    const alloc = await allocateBatch(validOrders);

    // Có đơn thiếu hàng & chưa xác nhận → hỏi trước (chưa tạo/tách gì).
    if (!force && alloc.shortKeys.length > 0) {
      return NextResponse.json({
        success: true,
        needsConfirm: true,
        okCount: alloc.okKeys.length,
        shortCount: alloc.shortKeys.length,
        shortSummary: alloc.shortSummary,
        message: `${alloc.shortKeys.length} đơn thiếu tồn kho sẽ chuyển sang "Hết hàng".`,
      });
    }

    const now = new Date();
    const okSet = new Set(alloc.okKeys);
    const okOrders = validOrders.filter((o) => okSet.has(o.uniqueKey));
    const prepaidKeys = okOrders
      .filter((o) => o.paymentMethod === "PREPAID")
      .map((o) => o.uniqueKey);
    const codKeys = okOrders
      .filter((o) => o.paymentMethod === "COD")
      .map((o) => o.uniqueKey);

    const created: Array<{ batchNo: string; platform: "CLICKSHIP" | "EST"; count: number }> = [];

    if (prepaidKeys.length > 0) {
      const batchNo = await generateBatchNo();
      await db.insert(batches).values({
        id: batchNo,
        totalOrders: prepaidKeys.length,
        platform: "CLICKSHIP",
        createdAt: now,
        exportedAt: now,
      });
      await db
        .update(orders)
        .set({ status: "EXPORTED", batchId: batchNo, updatedAt: now })
        .where(inArray(orders.uniqueKey, prepaidKeys));
      created.push({ batchNo, platform: "CLICKSHIP", count: prepaidKeys.length });
    }

    if (codKeys.length > 0) {
      const batchNo = await generateBatchNo();
      await db.insert(batches).values({
        id: batchNo,
        totalOrders: codKeys.length,
        platform: "EST",
        createdAt: now,
        exportedAt: now,
      });
      await db
        .update(orders)
        .set({ status: "EXPORTED", batchId: batchNo, updatedAt: now })
        .where(inArray(orders.uniqueKey, codKeys));
      created.push({ batchNo, platform: "EST", count: codKeys.length });
    }

    // Lưu kho đóng cho các đơn vừa EXPORTED (theo phân bổ).
    const eastKeys = alloc.okKeys.filter((k) => alloc.warehouseByKey.get(k) === "EAST");
    const westKeys = alloc.okKeys.filter((k) => alloc.warehouseByKey.get(k) === "WEST");
    if (eastKeys.length > 0) {
      await db.update(orders).set({ warehouseCode: "EAST" }).where(inArray(orders.uniqueKey, eastKeys));
    }
    if (westKeys.length > 0) {
      await db.update(orders).set({ warehouseCode: "WEST" }).where(inArray(orders.uniqueKey, westKeys));
    }

    // Đơn thiếu tồn → OUT_OF_STOCK (tách khỏi luồng, chờ xử lý ở tab Hết hàng).
    if (alloc.shortKeys.length > 0) {
      await db
        .update(orders)
        .set({
          status: "OUT_OF_STOCK",
          errorNote: "Thiếu tồn kho khi tạo batch",
          updatedAt: now,
        })
        .where(inArray(orders.uniqueKey, alloc.shortKeys));
    }

    const summary = created
      .map((c) => `${c.batchNo} (${c.platform === "CLICKSHIP" ? "Thường" : "COD"}: ${c.count} đơn)`)
      .join(", ");
    const parts: string[] = [];
    if (created.length > 0) parts.push(`Đã tạo ${created.length} batch: ${summary}`);
    else parts.push("Không tạo batch (không đơn nào đủ hàng)");
    if (alloc.shortKeys.length > 0) parts.push(`${alloc.shortKeys.length} đơn thiếu hàng → Hết hàng`);
    if (skipped > 0) parts.push(`bỏ qua ${skipped} đơn không READY`);

    return NextResponse.json({
      success: true,
      batches: created,
      updated: okOrders.length,
      outOfStock: alloc.shortKeys.length,
      skipped,
      message: parts.join(". ") + ".",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
