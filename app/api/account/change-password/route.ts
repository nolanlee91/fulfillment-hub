import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE } from "@/lib/auth/constants";

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại"),
    newPassword: z.string().min(8, "Mật khẩu mới >= 8 ký tự"),
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"],
  });

export const POST = withAuth(async (req, user) => {
  try {
    const body = await req.json();
    const { currentPassword, newPassword } = ChangePasswordSchema.parse(body);

    const rows = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy tài khoản" },
        { status: 404 },
      );
    }

    const ok = await verifyPassword(currentPassword, rows[0].passwordHash);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Mật khẩu hiện tại không đúng" },
        { status: 400 },
      );
    }

    const newHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));

    const c = await cookies();
    const currentSid = c.get(SESSION_COOKIE)?.value ?? "";
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSid)));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Dữ liệu không hợp lệ" },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
