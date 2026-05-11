import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { boxRules, boxes, products } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

const UpdateRuleSchema = z.object({
  productId: z.string().min(1),
  boxCode: z.string().min(1),
  maxQty: z.number().int().nonnegative(),
});

/**
 * Trả về data dạng pivot:
 *  {
 *    products: [{ id, name }, ...],
 *    boxes: [{ code, name }, ...],
 *    rules: [{ productId, boxCode, maxQty }, ...]
 *  }
 */
export const GET = withAuth(
  async () => {
    try {
      const productList = await db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.active, true))
        .orderBy(asc(products.customerId), asc(products.name));

      const boxList = await db
        .select({ code: boxes.code, name: boxes.name })
        .from(boxes)
        .where(eq(boxes.active, true))
        .orderBy(asc(boxes.code));

      const rules = await db.select().from(boxRules);

      return NextResponse.json({
        success: true,
        data: {
          products: productList,
          boxes: boxList,
          rules: rules.map((r) => ({
            productId: r.productId,
            boxCode: r.boxCode,
            maxQty: r.maxQty,
          })),
        },
      });
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

export const PUT = withAuth(
  async (req) => {
    try {
      const body = await req.json();
      const parsed = UpdateRuleSchema.parse(body);

      await db
        .update(boxRules)
        .set({ maxQty: parsed.maxQty })
        .where(
          and(
            eq(boxRules.productId, parsed.productId),
            eq(boxRules.boxCode, parsed.boxCode),
          ),
        );

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
