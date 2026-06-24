import { google } from "googleapis";

/**
 * Tạo authenticated Google Sheets API client.
 * Hỗ trợ 2 cách auth:
 *  1. GOOGLE_SERVICE_ACCOUNT_KEY_BASE64: cả file JSON encoded base64 (khuyên dùng)
 *  2. GOOGLE_SERVICE_ACCOUNT_EMAIL + PRIVATE_KEY: 2 biến riêng
 */
function getAuthClient() {
  const base64 = process.env.GSA_B64;

  if (base64) {
    // Decode base64 → JSON object
    const jsonStr = Buffer.from(base64, "base64").toString("utf-8");
    const credentials = JSON.parse(jsonStr);
    return new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  // Fallback: 2 biến riêng (cho local dev)
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !privateKey) {
    throw new Error(
      "Missing Google credentials. Set either GOOGLE_SERVICE_ACCOUNT_KEY_BASE64, or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
    );
  }

  // Replace literal \n with actual newlines
  const formattedKey = privateKey.replace(/\\n/g, "\n");

  return new google.auth.JWT({
    email,
    key: formattedKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

let _sheetsClient: ReturnType<typeof google.sheets> | null = null;

function getSheets() {
  if (_sheetsClient) return _sheetsClient;
  const auth = getAuthClient();
  _sheetsClient = google.sheets({ version: "v4", auth });
  return _sheetsClient;
}

/**
 * Đọc toàn bộ data của 1 sheet (tab).
 * Trả về array of arrays (mỗi inner array là 1 row).
 */
export async function readSheet(
  spreadsheetId: string,
  sheetName: string,
  valueRenderOption?: "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA",
): Promise<string[][]> {
  const sheets = getSheets();
  const range = `'${sheetName}'`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption,
  });
  return (res.data.values as string[][]) ?? [];
}

/**
 * Ghi 1 cell hoặc range vào sheet.
 */
export async function writeRange(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][],
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Ghi nhiều range cùng lúc trong 1 spreadsheet — chỉ 1 API call.
 * Dùng khi cần update nhiều cell rải rác trên cùng 1 sheet.
 */
export async function writeBatch(
  spreadsheetId: string,
  updates: { range: string; value: string | number | null }[],
): Promise<void> {
  if (updates.length === 0) return;
  const sheets = getSheets();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({
        range: u.range,
        values: [[u.value]],
      })),
    },
  });
}

/**
 * Append rows vào cuối sheet.
 */
export async function appendRows(
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | null)[][],
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

/**
 * Tạo 1 tab (sheet) mới trong spreadsheet. Trả về sheetId của tab vừa tạo.
 * Throw nếu tab trùng tên (Google trả lỗi).
 */
export async function addSheet(
  spreadsheetId: string,
  title: string,
  opts?: { rowCount?: number; columnCount?: number },
): Promise<number> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
              gridProperties: {
                rowCount: opts?.rowCount ?? 1000,
                columnCount: opts?.columnCount ?? 26,
              },
            },
          },
        },
      ],
    },
  });
  const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) throw new Error("addSheet: không lấy được sheetId trả về");
  return sheetId;
}

/**
 * Copy 1 range nguồn sang range đích (PASTE_NORMAL → tự điều chỉnh tham chiếu
 * tương đối của công thức). Index theo chuẩn API (0-based, end exclusive).
 * Dùng để fill-down công thức template xuống nhiều dòng.
 */
export async function copyPasteRange(
  spreadsheetId: string,
  source: { sheetId: number; startRow: number; endRow: number; startCol: number; endCol: number },
  dest: { sheetId: number; startRow: number; endRow: number; startCol: number; endCol: number },
): Promise<void> {
  const sheets = getSheets();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          copyPaste: {
            source: {
              sheetId: source.sheetId,
              startRowIndex: source.startRow,
              endRowIndex: source.endRow,
              startColumnIndex: source.startCol,
              endColumnIndex: source.endCol,
            },
            destination: {
              sheetId: dest.sheetId,
              startRowIndex: dest.startRow,
              endRowIndex: dest.endRow,
              startColumnIndex: dest.startCol,
              endColumnIndex: dest.endCol,
            },
            pasteType: "PASTE_NORMAL",
          },
        },
      ],
    },
  });
}

/**
 * Lấy metadata của spreadsheet.
 */
export async function getSpreadsheetMeta(spreadsheetId: string) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return {
    title: res.data.properties?.title ?? "",
    sheets:
      res.data.sheets?.map((s) => ({
        title: s.properties?.title ?? "",
        sheetId: s.properties?.sheetId,
      })) ?? [],
  };
}
