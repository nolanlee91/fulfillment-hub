/**
 * Onboard khách BOBOBU — COD, 1 sheet "KDE Đóng hàng" nhiều mặt hàng.
 * Cách xử lý: gộp thành 1 product, box cố định B, tên SP đã có ở cột #COMPANYNAME (formula).
 *
 * Tạo: customer + 1 product (cân nặng ~80g/hộp) + source_sheet + box_rule (→ B).
 * Idempotent: onConflictDoNothing.
 * Chạy: npx tsx --env-file=.env.local scripts/setup-bobobu.ts
 */
import { db } from "@/lib/db";
import { customers, products, sourceSheets, boxRules } from "@/lib/db/schema";

const CUSTOMER_ID = "bobobu";
const PRODUCT_ID = "bobobu";
const SPREADSHEET_ID = "1erDzUshTjV178h00ncSSrqPtsPmH6of64NqojpaN1H0";
// Tên tab thật có DẤU CÁCH ở cuối: "KDE Đóng hàng " (giữ đúng để khớp Google Sheets API)
const SHEET_NAME = "KDE Đóng hàng ";
// 80g/hộp → lb (80 / 453.592)
const UNIT_WEIGHT_LB = "0.1764";

async function main() {
  await db.insert(customers).values({
    id: CUSTOMER_ID,
    name: "BOBOBU",
    active: true,
  }).onConflictDoNothing();
  console.log("✓ customer");

  await db.insert(products).values({
    id: PRODUCT_ID,
    name: "BOBOBU (KDE đóng hàng)",
    customerId: CUSTOMER_ID,
    unitWeightLb: UNIT_WEIGHT_LB,
    active: true,
  }).onConflictDoNothing();
  console.log("✓ product (unitWeightLb=" + UNIT_WEIGHT_LB + ")");

  await db.insert(sourceSheets).values({
    id: "bobobu_kde",
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    spreadsheetId: SPREADSHEET_ID,
    sheetName: SHEET_NAME,
    active: true,
  }).onConflictDoUpdate({
    target: sourceSheets.id,
    set: { spreadsheetId: SPREADSHEET_ID, sheetName: SHEET_NAME, active: true },
  });
  console.log("✓ source_sheet ([" + SHEET_NAME + "])");

  await db.insert(boxRules).values({
    id: "bobobu_B",
    productId: PRODUCT_ID,
    boxCode: "B",
    maxQty: 9999,
    active: true,
  }).onConflictDoNothing();
  console.log("✓ box_rule (→ Box B)");

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
