import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { orders, orderPayments } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { buildProofKey, uploadObject } from "@/lib/storage/r2";
import { recomputeOrderReconSummary } from "@/lib/reconciliation/summary";

export const maxDuration = 60;

const ALLOWED_PAYMENT_TYPES = new Set([
  "BANK_TRANSFER",
  "CHEQUE",
  "MONEY_ORDER",
]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * POST /api/orders/[uniqueKey]/payment-proof
 * Multipart: paymentType + (image HOẶC proofLink)
 * CUSTOMER role only — verify đơn thuộc customer của user.
 * - Ảnh: upload lên R2 như cũ.
 * - proofLink: khách dán LINK ảnh (Drive, ngân hàng...) thay vì file → lưu URL
 *   thẳng vào proofUrl (không fetch về — link private vẫn mở được bằng browser).
 * THÊM 1 khoản thanh toán non-ETF (append, không ghi đè — 1 đơn có thể trả
 * nhiều lần). Xóa/book per-khoản qua /payments/[paymentId].
 */
const MAX_LINK_LENGTH = 1000;

/** Validate link chứng từ: http(s), không quá dài. Trả về URL đã trim hoặc null. */
function sanitizeProofLink(raw: string): string | null {
  const link = raw.trim();
  if (!link || link.length > MAX_LINK_LENGTH) return null;
  try {
    const u = new URL(link);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
export const POST = withAuth(
  async (req, user, { params }: { params: Promise<{ uniqueKey: string }> }) => {
    try {
      const { uniqueKey } = await params;

      if (!user.customerId) {
        return NextResponse.json(
          { success: false, error: "Account is not linked to a customer" },
          { status: 400 },
        );
      }

      // Verify đơn thuộc customer
      const [order] = await db
        .select({
          uniqueKey: orders.uniqueKey,
          customerId: orders.customerId,
          paymentMethod: orders.paymentMethod,
        })
        .from(orders)
        .where(
          and(
            eq(orders.uniqueKey, uniqueKey),
            eq(orders.customerId, user.customerId),
          ),
        );

      if (!order) {
        return NextResponse.json(
          { success: false, error: "Order not found" },
          { status: 404 },
        );
      }

      if (order.paymentMethod === "COD") {
        return NextResponse.json(
          { success: false, error: "COD orders don't need reconciliation" },
          { status: 400 },
        );
      }

      // Parse multipart
      const formData = await req.formData();
      const paymentType = formData.get("paymentType") as string | null;
      const file = formData.get("file");
      const rawLink = formData.get("proofLink");

      if (!paymentType || !ALLOWED_PAYMENT_TYPES.has(paymentType)) {
        return NextResponse.json(
          { success: false, error: "Invalid paymentType (allowed: BANK_TRANSFER, CHEQUE, MONEY_ORDER)" },
          { status: 400 },
        );
      }

      const now = new Date();
      let publicUrl: string;

      if (typeof rawLink === "string" && rawLink.trim()) {
        // Nhánh LINK: khách dán URL ảnh chứng từ thay vì upload file
        const link = sanitizeProofLink(rawLink);
        if (!link) {
          return NextResponse.json(
            { success: false, error: "Link không hợp lệ — cần URL đầy đủ bắt đầu bằng http(s)://" },
            { status: 400 },
          );
        }
        publicUrl = link;
      } else {
        // Nhánh FILE: upload ảnh lên R2 như cũ
        if (!file || !(file instanceof Blob)) {
          return NextResponse.json(
            { success: false, error: "No file uploaded" },
            { status: 400 },
          );
        }
        if (file.size > MAX_SIZE_BYTES) {
          return NextResponse.json(
            { success: false, error: `File too large (max ${MAX_SIZE_BYTES / 1024 / 1024} MB)` },
            { status: 400 },
          );
        }
        if (!ALLOWED_MIME.has(file.type)) {
          return NextResponse.json(
            { success: false, error: `Invalid file type ${file.type}. Allowed: JPG, PNG, WEBP` },
            { status: 400 },
          );
        }

        const ext = MIME_TO_EXT[file.type] ?? "bin";
        const key = buildProofKey(user.customerId, uniqueKey, ext, now);
        const buffer = Buffer.from(await file.arrayBuffer());

        try {
          publicUrl = await uploadObject(key, buffer, file.type);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("R2 upload error:", e);
          return NextResponse.json(
            { success: false, error: `Storage upload failed: ${msg}` },
            { status: 500 },
          );
        }
      }

      const paymentId = randomUUID();
      await db.insert(orderPayments).values({
        id: paymentId,
        orderUniqueKey: uniqueKey,
        paymentType,
        proofUrl: publicUrl,
        reconciledAt: now,
        createdBy: `CUSTOMER:${user.customerId}`,
        createdAt: now,
      });

      await recomputeOrderReconSummary(uniqueKey);

      return NextResponse.json({
        success: true,
        paymentId,
        paymentType,
        paymentProofUrl: publicUrl,
        reconciledAt: now.toISOString(),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Payment proof upload error:", error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["CUSTOMER"] },
);
