import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, batches } from "@/lib/db/schema";
import { eq, inArray, and, sql, desc } from "drizzle-orm";
import { z } from "zod";

const CreateBatchSchema = z.object({
  uniqueKeys: z.array(z.string()).min(1),
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
export async function GET() {
  try {
    const rows = await db
      .select({
        id: batches.id,
        totalOrders: batches.totalOrders,
        platform: batches.platform,
        createdAt: batches.createdAt,
        exportedAt: batches.exportedAt,
      })
      .from(batches)
      .orderBy(desc(batches.createdAt));

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * POST: tạo batch mới từ list uniqueKeys.
 *  - Chỉ chấp nhận đơn READY
 *  - Auto split theo payment method: PREPAID → CLICKSHIP, COD → EST
 *  - Set status = EXPORTED, batch_id = batchNo, platform tương ứng
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uniqueKeys } = CreateBatchSchema.parse(body);

    // Filter chỉ READY + lấy paymentMethod để split
    const validOrders = await db
      .select({
        uniqueKey: orders.uniqueKey,
        paymentMethod: orders.paymentMethod,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.uniqueKey, uniqueKeys),
          eq(orders.status, "READY"),
        ),
      );

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

    const prepaidKeys = validOrders
      .filter((o) => o.paymentMethod === "PREPAID")
      .map((o) => o.uniqueKey);
    const codKeys = validOrders
      .filter((o) => o.paymentMethod === "COD")
      .map((o) => o.uniqueKey);

    const now = new Date();
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
        .set({
          status: "EXPORTED",
          batchId: batchNo,
          updatedAt: now,
        })
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
        .set({
          status: "EXPORTED",
          batchId: batchNo,
          updatedAt: now,
        })
        .where(inArray(orders.uniqueKey, codKeys));
      created.push({ batchNo, platform: "EST", count: codKeys.length });
    }

    const summary = created
      .map((c) => `${c.batchNo} (${c.platform === "CLICKSHIP" ? "Thường" : "COD"}: ${c.count} đơn)`)
      .join(", ");

    return NextResponse.json({
      success: true,
      batches: created,
      updated: validOrders.length,
      skipped,
      message: `Đã tạo ${created.length} batch: ${summary}${skipped > 0 ? ` (bỏ qua ${skipped} đơn không READY)` : ""}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
