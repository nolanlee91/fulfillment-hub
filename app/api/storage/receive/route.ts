import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";
import { receivePallets } from "@/lib/storage";

async function handler(req: NextRequest, user: CurrentUser) {
  try {
    const body = await req.json();
    const customerId = String(body.customerId || "").trim();
    const warehouseCode = String(body.warehouseCode || "").trim();
    const productName = String(body.productName || "").trim();
    const unitsPerPallet = Number(body.unitsPerPallet);
    const palletCount = Number(body.palletCount);
    const note = body.note ? String(body.note) : undefined;

    if (!customerId || !warehouseCode || !productName) {
      return NextResponse.json(
        { success: false, error: "Thiếu khách hàng / kho / tên sản phẩm" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(unitsPerPallet) || unitsPerPallet < 0) {
      return NextResponse.json(
        { success: false, error: "Số unit/pallet không hợp lệ" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(palletCount) || palletCount < 1) {
      return NextResponse.json(
        { success: false, error: "Số pallet phải ≥ 1" },
        { status: 400 },
      );
    }

    const res = await receivePallets({
      customerId,
      warehouseCode,
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
