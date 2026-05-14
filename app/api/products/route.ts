import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products, customers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

const UpdateProductSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Tên sản phẩm không được để trống"),
  unitWeightLb: z.number().nonnegative(),
  active: z.boolean(),
});

const CreateProductSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id chỉ dùng a-z, 0-9, _"),
  name: z.string().min(1),
  customerId: z.string().min(1),
  unitWeightLb: z.number().nonnegative(),
  active: z.boolean(),
});

export const GET = withAuth(
  async () => {
    try {
      const rows = await db
        .select()
        .from(products)
        .orderBy(asc(products.customerId), asc(products.name));
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
      const parsed = CreateProductSchema.parse(body);

      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, parsed.id))
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json(
          { success: false, error: `Mã sản phẩm "${parsed.id}" đã tồn tại` },
          { status: 409 },
        );
      }

      const customerExists = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, parsed.customerId))
        .limit(1);
      if (customerExists.length === 0) {
        return NextResponse.json(
          { success: false, error: `Khách hàng "${parsed.customerId}" không tồn tại` },
          { status: 400 },
        );
      }

      await db.insert(products).values({
        id: parsed.id,
        name: parsed.name,
        customerId: parsed.customerId,
        unitWeightLb: parsed.unitWeightLb.toString(),
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
      const parsed = UpdateProductSchema.parse(body);

      await db
        .update(products)
        .set({
          name: parsed.name,
          unitWeightLb: parsed.unitWeightLb.toString(),
          active: parsed.active,
        })
        .where(eq(products.id, parsed.id));

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
