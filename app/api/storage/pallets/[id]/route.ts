import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { deletePallet, editPallet } from "@/lib/storage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PUT — sửa pallet (tên SP / ghi chú / chỉnh tồn). CHỈ STAFF/SUPER_ADMIN.
 * Đổi tồn → editPallet tự ghi movement ADJUST.
 */
export const PUT = withAuth<RouteContext>(
  async (req, user, ctx) => {
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const res = await editPallet({
        palletId: id,
        productName: body.productName != null ? String(body.productName) : undefined,
        unitCount:
          body.unitCount != null && body.unitCount !== ""
            ? Number(body.unitCount)
            : undefined,
        note: body.note !== undefined ? (body.note ? String(body.note) : null) : undefined,
        createdBy: user.username,
      });
      return NextResponse.json({ success: true, ...res });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);

/**
 * DELETE 1 pallet — dọn pallet test / nhập nhầm. CHỈ STAFF/SUPER_ADMIN.
 * Chặn nếu pallet đang bị pickup request tham chiếu (deletePallet ném lỗi).
 */
export const DELETE = withAuth<RouteContext>(
  async (_req, _user, ctx) => {
    try {
      const { id } = await ctx.params;
      await deletePallet(id);
      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
