import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const LoginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = LoginSchema.parse(body);

    const rows = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        active: users.active,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    const row = rows[0];

    if (!row || !row.active) {
      return NextResponse.json(
        { success: false, error: "Tài khoản hoặc mật khẩu không đúng" },
        { status: 401 },
      );
    }

    const ok = await verifyPassword(password, row.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Tài khoản hoặc mật khẩu không đúng" },
        { status: 401 },
      );
    }

    await createSession(row.id);
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, row.id));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 },
    );
  }
}
