/**
 * Helper test setup cho Phase A — Tracking events.
 *
 * Tìm 1 đơn bất kỳ trong DB, gán cho nó tracking number = PIN có trong file mẫu APT
 * "APT_0001031358_000000064_20260430_132710.csv", và set status thành LABEL_CREATED.
 *
 * Sau khi test xong, anh có thể chạy lại sync để khôi phục data từ Google Sheet,
 * hoặc kệ luôn (đơn này chỉ bị thay đổi tracking number tạm thời).
 */
import postgres from "postgres";

const TEST_TRACKING = "1031358360032207"; // PIN có trong file mẫu 064

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL chưa set trong .env.local");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function main() {
  // Lấy đơn đầu tiên còn "active" (chưa giao xong)
  const [target] = await sql<
    {
      uniqueKey: string;
      orderId: string;
      customerId: string;
      status: string;
      trackingNumber: string | null;
    }[]
  >`
    SELECT unique_key as "uniqueKey", order_id as "orderId", customer_id as "customerId",
           status, tracking_number as "trackingNumber"
    FROM orders
    WHERE status IN ('NEW', 'READY', 'EXPORTED', 'LABEL_CREATED', 'ERROR', 'ERROR_UPDATED')
    ORDER BY synced_at DESC
    LIMIT 1
  `;

  if (!target) {
    console.error("❌ Không tìm thấy đơn nào trong DB. Cần sync đơn từ Google Sheet trước.");
    process.exit(1);
  }

  console.log("📦 Trước khi sửa:");
  console.log(`   uniqueKey:    ${target.uniqueKey}`);
  console.log(`   orderId:      ${target.orderId}`);
  console.log(`   customerId:   ${target.customerId}`);
  console.log(`   status:       ${target.status}`);
  console.log(`   trackingOld:  ${target.trackingNumber ?? "(null)"}`);

  await sql`
    UPDATE orders
    SET tracking_number = ${TEST_TRACKING},
        status = 'LABEL_CREATED',
        last_tracking_event = NULL,
        last_tracking_at = NULL,
        delivered_at = NULL,
        updated_at = now()
    WHERE unique_key = ${target.uniqueKey}
  `;

  console.log("\n✅ Đã sửa:");
  console.log(`   status:       LABEL_CREATED`);
  console.log(`   trackingNew:  ${TEST_TRACKING}`);

  console.log("\n📋 Tiếp theo:");
  console.log("   1. Mở http://localhost:3000/import-tracking");
  console.log("   2. Bấm tab 'Sự kiện vận chuyển (APT)'");
  console.log(
    "   3. Chọn file: C:/Users/User/Desktop/Thang Le/9. canada post/APT_0001031358_000000064_20260430_132710.csv",
  );
  console.log("   4. Bấm 'Cập nhật sự kiện'");
  console.log(
    "   5. Kết quả mong đợi: 1 đơn match, 1 đang giao (IN_TRANSIT), 0 đã giao, 0 thất bại",
  );
  console.log(
    "   6. Vào http://localhost:3000/orders, filter 'Đang giao' → thấy đơn đó",
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
