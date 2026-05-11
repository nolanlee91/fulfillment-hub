import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, customers, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UpdateUserSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["STAFF", "CUSTOMER"]),
  customerId: z.string().nullable().optional(),
  active: z.boolean(),
});

export const PATCH = withAuth<RouteContext>(
  async (req, currentUser, ctx) => {
    try {
      const { id: targetId } = await ctx.params;

      if (targetId === currentUser.id) {
        return NextResponse.json(
          { success: false, error: "Không được tự sửa tài khoản của chính mình" },
          { status: 403 },
        );
      }

      const target = await db
        .select({
          id: users.id,
          role: users.role,
          active: users.active,
        })
        .from(users)
        .where(eq(users.id, targetId))
        .limit(1);
      if (target.length === 0) {
        return NextResponse.json(
          { success: false, error: "Không tìm thấy tài khoản" },
          { status: 404 },
        );
      }
      if (target[0].role === "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: "Không thể sửa tài khoản SUPER_ADMIN" },
          { status: 403 },
        );
      }

      const body = await req.json();
      const parsed = UpdateUserSchema.parse(body);

      // Role-specific customerId validation
      let customerId: string | null = null;
      if (parsed.role === "CUSTOMER") {
        if (!parsed.customerId) {
          return NextResponse.json(
            { success: false, error: "Tài khoản CUSTOMER phải gán khách hàng" },
            { status: 400 },
          );
        }
        const cust = await db
          .select({ id: customers.id, active: customers.active })
          .from(customers)
          .where(eq(customers.id, parsed.customerId))
          .limit(1);
        if (cust.length === 0) {
          return NextResponse.json(
            { success: false, error: `Khách hàng "${parsed.customerId}" không tồn tại` },
            { status: 400 },
          );
        }
        if (!cust[0].active) {
          return NextResponse.json(
            { success: false, error: `Khách hàng "${parsed.customerId}" đang inactive` },
            { status: 400 },
          );
        }
        customerId = parsed.customerId;
      }

      await db
        .update(users)
        .set({
          name: parsed.name,
          role: parsed.role,
          customerId,
          active: parsed.active,
        })
        .where(eq(users.id, targetId));

      // Nếu vừa bị disable → kill session
      if (target[0].active && !parsed.active) {
        await db.delete(sessions).where(eq(sessions.userId, targetId));
      }

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      );
    }
  },
  { roles: ["SUPER_ADMIN"] },
);
