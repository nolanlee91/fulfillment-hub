import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";
import { receivePallets, STORAGE_WAREHOUSE_CODE } from "@/lib/storage";

async function handler(req: NextRequest, user: CurrentUser) {
  try {
    const body = await req.json();
    const customerId = String(body.customerId || "").trim();
    const productName = String(body.productName || "").trim();
    const unitsPerPallet = Number(body.unitsPerPallet);
    const palletCount = Number(body.palletCount);
    const note = body.note ? String(body.note) : undefined;

    if (!customerId || !productName) {
      return NextResponse.json(
        { success: false, error: "Missing customer or product" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(unitsPerPallet) || unitsPerPallet < 0) {
      return NextResponse.json(
        { success: false, error: "Invalid units per pallet" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(palletCount) || palletCount < 1) {
      return NextResponse.json(
        { success: false, error: "Pallet count must be at least 1" },
        { status: 400 },
      );
    }

    const res = await receivePallets({
      customerId,
      warehouseCode: STORAGE_WAREHOUSE_CODE, // Lưu kho chỉ ở BC (WEST)
      productName,
      unitsPerPallet,
      palletCount,
      createdBy: user.username,
      note,
    });
    return NextResponse.json({ success: true, ...res });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Storage receive error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAuth(handler, { roles: ["SUPER_ADMIN", "STAFF"] });
