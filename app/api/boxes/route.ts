import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { boxes } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

const UpdateBoxSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  lengthIn: z.number().nonnegative(),
  widthIn: z.number().nonnegative(),
  heightIn: z.number().nonnegative(),
  emptyWeightLb: z.number().nonnegative(),
  active: z.boolean(),
});

export const GET = withAuth(
  async () => {
    try {
      const rows = await db
        .select()
        .from(boxes)
        .orderBy(asc(boxes.code));
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

export const PUT = withAuth(
  async (req) => {
    try {
      const body = await req.json();
      const parsed = UpdateBoxSchema.parse(body);

      await db
        .update(boxes)
        .set({
          name: parsed.name,
          lengthIn: parsed.lengthIn.toString(),
          widthIn: parsed.widthIn.toString(),
          heightIn: parsed.heightIn.toString(),
          emptyWeightLb: parsed.emptyWeightLb.toString(),
          active: parsed.active,
        })
        .where(eq(boxes.code, parsed.code));

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
