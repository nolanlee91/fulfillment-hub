import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";
import { pickupFromPallet } from "@/lib/storage";

async function handler(req: NextRequest, user: CurrentUser) {
  try {
    const body = await req.json();
    const palletId = String(body.palletId || "").trim();
    const uom = body.uom === "PALLET" ? "PALLET" : "UNIT";
    const units = body.units != null ? Number(body.units) : undefined;
    const note = body.note ? String(body.note) : undefined;

    if (!palletId) {
      return NextResponse.json(
        { success: false, error: "Missing palletId" },
        { status: 400 },
      );
    }
    if (uom === "UNIT" && (!Number.isFinite(units) || (units ?? 0) < 1)) {
      return NextResponse.json(
        { success: false, error: "Units to pick must be at least 1" },
        { status: 400 },
      );
    }

    const res = await pickupFromPallet({
      palletId,
      uom,
      units,
      createdBy: user.username,
      note,
    });
    return NextResponse.json({ success: true, ...res });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Storage pickup error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export const POST = withAuth(handler, { roles: ["SUPER_ADMIN", "STAFF"] });
