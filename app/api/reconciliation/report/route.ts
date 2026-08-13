import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { buildUnbookedReportXlsx } from "@/lib/reconciliation/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/reconciliation/report?customer=<id>
 * Xuất Excel "Đơn chờ book" của 1 khách (khoản đã có bằng chứng, chưa book).
 * STAFF/SUPER_ADMIN.
 */
async function handler(req: NextRequest) {
  const customerId = new URL(req.url).searchParams.get("customer") || "";
  if (!customerId) {
    return NextResponse.json(
      { success: false, error: "Missing customer" },
      { status: 400 },
    );
  }

  const { buffer, customerName } = await buildUnbookedReportXlsx(customerId);
  const safeName = customerName.replace(/[^\w-]+/g, "_").slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `cho-book_${safeName}_${date}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withAuth(handler, { roles: ["SUPER_ADMIN", "STAFF"] });
