import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";
import { listPallets, listPalletItems } from "@/lib/storage";
import { createRequest, listRequests } from "@/lib/storage/requests";

async function getHandler(req: NextRequest, user: CurrentUser) {
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const status =
      statusParam === "PENDING" || statusParam === "DONE" || statusParam === "CANCELLED"
        ? statusParam
        : undefined;

    const isCustomer = user.role === "CUSTOMER";
    const scopeCustomer = isCustomer ? (user.customerId ?? undefined) : undefined;
    if (isCustomer && !scopeCustomer) {
      return NextResponse.json(
        { success: false, error: "Account is not linked to a customer" },
        { status: 403 },
      );
    }

    const requests = await listRequests({ customerId: scopeCustomer, status });
    // Khách cần danh sách pallet (kèm SKU con) còn trong kho để dựng request.
    const rawPallets = isCustomer
      ? await listPallets({ customerId: scopeCustomer, status: "IN_STORAGE" })
      : [];
    const palletItems = isCustomer ? await listPalletItems(rawPallets.map((p) => p.id)) : [];
    const itemsByPallet = new Map<string, typeof palletItems>();
    for (const it of palletItems) {
      const arr = itemsByPallet.get(it.palletId) ?? [];
      arr.push(it);
      itemsByPallet.set(it.palletId, arr);
    }
    const pallets = rawPallets.map((p) => ({ ...p, items: itemsByPallet.get(p.id) ?? [] }));
    const custRows = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(eq(customers.active, true));

    return NextResponse.json({
      success: true,
      data: { requests, pallets, customers: custRows },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function postHandler(req: NextRequest, user: CurrentUser) {
  try {
    const body = await req.json();
    const isCustomer = user.role === "CUSTOMER";
    const customerId = isCustomer ? (user.customerId ?? "") : String(body.customerId || "");
    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "Missing customer" },
        { status: 400 },
      );
    }

    const items = Array.isArray(body.items)
      ? body.items.map(
          (it: { palletId: string; palletItemId?: string; units: number; uom: string }) => ({
            palletId: String(it.palletId),
            palletItemId: it.palletItemId ? String(it.palletItemId) : undefined,
            units: Number(it.units),
            uom: it.uom === "PALLET" ? "PALLET" : "UNIT",
          }),
        )
      : [];
    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Select at least one pallet" },
        { status: 400 },
      );
    }

    const requestedDate = body.requestedDate ? new Date(body.requestedDate) : null;
    if (!requestedDate || Number.isNaN(requestedDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "Vui lòng chọn ngày giờ muốn lấy hàng" },
        { status: 400 },
      );
    }
    const res = await createRequest({
      customerId,
      items,
      requestedDate,
      note: body.note ? String(body.note) : undefined,
      createdBy: user.username,
    });
    return NextResponse.json({ success: true, ...res });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export const GET = withAuth(getHandler, {
  roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"],
});
export const POST = withAuth(postHandler, {
  roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"],
});
