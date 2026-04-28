import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

const UpdateProductSchema = z.object({
  id: z.string().min(1),
  unitWeightLb: z.number().nonnegative(),
  active: z.boolean(),
});

export async function GET() {
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
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = UpdateProductSchema.parse(body);

    await db
      .update(products)
      .set({
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
}
