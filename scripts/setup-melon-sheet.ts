/**
 * Tạo tab "Melon" trong file Venatureco, clone cấu trúc + công thức từ tab
 * "Fitgum ACAI". Chỉ đổi:
 *   - Header cột số lượng (Q): "Fitgum ACAI" -> "Melon"
 *   - Công thức #COMPANYNAME (H): nhãn "ACAI" -> "MELON"
 * Giữ nguyên: IMPORTRANGE tracking (Z..AC), cân nặng (AD), ETF (AE),
 * phí xử lý (AF), phí ship (AG). Pre-fill công thức xuống FILL_TO dòng.
 *
 * Đọc công thức TRỰC TIẾP từ ACAI (FORMULA) để khớp đúng locale (`;` + `,`).
 * Idempotent: nếu tab "Melon" đã tồn tại -> dừng, không tạo trùng.
 *
 * Chạy: npx tsx --env-file=.env.local scripts/setup-melon-sheet.ts
 */
import {
  readSheet,
  writeRange,
  addSheet,
  copyPasteRange,
  getSpreadsheetMeta,
} from "../lib/sheets/client";

const SPREADSHEET_ID = "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE";
const SRC_TAB = "Fitgum ACAI";
const NEW_TAB = "Melon";

const QTY_COL = 16; // cột Q = header tên sản phẩm / số lượng
const COMPANY_COL = 7; // cột H = #COMPANYNAME (formula)
const ETF_COL = 30; // cột AE = Hình thức TT = "ETF"
const NUM_COLS = 40; // A..AN
const FILL_TO = 500; // pre-fill công thức tới dòng 500

function colLetter(index: number): string {
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

async function main() {
  // 0. Guard: tab đã tồn tại chưa?
  const meta = await getSpreadsheetMeta(SPREADSHEET_ID);
  if (meta.sheets.some((s) => s.title === NEW_TAB)) {
    console.log(`✗ Tab "${NEW_TAB}" đã tồn tại — dừng (không tạo trùng).`);
    process.exit(0);
  }

  // 1. Đọc header + template row 2 của ACAI ở dạng FORMULA
  const header = (await readSheet(SPREADSHEET_ID, SRC_TAB, "FORMULA"))[0] ?? [];
  const tmplRow = (await readSheet(SPREADSHEET_ID, SRC_TAB, "FORMULA"))[1] ?? [];

  // 2. Build header Melon (copy ACAI, đổi cột số lượng)
  const newHeader: (string | number)[] = [];
  for (let i = 0; i < NUM_COLS; i++) newHeader[i] = header[i] ?? "";
  newHeader[QTY_COL] = "Melon";

  // 3. Build template row 2: chỉ giữ ô là CÔNG THỨC (bắt đầu "=") + ô ETF;
  //    còn lại để trống (cột nhập liệu). Đổi nhãn ACAI->MELON ở công thức H.
  const newTmpl: (string | number | null)[] = [];
  for (let i = 0; i < NUM_COLS; i++) {
    const cell = tmplRow[i];
    const isFormula = typeof cell === "string" && cell.startsWith("=");
    if (isFormula) {
      newTmpl[i] = i === COMPANY_COL ? String(cell).replace("ACAI", "MELON") : cell;
    } else if (i === ETF_COL) {
      newTmpl[i] = "ETF";
    } else {
      newTmpl[i] = "";
    }
  }

  const last = colLetter(NUM_COLS - 1); // "AN"
  console.log("Header Melon (cột số lượng):", JSON.stringify(newHeader[QTY_COL]));
  console.log("Công thức #COMPANYNAME (H):", JSON.stringify(newTmpl[COMPANY_COL]));
  console.log(
    "Các cột có công thức/ETF:",
    newTmpl
      .map((c, i) => (c !== "" ? colLetter(i) : null))
      .filter(Boolean)
      .join(", "),
  );

  // 4. Tạo tab mới
  const sheetId = await addSheet(SPREADSHEET_ID, NEW_TAB, {
    rowCount: 1000,
    columnCount: 45,
  });
  console.log(`✓ Đã tạo tab "${NEW_TAB}" (sheetId=${sheetId})`);

  // 5. Ghi header (row 1) + template (row 2)
  await writeRange(SPREADSHEET_ID, `'${NEW_TAB}'!A1:${last}1`, [newHeader]);
  await writeRange(SPREADSHEET_ID, `'${NEW_TAB}'!A2:${last}2`, [newTmpl]);
  console.log("✓ Ghi header + template row 2");

  // 6. Fill-down công thức row 2 -> row 3..FILL_TO (copyPaste tự chỉnh tham chiếu)
  await copyPasteRange(
    SPREADSHEET_ID,
    { sheetId, startRow: 1, endRow: 2, startCol: 0, endCol: NUM_COLS },
    { sheetId, startRow: 2, endRow: FILL_TO, startCol: 0, endCol: NUM_COLS },
  );
  console.log(`✓ Fill-down công thức tới dòng ${FILL_TO}`);

  console.log("\nHOÀN TẤT tạo tab Melon. Bước tiếp: chạy setup-melon-db.ts");
  process.exit(0);
}
main().catch((e) => {
  console.error("ERR:", e?.message || e);
  process.exit(1);
});
