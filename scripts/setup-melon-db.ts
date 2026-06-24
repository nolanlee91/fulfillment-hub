/**
 * Onboard product "Melon" (Venatureco) vào DB — config-only, KHÔNG sửa code sync.
 * syncAllSheets + syncTrackingBatch đã generic (đọc theo source_sheets) nên chỉ
 * cần thêm: product + source_sheet (tab "Melon") + box_rules. App tự kéo đơn về
 * + ghi ngược tracking như mọi sheet khác.
 *
 * Mọi thông số = giống Fitgum Acai (đã chốt với user):
 *   - unitWeightLb 0.1246, payment Prepaid (mặc định), box A≤10/B≤20/C≤40/D≤70.
 *
 * Idempotent. Chạy: npx tsx --env-file=.env.local scripts/setup-melon-db.ts
 */
import { db } from "@/lib/db";
import { products, sourceSheets, boxRules } from "@/lib/db/schema";

const CUSTOMER_ID = "venatureco";
const PRODUCT_ID = "melon";
const SPREADSHEET_ID = "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE";
const SHEET_NAME = "Melon";
const UNIT_WEIGHT_LB = "0.1246"; // = Fitgum Acai

// Box tiers giống Fitgum Acai
const BOX_TIERS: Array<{ box: string; maxQty: number }> = [
  { box: "A", maxQty: 10 },
  { box: "B", maxQty: 20 },
  { box: "C", maxQty: 40 },
  { box: "D", maxQty: 70 },
];

async function main() {
  await db
    .insert(products)
    .values({
      id: PRODUCT_ID,
      name: "Melon",
      customerId: CUSTOMER_ID,
      unitWeightLb: UNIT_WEIGHT_LB,
      active: true,
    })
    .onConflictDoNothing();
  console.log(`✓ product ${PRODUCT_ID} (unitWeightLb=${UNIT_WEIGHT_LB})`);

  await db
    .insert(sourceSheets)
    .values({
      id: "venatureco_melon",
      customerId: CUSTOMER_ID,
      productId: PRODUCT_ID,
      spreadsheetId: SPREADSHEET_ID,
      sheetName: SHEET_NAME,
      active: true,
    })
    .onConflictDoUpdate({
      target: sourceSheets.id,
      set: { spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME, active: true },
    });
  console.log(`✓ source_sheet venatureco_melon ([${SHEET_NAME}])`);

  for (const t of BOX_TIERS) {
    await db
      .insert(boxRules)
      .values({
        id: `${PRODUCT_ID}_${t.box}`,
        productId: PRODUCT_ID,
        boxCode: t.box,
        maxQty: t.maxQty,
        active: true,
      })
      .onConflictDoNothing();
  }
  console.log(`✓ box_rules ${BOX_TIERS.map((t) => `${t.box}≤${t.maxQty}`).join(", ")}`);

  process.exit(0);
}
main().catch((e) => {
  console.error("ERR:", e?.message || e);
  process.exit(1);
});
