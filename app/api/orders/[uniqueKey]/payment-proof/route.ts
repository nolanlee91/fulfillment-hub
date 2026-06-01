import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import { buildProofKey, uploadObject } from "@/lib/storage/r2";

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
 * Multipart: paymentType + image
 * CUSTOMER role only — verify đơn thuộc customer của user.
 * Upload ảnh lên R2 + update DB.
 */
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

      if (!paymentType || !ALLOWED_PAYMENT_TYPES.has(paymentType)) {
        return NextResponse.json(
          { success: false, error: "Invalid paymentType (allowed: BANK_TRANSFER, CHEQUE, MONEY_ORDER)" },
          { status: 400 },
        );
      }
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

      const now = new Date();
      const ext = MIME_TO_EXT[file.type] ?? "bin";
      const key = buildProofKey(user.customerId, uniqueKey, ext, now);
      const buffer = Buffer.from(await file.arrayBuffer());

      let publicUrl: string;
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

      await db
        .update(orders)
        .set({
          paymentType,
          paymentProofUrl: publicUrl,
          reconciledAt: now,
          updatedAt: now,
        })
        .where(eq(orders.uniqueKey, uniqueKey));

      return NextResponse.json({
        success: true,
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
