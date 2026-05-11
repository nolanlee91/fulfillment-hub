import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, customers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";
import { hashPassword } from "@/lib/auth/password";

const CreateUserSchema = z.object({
  username: z.string().min(3).max(40).regex(/^[a-z0-9_.]+$/, "username chỉ dùng a-z, 0-9, _, ."),
  password: z.string().min(8, "password >= 8 ký tự"),
  name: z.string().min(1),
  role: z.enum(["STAFF", "CUSTOMER"]),
  customerId: z.string().nullable().optional(),
});

export const GET = withAuth(
  async () => {
    try {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          role: users.role,
          customerId: users.customerId,
          customerName: customers.name,
          active: users.active,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .leftJoin(customers, eq(users.customerId, customers.id))
        .orderBy(asc(users.createdAt));

      return NextResponse.json({ success: true, data: rows });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["SUPER_ADMIN"] },
);

export const POST = withAuth(
  async (req) => {
    try {
      const body = await req.json();
      const parsed = CreateUserSchema.parse(body);

      // Username unique
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, parsed.username))
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json(
          { success: false, error: `Tên đăng nhập "${parsed.username}" đã tồn tại` },
          { status: 409 },
        );
      }

      // Role-specific validation
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
      // STAFF: customerId luôn null (auto-clean)

      const id = randomBytes(12).toString("hex");
      const passwordHash = await hashPassword(parsed.password);

      await db.insert(users).values({
        id,
        username: parsed.username,
        passwordHash,
        name: parsed.name,
        role: parsed.role,
        customerId,
        active: true,
      });

      return NextResponse.json({ success: true, id });
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
