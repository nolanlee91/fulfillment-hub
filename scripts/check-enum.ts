import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    SELECT pg_type.typname AS enum_name, enumlabel, enumsortorder
    FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname IN ('order_status', 'payment_method', 'platform', 'attention_reason')
    ORDER BY pg_type.typname, enumsortorder;
  `);
  console.log("Existing enums in DB:");
  for (const row of (result as unknown as { typname?: string; enum_name?: string; enumlabel: string; enumsortorder: number }[])) {
    const name = row.enum_name ?? row.typname;
    console.log(`  ${name}.${row.enumlabel} (order ${row.enumsortorder})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
