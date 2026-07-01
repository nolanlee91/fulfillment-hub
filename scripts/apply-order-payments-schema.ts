/**
 * Migration: tạo bảng con `order_payments` (1 dòng / khoản thanh toán) + backfill
 * từ các cột reconciliation cũ trên `orders`.
 *
 * Trước đây mỗi đơn chỉ lưu 1 khoản đối soát trực tiếp trên `orders`. Giờ 1 đơn
 * có thể có NHIỀU khoản (khách trả nhiều lần) → tách bảng con. Cột cũ trên `orders`
 * giữ lại làm summary denormalized (recompute qua recomputeOrderReconSummary).
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + backfill chỉ khi bảng đang rỗng.
 * Chạy: npx tsx --env-file=.env.local scripts/apply-order-payments-schema.ts
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating order_payments table...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_payments (
      id                TEXT PRIMARY KEY,
      order_unique_key  TEXT NOT NULL REFERENCES orders(unique_key) ON DELETE CASCADE,
      payment_type      TEXT NOT NULL,
      ref_number        TEXT,
      payment_proof_url TEXT,
      reconciled_at     TIMESTAMP NOT NULL DEFAULT now(),
      accounted_at      TIMESTAMP,
      accounted_by      TEXT,
      created_by        TEXT,
      created_at        TIMESTAMP NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS order_payments_order_idx ON order_payments (order_unique_key);
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS order_payments_ref_idx ON order_payments (ref_number);
  `);

  console.log("✓ Table + indexes ready");

  // Backfill — chỉ khi bảng đang rỗng (tránh nhân đôi nếu chạy lại sau khi đã dùng).
  const [{ count }] = (await db.execute(
    sql`SELECT count(*)::int AS count FROM order_payments;`,
  )) as unknown as Array<{ count: number }>;

  if (count > 0) {
    console.log(`✓ order_payments đã có ${count} dòng — bỏ qua backfill.`);
    process.exit(0);
  }

  console.log("Backfilling từ cột reconciliation cũ trên orders...");

  // Mỗi đơn có ref_number HOẶC payment_proof_url → 1 dòng payment. id ổn định theo
  // unique_key để chạy lại (nếu bảng rỗng) không tạo id ngẫu nhiên khác nhau.
  const res = await db.execute(sql`
    INSERT INTO order_payments (
      id, order_unique_key, payment_type, ref_number, payment_proof_url,
      reconciled_at, accounted_at, accounted_by, created_by, created_at
    )
    SELECT
      'pay_backfill_' || md5(o.unique_key),
      o.unique_key,
      COALESCE(o.payment_type, CASE WHEN o.ref_number IS NOT NULL THEN 'ETF' ELSE 'BANK_TRANSFER' END),
      o.ref_number,
      o.payment_proof_url,
      COALESCE(o.reconciled_at, now()),
      o.accounted_at,
      o.accounted_by,
      'backfill',
      COALESCE(o.reconciled_at, now())
    FROM orders o
    WHERE o.ref_number IS NOT NULL OR o.payment_proof_url IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  `);

  console.log("✓ Backfill xong:", res);

  const [{ total }] = (await db.execute(
    sql`SELECT count(*)::int AS total FROM order_payments;`,
  )) as unknown as Array<{ total: number }>;
  console.log(`✓ order_payments hiện có ${total} dòng.`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
