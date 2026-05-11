import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

const CreateCustomerSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id chỉ dùng a-z, 0-9, _"),
  name: z.string().min(1),
  active: z.boolean(),
});

const UpdateCustomerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
});

export const GET = withAuth(
  async () => {
    try {
      const rows = await db
        .select()
        .from(customers)
        .orderBy(asc(customers.id));
      return NextResponse.json({ success: true, data: rows });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);

export const POST = withAuth(
  async (req) => {
    try {
      const body = await req.json();
      const parsed = CreateCustomerSchema.parse(body);

      const existing = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, parsed.id))
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json(
          { success: false, error: `Mã khách hàng "${parsed.id}" đã tồn tại` },
          { status: 409 },
        );
      }

      await db.insert(customers).values({
        id: parsed.id,
        name: parsed.name,
        active: parsed.active,
      });

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);

export const PUT = withAuth(
  async (req) => {
    try {
      const body = await req.json();
      const parsed = UpdateCustomerSchema.parse(body);

      await db
        .update(customers)
        .set({ name: parsed.name, active: parsed.active })
        .where(eq(customers.id, parsed.id));

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      );
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
