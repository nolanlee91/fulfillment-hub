/**
 * Map APT event code → trạng thái cấp cao (DELIVERED / FAILED / IN_TRANSIT).
 *
 * Nguồn: bảng "APT event codes 2025.xlsx" — cột "EM Event Code - Internal" = DELIVERED,
 * và cột "Email Notification" = "Return to Sender" / RTS event codes.
 *
 * Lưu ý về Return Flag (field 40 trong file APT):
 *   - "R" = item đang được trả về expéditeur → coi như FAILED bất kể event code
 *   - Các event code DELIVERED khi xuất hiện cùng returnFlag=R nghĩa là
 *     "đã giao trả về sender" — vẫn coi là FAILED từ góc nhìn customer.
 */

// EM Event Code - Internal = DELIVERED (giao thành công)
const DELIVERED_CODES = new Set<string>([
  "1405",
  "1408",
  "1409",
  "1421",
  "1422",
  "1423",
  "1424",
  "1425",
  "1426",
  "1427",
  "1428",
  "1429",
  "1430",
  "1431",
  "1432",
  "1433",
  "1434",
  "1441",
  "1442",
  "1461",
  "1462",
  "1463",
  "1465",
  "1466",
  "1467",
  "1468",
  "1469",
  "1471",
  "1472",
  "1473",
  "1475",
  "1476",
  "1496",
  "1497",
  "1498",
  "1499",
  "5300",
]);

// Event codes thể hiện "Return to Sender" / item không thể giao
// Bao gồm: Email Notification = Return to Sender + RTS-only codes + customs refusal
const FAILED_CODES = new Set<string>([
  // International — return to sender
  "0167",
  "0168",
  "0169",
  "0181",
  "0182",
  "0183",
  "0184",
  // Customs refusal
  "1100",
  // RTS pending / attempting
  "1415",
  "1416",
  "1417",
  "1418",
  "1419",
  "1481",
  "1482",
  "1491",
  "1492",
  // Domestic RTS in progress
  "2600",
  "2601",
  // International undeliverable
  "2802",
  // Return label processing
  "3001",
]);

export type TrackingCategory = "DELIVERED" | "FAILED" | "IN_TRANSIT";

export function classifyEvent(
  eventCode: string,
  returnFlag: string,
): TrackingCategory {
  const code = (eventCode || "").trim();
  const flag = (returnFlag || "").trim().toUpperCase();

  // Return flag R = item đang trả về sender → FAILED
  if (flag === "R") return "FAILED";

  if (FAILED_CODES.has(code)) return "FAILED";
  if (DELIVERED_CODES.has(code)) return "DELIVERED";
  return "IN_TRANSIT";
}
