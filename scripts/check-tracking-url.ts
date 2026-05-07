import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const samples = await db.execute(sql`
    SELECT order_id, payment_method, shipping_carrier, tracking_number, tracking_url
    FROM orders
    WHERE tracking_url IS NOT NULL
    LIMIT 5
  `);
  console.log("Sample đơn có trackingUrl:");
  for (const row of (samples as unknown as { order_id: string; payment_method: string; shipping_carrier: string; tracking_number: string; tracking_url: string }[])) {
    console.log(`  ${row.order_id} | ${row.payment_method} | ${row.shipping_carrier} | ${row.tracking_number}`);
    console.log(`    URL: ${row.tracking_url}`);
  }

  console.log("\nSample đơn có tracking_number nhưng KHÔNG có URL (đoán EST/COD):");
  const noUrl = await db.execute(sql`
    SELECT order_id, payment_method, shipping_carrier, tracking_number
    FROM orders
    WHERE tracking_number IS NOT NULL AND tracking_url IS NULL
    LIMIT 5
  `);
  for (const row of (noUrl as unknown as { order_id: string; payment_method: string; shipping_carrier: string; tracking_number: string }[])) {
    console.log(`  ${row.order_id} | ${row.payment_method} | ${row.shipping_carrier} | ${row.tracking_number}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
