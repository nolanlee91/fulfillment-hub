import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { withAuth } from "@/lib/auth/api-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/batches/[id]/sort-labels
 * Nhận file PDF label (download từ ClickShip, theo từng batch) → sắp lại các
 * trang theo Kho → Mặt hàng → Mã đơn → trả về PDF mới để in, đóng gói tuần tự.
 * (Kho đứng trước phòng khi 1 batch lẫn 2 kho; batch 1 kho thì coi như không ảnh hưởng.)
 *
 * Khớp trang ↔ Mã đơn bằng cách dò Mã đơn của batch trong text từng trang
 * (không đoán prefix). Trang không nhận ra Mã đơn → đẩy xuống cuối, không mất.
 */
export const POST = withAuth<RouteContext>(
  async (req, _user, ctx) => {
    try {
      const { id: batchId } = await ctx.params;

      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: "Chưa upload file PDF label" },
          { status: 400 },
        );
      }

      // 1. Map Mã đơn → mặt hàng của batch.
      const rows = await db
        .select({
          orderId: orders.orderId,
          productId: orders.productId,
          productName: products.name,
          warehouseCode: orders.warehouseCode,
        })
        .from(orders)
        .leftJoin(products, eq(orders.productId, products.id))
        .where(eq(orders.batchId, batchId));

      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, error: `Batch ${batchId} không có đơn nào` },
          { status: 404 },
        );
      }

      // Kho BC (WEST) trước, Ontario (EAST) sau, chưa gán → giữa.
      const whRank = (wh: string | null): number =>
        wh === "WEST" ? 0 : wh === "EAST" ? 1 : 2;

      const orderInfo = new Map<
        string,
        { whRank: number; productKey: string; orderId: string }
      >();
      for (const r of rows) {
        orderInfo.set(r.orderId, {
          whRank: whRank(r.warehouseCode),
          productKey: (r.productName || r.productId || "").toLowerCase(),
          orderId: r.orderId,
        });
      }

      // 2. Đọc text từng trang PDF.
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      let pageTexts: string[] = [];
      try {
        const parsed = await parser.getText();
        pageTexts = (parsed.pages || []).map((p) => p.text || "");
      } finally {
        await parser.destroy().catch(() => {});
      }

      // 3. Mỗi trang → tìm Mã đơn của batch xuất hiện trong text trang đó.
      type PageRef = {
        index: number;
        whRank: number;
        productKey: string;
        orderId: string;
        matched: boolean;
      };
      const pageRefs: PageRef[] = pageTexts.map((text, index) => {
        const tokens = text.split(/[^A-Za-z0-9]+/);
        for (const tok of tokens) {
          const info = orderInfo.get(tok);
          if (info) {
            return {
              index,
              whRank: info.whRank,
              productKey: info.productKey,
              orderId: info.orderId,
              matched: true,
            };
          }
        }
        return { index, whRank: 9, productKey: "￿", orderId: "", matched: false };
      });

      // 4. Sắp xếp: Kho → Mặt hàng → Mã đơn. Trang không nhận ra → cuối (giữ thứ tự gốc).
      const sorted = [...pageRefs].sort((a, b) => {
        if (a.whRank !== b.whRank) return a.whRank - b.whRank;
        if (a.productKey !== b.productKey)
          return a.productKey < b.productKey ? -1 : 1;
        if (a.orderId !== b.orderId) return a.orderId < b.orderId ? -1 : 1;
        return a.index - b.index;
      });

      // 5. Ghép PDF mới theo thứ tự đã sắp.
      const srcDoc = await PDFDocument.load(new Uint8Array(buffer));
      const outDoc = await PDFDocument.create();
      const copied = await outDoc.copyPages(
        srcDoc,
        sorted.map((p) => p.index),
      );
      copied.forEach((p) => outDoc.addPage(p));
      const outBytes = await outDoc.save();

      const unmatched = pageRefs.filter((p) => !p.matched).length;
      const filename = `labels_${batchId}_sorted.pdf`;

      return new NextResponse(new Uint8Array(outBytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          // Số trang không khớp Mã đơn (đẩy xuống cuối) — client đọc để cảnh báo.
          "X-Unmatched-Pages": String(unmatched),
          "X-Total-Pages": String(pageRefs.length),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Sort labels error:", error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
