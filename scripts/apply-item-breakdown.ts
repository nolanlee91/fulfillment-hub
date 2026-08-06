/**
 * Migration: cột orders.item_breakdown (jsonb) — chia số lượng từng loại cho tab
 * nhiều mặt hàng (vd Baku = Serum + Cream). + tạo 2 product tồn kho baku_serum/baku_cream.
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/apply-item-breakdown.ts
 */
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  // 1. Cột item_breakdown
  await db.execute(sql`
    ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS item_breakdown JSONB;
  `);
  console.log("✓ orders.item_breakdown ready");

  // 2. 2 product tồn kho cho Baku (cùng nhãn, cùng cỡ → cùng cân nặng 0.244 lb)
  const variants = [
    { id: "baku_serum", name: "Baku Serum" },
    { id: "baku_cream", name: "Baku Cream" },
  ];
  for (const v of variants) {
    await db
      .insert(products)
      .values({
        id: v.id,
        name: v.name,
        customerId: "venatureco",
        unitWeightLb: "0.2440",
        active: true,
      })
      .onConflictDoNothing({ target: products.id });
    console.log(`✓ product ${v.id} (${v.name})`);
  }

  console.log("\nDONE. Bay gio bat tracking baku_serum/baku_cream o trang Inventory + dem so.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
