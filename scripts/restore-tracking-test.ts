/**
 * Khôi phục đơn FitBbiL7KR về trạng thái trước khi seed test:
 *   - tracking_number = 1031358490638201 (giá trị gốc)
 *   - status = LABEL_CREATED
 *   - last_tracking_event/at, delivered_at = NULL
 */
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const result = await sql`
    UPDATE orders
    SET tracking_number = '1031358490638201',
        status = 'LABEL_CREATED',
        last_tracking_event = NULL,
        last_tracking_at = NULL,
        delivered_at = NULL,
        updated_at = now()
    WHERE unique_key = 'venatureco_fitgum_acai_FitBbiL7KR'
    RETURNING unique_key, order_id, status, tracking_number
  `;

  if (result.length === 0) {
    console.log("Không tìm thấy đơn FitBbiL7KR — có thể đã bị xóa/đổi tên.");
  } else {
    console.log("✅ Đã khôi phục:");
    for (const r of result) {
      console.log(`   ${r.unique_key}: status=${r.status}, tracking=${r.tracking_number}`);
    }
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
