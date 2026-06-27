import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { customers, storageCustomerRates } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { withAuth } from "@/lib/auth/api-guard";

const RatesSchema = z
  .object({
    handlingPerPallet: z.coerce.number().nonnegative(),
    handlingPerUnit: z.coerce.number().nonnegative(),
    storagePerWeek: z.coerce.number().nonnegative(),
    storagePerMonth: z.coerce.number().nonnegative(),
    basis: z.enum(["WEEK", "MONTH"]),
  })
  .optional();

const CreateCustomerSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id chỉ dùng a-z, 0-9, _"),
  name: z.string().min(1),
  active: z.boolean(),
  fulfillmentEnabled: z.boolean().optional().default(true),
  storageEnabled: z.boolean().optional().default(false),
  rates: RatesSchema,
});

const UpdateCustomerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  active: z.boolean(),
  fulfillmentEnabled: z.boolean().optional().default(true),
  storageEnabled: z.boolean().optional().default(false),
  rates: RatesSchema,
});

/** Upsert rate row cho khách storage (giá trị string cho cột numeric). */
async function upsertRates(
  customerId: string,
  rates: NonNullable<z.infer<typeof RatesSchema>> | undefined,
) {
  const values = {
    customerId,
    ...(rates
      ? {
          handlingPerPallet: String(rates.handlingPerPallet),
          handlingPerUnit: String(rates.handlingPerUnit),
          storagePerWeek: String(rates.storagePerWeek),
          storagePerMonth: String(rates.storagePerMonth),
          basis: rates.basis,
        }
      : {}),
    updatedAt: new Date(),
  };
  await db
    .insert(storageCustomerRates)
    .values(values)
    .onConflictDoUpdate({ target: storageCustomerRates.customerId, set: values });
}

export const GET = withAuth(
  async () => {
    try {
      const rows = await db
        .select({
          id: customers.id,
          name: customers.name,
          active: customers.active,
          fulfillmentEnabled: customers.fulfillmentEnabled,
          storageEnabled: customers.storageEnabled,
          createdAt: customers.createdAt,
          handlingPerPallet: storageCustomerRates.handlingPerPallet,
          handlingPerUnit: storageCustomerRates.handlingPerUnit,
          storagePerWeek: storageCustomerRates.storagePerWeek,
          storagePerMonth: storageCustomerRates.storagePerMonth,
          basis: storageCustomerRates.basis,
        })
        .from(customers)
        .leftJoin(storageCustomerRates, eq(customers.id, storageCustomerRates.customerId))
        .orderBy(asc(customers.id));
      return NextResponse.json({ success: true, data: rows });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);

export const POST = withAuth(
  async (req) => {
    try {
      const parsed = CreateCustomerSchema.parse(await req.json());

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
        fulfillmentEnabled: parsed.fulfillmentEnabled,
        storageEnabled: parsed.storageEnabled,
      });
      if (parsed.storageEnabled) await upsertRates(parsed.id, parsed.rates);

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);

export const PUT = withAuth(
  async (req) => {
    try {
      const parsed = UpdateCustomerSchema.parse(await req.json());

      await db
        .update(customers)
        .set({
          name: parsed.name,
          active: parsed.active,
          fulfillmentEnabled: parsed.fulfillmentEnabled,
          storageEnabled: parsed.storageEnabled,
        })
        .where(eq(customers.id, parsed.id));
      if (parsed.storageEnabled) await upsertRates(parsed.id, parsed.rates);

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
