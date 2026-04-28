import { google } from "googleapis";

/**
 * Tạo authenticated Google Sheets API client.
 * Hỗ trợ 2 cách auth:
 *  1. GOOGLE_SERVICE_ACCOUNT_KEY_BASE64: cả file JSON encoded base64 (khuyên dùng)
 *  2. GOOGLE_SERVICE_ACCOUNT_EMAIL + PRIVATE_KEY: 2 biến riêng
 */
function getAuthClient() {
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;

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
): Promise<string[][]> {
  const sheets = getSheets();
  const range = `'${sheetName}'`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
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
