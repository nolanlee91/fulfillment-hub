import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const rows = await sql`
    SELECT unique_key, order_id, customer_id, status, tracking_number,
           last_tracking_event, last_tracking_at, updated_at
    FROM orders
    WHERE tracking_number = '1031358360032207'
    ORDER BY updated_at DESC
  `;

  console.log(`Tìm thấy ${rows.length} đơn có tracking = 1031358360032207:\n`);
  for (const r of rows) {
    console.log(`  ${r.unique_key}`);
    console.log(`    orderId:       ${r.order_id}`);
    console.log(`    customer:      ${r.customer_id}`);
    console.log(`    status:        ${r.status}`);
    console.log(`    lastEvent:     ${r.last_tracking_event}`);
    console.log(`    lastAt:        ${r.last_tracking_at}`);
    console.log(`    updatedAt:     ${r.updated_at}`);
    console.log("");
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
