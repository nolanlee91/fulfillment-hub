/**
 * Đọc file "APT event codes 2025.xlsx" và export ra JSON để analyze.
 */
import ExcelJS from "exceljs";
import * as fs from "fs";

interface EventCode {
  physicalScan: string;
  code: string;
  internalCategory: string;
  ediEventCode: string;
  inRTS: string;
  emailCategory: string;
  emailNotification: string;
  msgEn: string;
  msgFr: string;
  newlyAdded: string;
  notes: string;
}

function getCellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return String(v).trim();
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("APT event codes 2025.xlsx");

  // Sheet 1: Event codes
  const sheet1 = wb.getWorksheet("Event codes")!;
  const events: EventCode[] = [];
  sheet1.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return; // skip header
    events.push({
      physicalScan: getCellText(row.getCell(1)),
      code: getCellText(row.getCell(2)),
      internalCategory: getCellText(row.getCell(3)),
      ediEventCode: getCellText(row.getCell(4)),
      inRTS: getCellText(row.getCell(5)),
      emailCategory: getCellText(row.getCell(6)),
      emailNotification: getCellText(row.getCell(7)),
      msgEn: getCellText(row.getCell(8)),
      msgFr: getCellText(row.getCell(9)),
      newlyAdded: getCellText(row.getCell(10)),
      notes: getCellText(row.getCell(11)),
    });
  });

  // Sheet 2: RTS Event Codes
  const sheet2 = wb.getWorksheet("RTS Event Codes");
  const rtsCodes: Record<string, string>[] = [];
  if (sheet2) {
    let header: string[] = [];
    sheet2.eachRow({ includeEmpty: false }, (row, rowNum) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (c) => cells.push(getCellText(c)));
      if (rowNum === 1) {
        header = cells;
      } else {
        const obj: Record<string, string> = {};
        header.forEach((h, i) => (obj[h] = cells[i] || ""));
        rtsCodes.push(obj);
      }
    });
  }

  fs.writeFileSync("scripts/event-codes-dump.json", JSON.stringify({ events, rtsCodes }, null, 2));

  // Quick analysis
  const inRtsYes = events.filter((e) => e.inRTS.toUpperCase() === "Y");
  const internalDelivered = events.filter((e) => e.internalCategory.toUpperCase() === "DELIVERED");
  console.log(`Total events: ${events.length}`);
  console.log(`In RTS = Y: ${inRtsYes.length}`);
  console.log(`Internal = DELIVERED: ${internalDelivered.length}`);
  console.log(`RTS sheet rows: ${rtsCodes.length}`);
  console.log(`\nDumped to scripts/event-codes-dump.json`);

  console.log("\n=== Codes In RTS = Y (FAILED candidates) ===");
  for (const e of inRtsYes) {
    console.log(`${e.code} | ${e.internalCategory} | ${e.emailNotification || "—"} | ${e.msgEn.slice(0, 70)}`);
  }

  console.log("\n=== Codes Internal = DELIVERED ===");
  for (const e of internalDelivered) {
    console.log(`${e.code} | ${e.emailNotification || "—"} | ${e.msgEn.slice(0, 70)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
