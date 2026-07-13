import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";
import { receivePallets, receiveMixedPallet, STORAGE_WAREHOUSE_CODE } from "@/lib/storage";

async function handler(req: NextRequest, user: CurrentUser) {
  try {
    const body = await req.json();
    const customerId = String(body.customerId || "").trim();
    const palletCount = Number(body.palletCount);
    const note = body.note ? String(body.note) : undefined;

    // items[] = nhiều SKU/pallet (pallet trộn). Tương thích ngược: nếu không có
    // items thì dựng từ productName/unitsPerPallet (chế độ 1 SKU cũ).
    const rawItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : [{ productName: body.productName, units: body.unitsPerPallet }];
    const items = rawItems
      .map((it: { productName?: string; units?: number }) => ({
        productName: String(it.productName || "").trim(),
        units: Math.floor(Number(it.units)),
      }))
      .filter((it: { productName: string; units: number }) => it.productName && Number.isFinite(it.units) && it.units >= 1);

    if (!customerId) {
      return NextResponse.json({ success: false, error: "Missing customer" }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Cần ít nhất 1 SKU với số lượng ≥ 1" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(palletCount) || palletCount < 1) {
      return NextResponse.json(
        { success: false, error: "Pallet count must be at least 1" },
        { status: 400 },
      );
    }

    const res =
      items.length === 1
        ? await receivePallets({
            customerId,
            warehouseCode: STORAGE_WAREHOUSE_CODE,
            productName: items[0].productName,
            unitsPerPallet: items[0].units,
            palletCount,
            createdBy: user.username,
            note,
          })
        : await receiveMixedPallet({
            customerId,
            warehouseCode: STORAGE_WAREHOUSE_CODE, // Lưu kho chỉ ở BC (WEST)
            items,
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
