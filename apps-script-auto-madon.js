// ====================================================================
// AUTO-SINH "MÃ ĐƠN HÀNG" KHI NHẬP NAME  (TuanLX — 3 tab)
//   - Tab "KDE đóng"        -> TUAN001, TUAN002, ...
//   - Tab "KDE đóng Lotion"  -> HALLY001, HALLY002, ...
//   - Tab "Dầu Gội"          -> DAUGOI001, DAUGOI002, ...
// Cài: Sheet -> Extensions -> Apps Script -> THAY TOÀN BỘ bằng file này -> Save.
// ====================================================================

// Cấu hình các tab cần auto-sinh mã — thêm tab mới chỉ cần thêm 1 dòng
const CONFIG = {
  "KDE đóng":        { prefix: "TUAN",   pad: 3 },
  "KDE đóng Lotion": { prefix: "HALLY",  pad: 3 },
  "Dầu Gội":         { prefix: "DAUGOI", pad: 3 },
};
const NAME_COL = 5;   // cột E = Name (trigger)
const CODE_COL = 2;   // cột B = Mã đơn hàng (write)

function onEdit(e) {
  const sh = e.range.getSheet();
  const cfg = CONFIG[sh.getName()];
  if (!cfg) return;

  const startRow = Math.max(e.range.getRow(), 2);
  const endRow   = e.range.getLastRow();
  const startCol = e.range.getColumn();
  const endCol   = e.range.getLastColumn();

  // chỉ chạy nếu edit overlap cột Name
  if (NAME_COL < startCol || NAME_COL > endCol) return;
  if (endRow < 2) return;

  const numRows = endRow - startRow + 1;
  const names   = sh.getRange(startRow, NAME_COL, numRows, 1).getValues();
  const codes   = sh.getRange(startRow, CODE_COL, numRows, 1).getValues();

  // tìm max suffix số trong toàn cột B của tab đó
  const lastRow = sh.getLastRow();
  let max = 0;
  if (lastRow >= 2) {
    const all = sh.getRange(2, CODE_COL, lastRow - 1, 1).getValues();
    for (const [v] of all) {
      const m = String(v).match(/(\d+)$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }

  // điền mã cho row có Name nhưng chưa có Mã
  let changed = false;
  for (let i = 0; i < numRows; i++) {
    if (names[i][0] && !codes[i][0]) {
      max += 1;
      codes[i][0] = cfg.prefix + String(max).padStart(cfg.pad, "0");
      changed = true;
    }
  }
  if (changed) {
    sh.getRange(startRow, CODE_COL, numRows, 1).setValues(codes);
  }
}
