import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { buildStorageReportXlsx } from "@/lib/storage/report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const customerId = searchParams.get("customer") || undefined;

  if (!fromStr || !toStr) {
    return NextResponse.json(
      { success: false, error: "Missing from/to date" },
      { status: 400 },
    );
  }
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T23:59:59.999`);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ success: false, error: "Invalid date range" }, { status: 400 });
  }

  const buffer = await buildStorageReportXlsx({ from, to, customerId });
  const filename = `storage-report_${fromStr}_${toStr}.xlsx`;
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
