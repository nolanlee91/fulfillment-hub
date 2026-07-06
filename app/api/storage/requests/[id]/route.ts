import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";
import {
  cancelRequest,
  confirmRequest,
  editRequest,
  deleteRequest,
  customerConfirm,
} from "@/lib/storage/requests";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST action trên 1 request:
 *   - action "edit"    : sửa items/ngày/note (chỉ PENDING). Khách scope theo customerId.
 *   - action "cancel"  : hủy (chỉ PENDING).
 *   - action "confirm" : staff chốt số cuối → DONE (thực hiện pickup). CHỈ staff.
 *   - action "delete"  : xóa hẳn request (khách: của mình + không DONE; staff: mọi cái).
 *   - action "customer_confirm": khách "Đồng ý" số cuối sau khi DONE. CHỈ khách.
 */
export const POST = withAuth<RouteContext>(
  async (req, user, ctx) => {
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const action = String(body.action || "");
      const isCustomer = user.role === "CUSTOMER";
      const scopeCustomer = isCustomer ? (user.customerId ?? undefined) : undefined;
      if (isCustomer && !scopeCustomer) {
        return NextResponse.json(
          { success: false, error: "Account is not linked to a customer" },
          { status: 403 },
        );
      }

      if (action === "edit") {
        const items = Array.isArray(body.items)
          ? body.items.map((it: { palletId: string; units: number; uom: string }) => ({
              palletId: String(it.palletId),
              units: Number(it.units),
              uom: it.uom === "PALLET" ? "PALLET" : "UNIT",
            }))
          : [];
        if (items.length === 0) {
          return NextResponse.json(
            { success: false, error: "Select at least one pallet" },
            { status: 400 },
          );
        }
        const res = await editRequest({
          requestId: id,
          items,
          requestedDate: body.requestedDate ? new Date(body.requestedDate) : undefined,
          note: body.note != null ? String(body.note) : undefined,
          customerId: scopeCustomer,
        });
        return NextResponse.json({ success: true, ...res });
      }

      if (action === "cancel") {
        const res = await cancelRequest(id, scopeCustomer);
        return NextResponse.json({ success: true, ...res });
      }

      if (action === "delete") {
        // khách: scope theo customerId (chỉ xóa của mình, không xóa DONE);
        // staff: scopeCustomer undefined → xóa được mọi request.
        const res = await deleteRequest(id, scopeCustomer);
        return NextResponse.json({ success: true, ...res });
      }

      if (action === "customer_confirm") {
        // Phương án A: khách "Đồng ý" số cuối sau khi staff đã chốt (DONE).
        if (!isCustomer || !scopeCustomer) {
          return NextResponse.json(
            { success: false, error: "Not allowed" },
            { status: 403 },
          );
        }
        const res = await customerConfirm(id, scopeCustomer, user.username);
        return NextResponse.json({ success: true, ...res });
      }

      if (action === "confirm") {
        if (isCustomer) {
          return NextResponse.json(
            { success: false, error: "Not allowed" },
            { status: 403 },
          );
        }
        const confirmations =
          body.confirmations && typeof body.confirmations === "object"
            ? (body.confirmations as Record<string, number>)
            : undefined;
        const res = await confirmRequest({
          requestId: id,
          confirmations,
          confirmedBy: user.username,
        });
        return NextResponse.json({ success: true, ...res });
      }

      return NextResponse.json(
        { success: false, error: "Unknown action" },
        { status: 400 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"] },
);
