import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { hashPassword } from "@/lib/auth/password";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ResetPasswordSchema = z.object({
  password: z.string().min(8, "password >= 8 ký tự"),
});

export const POST = withAuth<RouteContext>(
  async (req, currentUser, ctx) => {
    try {
      const { id: targetId } = await ctx.params;

      if (targetId === currentUser.id) {
        return NextResponse.json(
          { success: false, error: "Không được tự reset password của chính mình" },
          { status: 403 },
        );
      }

      const target = await db
        .select({ id: users.id, role: users.role })
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
          { success: false, error: "Không thể reset password tài khoản SUPER_ADMIN" },
          { status: 403 },
        );
      }

      const body = await req.json();
      const parsed = ResetPasswordSchema.parse(body);

      const passwordHash = await hashPassword(parsed.password);
      await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, targetId));

      // Kill tất cả session của user — buộc login lại với password mới
      await db.delete(sessions).where(eq(sessions.userId, targetId));

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
