import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, customers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserId } from "./session";

export type Role = "SUPER_ADMIN" | "STAFF" | "CUSTOMER";

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  customerId: string | null;
  // Dịch vụ khách được dùng (quyết định menu). Staff/Admin = cả hai (thấy tất cả).
  fulfillmentEnabled: boolean;
  storageEnabled: boolean;
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

  // Staff/Admin thấy tất cả; CUSTOMER theo cờ dịch vụ của khách họ thuộc về.
  let fulfillmentEnabled = true;
  let storageEnabled = true;
  if (row.role === "CUSTOMER" && row.customerId) {
    const [cust] = await db
      .select({
        fulfillmentEnabled: customers.fulfillmentEnabled,
        storageEnabled: customers.storageEnabled,
      })
      .from(customers)
      .where(eq(customers.id, row.customerId))
      .limit(1);
    fulfillmentEnabled = cust?.fulfillmentEnabled ?? true;
    storageEnabled = cust?.storageEnabled ?? false;
  }

  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    customerId: row.customerId,
    fulfillmentEnabled,
    storageEnabled,
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

/**
 * Dùng trong Server Component (page.tsx) — redirect nếu role không phù hợp.
 * Khác requireRole ở chỗ: không throw, mà redirect về fallback (mặc định /orders).
 */
export async function requirePageRole(
  allowed: Role[],
  fallback = "/orders",
): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!allowed.includes(u.role)) redirect(fallback);
  return u;
}

/** Trang chủ đúng theo dịch vụ: storage-only khách → /my-storage; còn lại → /orders; staff → /dashboard. */
export function customerHome(user: CurrentUser): string {
  if (user.role !== "CUSTOMER") return "/dashboard";
  if (!user.fulfillmentEnabled && user.storageEnabled) return "/my-storage";
  return "/orders";
}
