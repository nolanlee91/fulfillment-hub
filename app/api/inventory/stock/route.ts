import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { recordMovement } from "@/lib/inventory";

const StockSchema = z.object({
  warehouseCode: z.string().min(1),
  productId: z.string().min(1),
  // STOCK_IN: qty nhập (>0). ADJUST: chênh lệch (±), dùng khi kiểm kê sửa tay.
  type: z.enum(["STOCK_IN", "ADJUST"]),
  delta: z.number().int(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/inventory/stock
 * Ghi biến động tồn kho thủ công:
 *   - STOCK_IN: nhập kho (delta > 0)
 *   - ADJUST:   kiểm kê / sửa tay (delta ±)
 * Tự cập nhật on_hand + lưu ledger để xem lịch sử.
 */
export const POST = withAuth(
  async (req, user) => {
    try {
      const body = await req.json();
      const p = StockSchema.parse(body);

      if (p.type === "STOCK_IN" && p.delta <= 0) {
        return NextResponse.json(
          { success: false, error: "Số lượng nhập kho phải > 0" },
          { status: 400 },
        );
      }
      if (p.delta === 0) {
        return NextResponse.json(
          { success: false, error: "Chênh lệch phải khác 0" },
          { status: 400 },
        );
      }

      await recordMovement({
        warehouseCode: p.warehouseCode,
        productId: p.productId,
        delta: p.delta,
        type: p.type,
        note: p.note ?? null,
        createdBy: user.username,
      });

      return NextResponse.json({ success: true });
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
