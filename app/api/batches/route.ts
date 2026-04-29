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
 *  - Set status = EXPORTED, batch_id = batchNo
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uniqueKeys } = CreateBatchSchema.parse(body);

    // Filter chỉ READY
    const validOrders = await db
      .select({ uniqueKey: orders.uniqueKey })
      .from(orders)
      .where(
        and(
          inArray(orders.uniqueKey, uniqueKeys),
          eq(orders.status, "READY"),
        ),
      );

    const validKeys = validOrders.map((o) => o.uniqueKey);
    const skipped = uniqueKeys.length - validKeys.length;

    if (validKeys.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không có đơn READY nào trong ${uniqueKeys.length} đơn được chọn`,
        },
        { status: 400 },
      );
    }

    // Generate batch ID
    const batchNo = await generateBatchNo();
    const now = new Date();

    // Insert batch record
    await db.insert(batches).values({
      id: batchNo,
      totalOrders: validKeys.length,
      createdAt: now,
      exportedAt: now,
    });

    // Update orders
    await db
      .update(orders)
      .set({
        status: "EXPORTED",
        batchId: batchNo,
        updatedAt: now,
      })
      .where(inArray(orders.uniqueKey, validKeys));

    return NextResponse.json({
      success: true,
      batchNo,
      updated: validKeys.length,
      skipped,
      message: `Đã tạo batch ${batchNo}: ${validKeys.length} đơn${skipped > 0 ? ` (bỏ qua ${skipped} đơn không READY)` : ""}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
