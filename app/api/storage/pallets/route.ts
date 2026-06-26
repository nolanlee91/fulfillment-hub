import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { customers, warehouses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";
import { listPallets } from "@/lib/storage";

async function handler(req: NextRequest, user: CurrentUser) {
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const warehouseParam = searchParams.get("warehouse");

    // CUSTOMER (Phase 2) → ép scope theo customerId; Phase 1 chỉ STAFF nên global.
    const customerId =
      user.role === "CUSTOMER" ? (user.customerId ?? undefined) : undefined;

    const status =
      statusParam === "IN_STORAGE" ||
      statusParam === "PICKED_UP" ||
      statusParam === "DISPOSED"
        ? statusParam
        : undefined;

    const pallets = await listPallets({
      customerId,
      status,
      warehouseCode: warehouseParam || undefined,
    });

    const [custRows, whRows] = await Promise.all([
      db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(eq(customers.active, true)),
      db
        .select({ code: warehouses.code, name: warehouses.name, region: warehouses.region })
        .from(warehouses)
        .where(eq(warehouses.active, true)),
    ]);

    return NextResponse.json({
      success: true,
      data: { pallets, customers: custRows, warehouses: whRows },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Storage pallets list error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const GET = withAuth(handler, {
  roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"],
});
