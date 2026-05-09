import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserId } from "./session";

export type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  customerId: string | null;
}

/**
 * Đọc user hiện tại từ session cookie. Trả về null nếu chưa login / session expired / user inactive.
 * Dùng trong Server Component, Server Action, Route Handler.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      role: users.role,
      customerId: users.customerId,
      active: users.active,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active) return null;

  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    customerId: row.customerId,
  };
}

/**
 * Throw nếu chưa auth — dùng trong API route hoặc Server Action cần guard.
 */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHORIZED");
  return u;
}

/**
 * Throw nếu role không nằm trong allowed list.
 */
export async function requireRole(allowed: Role[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!allowed.includes(u.role)) throw new Error("FORBIDDEN");
  return u;
}
