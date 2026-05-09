import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq, lt } from "drizzle-orm";
import { SESSION_COOKIE } from "./constants";

export { SESSION_COOKIE };
const SESSION_DAYS = 30;

function newSessionId(): string {
  return randomBytes(32).toString("hex");
}

function expiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Tạo session mới + set cookie. Phải gọi trong Server Action / Route Handler.
 */
export async function createSession(userId: string): Promise<string> {
  const id = newSessionId();
  const expiresAt = expiry();
  await db.insert(sessions).values({ id, userId, expiresAt });

  const c = await cookies();
  c.set(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

/**
 * Đọc session id từ cookie. Trả về null nếu không có / hết hạn.
 * Lookup DB + check expires_at. Nếu expired thì xóa luôn.
 */
export async function getSessionUserId(): Promise<string | null> {
  const c = await cookies();
  const sid = c.get(SESSION_COOKIE)?.value;
  if (!sid) return null;

  const rows = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.id, sid))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sid));
    return null;
  }
  return row.userId;
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  const sid = c.get(SESSION_COOKIE)?.value;
  if (sid) {
    await db.delete(sessions).where(eq(sessions.id, sid));
  }
  c.delete(SESSION_COOKIE);
}

/**
 * Cleanup session đã hết hạn — gọi tùy ý từ cron.
 */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return result.length;
}
