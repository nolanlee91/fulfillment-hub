/**
 * Seed initial data vào Postgres.
 *
 * Chạy: npm run seed
 *
 * Insert:
 *  - 3 customers (Venatureco, Skylane, CosmeticsTuanlx)
 *  - 13 products
 *  - 13 source_sheets (config 13 sheet nguồn)
 *  - 4 boxes (placeholder, dimension điền sau ở Settings UI)
 *  - 52 box_rules (skeleton, max_qty điền sau ở Settings UI)
 *
 * Idempotent: chạy nhiều lần không tạo bản ghi trùng (dùng ON CONFLICT DO NOTHING).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "../lib/db";
import {
  customers,
  products,
  sourceSheets,
  boxes,
  boxRules,
} from "../lib/db/schema";

// ============================================================================
// DATA
// ============================================================================

const CUSTOMERS = [
  { id: "venatureco", name: "Venatureco" },
  { id: "skylane", name: "Skylane" },
  { id: "cosmeticstuanlx", name: "CosmeticsTuanlx" },
];

const PRODUCTS = [
  { id: "fitgum", name: "Fitgum", customerId: "venatureco" },
  { id: "baku", name: "Baku", customerId: "venatureco" },
  { id: "fitgum_acai", name: "Fitgum Acai", customerId: "venatureco" },
  { id: "bona", name: "Bona", customerId: "venatureco" },
  { id: "brusko", name: "Brusko", customerId: "venatureco" },
  { id: "kidney", name: "Kidney", customerId: "venatureco" },
  { id: "dragon", name: "Dragon", customerId: "venatureco" },
  { id: "nails", name: "Nails", customerId: "venatureco" },
  { id: "kinoki", name: "Kinoki", customerId: "venatureco" },
  { id: "bodytrang", name: "Bodytrang", customerId: "venatureco" },
  { id: "glow", name: "Glow", customerId: "skylane" },
  { id: "cream", name: "Cream", customerId: "skylane" },
  { id: "cosmetics", name: "Cosmetics", customerId: "cosmeticstuanlx" },
];

const SOURCE_SHEETS = [
  { customerId: "venatureco", productId: "fitgum",       spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "FITGUM 1" },
  { customerId: "venatureco", productId: "baku",         spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "BAKU 2" },
  { customerId: "venatureco", productId: "fitgum_acai",  spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "Fitgum ACAI" },
  { customerId: "venatureco", productId: "bona",         spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "BONA CF" },
  { customerId: "venatureco", productId: "brusko",       spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "BRUSKO CF " },
  { customerId: "venatureco", productId: "kidney",       spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "KẸO KIDNEY" },
  { customerId: "venatureco", productId: "dragon",       spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "DRAGON" },
  { customerId: "venatureco", productId: "nails",        spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "Nail" },
  { customerId: "venatureco", productId: "kinoki",       spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "Dán Kinoki" },
  { customerId: "venatureco", productId: "bodytrang",    spreadsheetId: "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE", sheetName: "BODY trắng 3" },
  { customerId: "skylane",    productId: "glow",         spreadsheetId: "1CgKDh_YJ7h_sC0DtdzWBGlxCLJbkPQf8pCFwdzY5oBg", sheetName: "GLOW" },
  { customerId: "skylane",    productId: "cream",        spreadsheetId: "1CgKDh_YJ7h_sC0DtdzWBGlxCLJbkPQf8pCFwdzY5oBg", sheetName: "CREAM DERMATITIS" },
  { customerId: "cosmeticstuanlx", productId: "cosmetics", spreadsheetId: "1HDPFlFkRu-auMCtDzqa6PvcYOz71nJ7WzLdyMch9GZc", sheetName: "KDE đóng" },
];

const BOXES = [
  { code: "A", name: "Box A" },
  { code: "B", name: "Box B" },
  { code: "C", name: "Box C" },
  { code: "D", name: "Box D" },
];

// ============================================================================
// SEED
// ============================================================================

async function seed() {
  console.log("🌱 Starting seed...\n");

  // 1. Customers
  console.log("→ Inserting customers...");
  await db
    .insert(customers)
    .values(CUSTOMERS)
    .onConflictDoNothing();
  console.log(`  ✓ ${CUSTOMERS.length} customers`);

  // 2. Products
  console.log("→ Inserting products...");
  await db
    .insert(products)
    .values(PRODUCTS)
    .onConflictDoNothing();
  console.log(`  ✓ ${PRODUCTS.length} products`);

  // 3. Source Sheets
  console.log("→ Inserting source sheets...");
  const sourceSheetRows = SOURCE_SHEETS.map((s) => ({
    id: `${s.customerId}_${s.productId}`,
    customerId: s.customerId,
    productId: s.productId,
    spreadsheetId: s.spreadsheetId,
    sheetName: s.sheetName,
  }));
  await db
    .insert(sourceSheets)
    .values(sourceSheetRows)
    .onConflictDoNothing();
  console.log(`  ✓ ${sourceSheetRows.length} source sheets`);

  // 4. Boxes (placeholder - dimension ép default 0, sửa ở UI sau)
  console.log("→ Inserting boxes (placeholder)...");
  const boxRows = BOXES.map((b) => ({
    code: b.code,
    name: b.name,
    lengthIn: "0",
    widthIn: "0",
    heightIn: "0",
    emptyWeightLb: "0",
  }));
  await db
    .insert(boxes)
    .values(boxRows)
    .onConflictDoNothing();
  console.log(`  ✓ ${BOXES.length} boxes`);

  // 5. Box Rules skeleton (max_qty default 0, sửa ở UI sau)
  // Insert all combos product × box
  console.log("→ Inserting box rules skeleton...");
  const ruleRows: Array<{ id: string; productId: string; boxCode: string; maxQty: number }> = [];
  for (const p of PRODUCTS) {
    for (const b of BOXES) {
      ruleRows.push({
        id: `${p.id}_${b.code}`,
        productId: p.id,
        boxCode: b.code,
        maxQty: 0,
      });
    }
  }
  await db
    .insert(boxRules)
    .values(ruleRows)
    .onConflictDoNothing();
  console.log(`  ✓ ${ruleRows.length} box rules`);

  console.log("\n✅ Seed complete!");
  console.log("\nNext steps:");
  console.log("  1. Run `npm run db:studio` to open Drizzle Studio");
  console.log("  2. Verify data in tables: customers, products, boxes, box_rules");
  console.log("  3. (Or wait for Settings UI to edit dimensions/max_qty)\n");

  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
