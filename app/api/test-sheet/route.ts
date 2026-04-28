import { NextResponse } from "next/server";
import { readSheet, getSpreadsheetMeta } from "@/lib/sheets/client";

const VENATURECO_ID = "1xUIeuVyZps-P8cyvEVg6GlENn_7dudKb3z6yEYMdFlE";

export async function GET() {
  try {
    // Test 1: lấy metadata (list các tab)
    const meta = await getSpreadsheetMeta(VENATURECO_ID);

    // Test 2: đọc 5 dòng đầu của tab FITGUM 1
    const data = await readSheet(VENATURECO_ID, "FITGUM 1");

    return NextResponse.json({
      success: true,
      spreadsheetTitle: meta.title,
      tabs: meta.sheets.map((s) => s.title),
      fitgumPreview: {
        totalRows: data.length,
        headerRow: data[0] ?? [],
        firstDataRow: data[1] ?? [],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
