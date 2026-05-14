/**
 * Phân loại APT event code → status vận chuyển + cờ "cần chú ý" cho CSKH.
 *
 * Tách riêng 2 dimension:
 *   - status (DELIVERED / FAILED / IN_TRANSIT): trạng thái vật lý
 *   - attention (ADDRESS_ERROR / DELAYED / NOTICE_CARD / STUCK | CLEAR | null):
 *       cờ thông báo CSKH cần action. CLEAR = xóa cờ; null = không động đến cờ.
 *
 * Return Flag (field 41 trong file APT):
 *   - "R" = Real RTS, "A" = Authorized Return, "B" = Anticipated Return
 *   - 1 trong 3 = item đang flow trả về sender
 *   - Khi đó code "Delivered" nghĩa là "đã giao trả về sender" → FAILED
 */

const DELIVERED_CODES = new Set<string>([
  "0610", "0611", "0612", "0613", "0614", "0615", "0616", "0617", "0618", "0619", "0620",
  "1405",
  "1408", "1409",
  "1421", "1422", "1423", "1424", "1425", "1426", "1427", "1428", "1429", "1430",
  "1431", "1432", "1433", "1434",
  "1441", "1442",
  "1461", "1462", "1463", "1465", "1466", "1467", "1468", "1469",
  "1471", "1472", "1473", "1475", "1476",
  "1496", "1497", "1498", "1499",
  "5300",
]);

const RTS_TRIGGER_CODES = new Set<string>([
  "0167", "0168", "0169",
  "0181", "0182", "0183", "0184",
  "1100",
  "1415", "1416", "1417", "1418", "1419", "1420",
  "1481", "1482", "1491", "1492",
  "2600",
  "2802",
  "3001",
]);

const ADDRESS_ERROR_CODES = new Set<string>([
  "0120", "0171", "0173", "0179",
  "1412", "1450", "1483", "1493",
  "2412",
  "4650",
]);

const DELAY_CODES = new Set<string>([
  "0117", "0121", "0125",
  "0159", "0160", "0161", "0162", "0163",
  "0172",
  "0621", "0622", "0623", "0624", "0625", "0626", "0627", "0628",
  "1410", "1411", "1414", "1443", "1444",
  "1484", "1494",
  "2410", "2411", "2414",
  "4625", "4700",
]);

const NOTICE_CARD_CODES = new Set<string>([
  "0154", "0156",
  "1407",
  "1435", "1436", "1437", "1438",
  "1479", "1488",
  "2407",
]);

export type TrackingStatus = "DELIVERED" | "FAILED" | "IN_TRANSIT";
export type AttentionReason = "ADDRESS_ERROR" | "DELAYED" | "NOTICE_CARD" | "STUCK";

export interface EventClassification {
  status: TrackingStatus;
  attention: AttentionReason | "CLEAR" | null;
}

export function classifyEvent(
  eventCode: string,
  returnFlag: string,
): EventClassification {
  const code = (eventCode || "").trim();
  const flag = (returnFlag || "").trim().toUpperCase();
  const isReturnFlow = flag === "R" || flag === "A" || flag === "B";

  if (isReturnFlow) {
    if (DELIVERED_CODES.has(code)) return { status: "FAILED", attention: "CLEAR" };
    return { status: "IN_TRANSIT", attention: null };
  }

  if (RTS_TRIGGER_CODES.has(code)) return { status: "FAILED", attention: "CLEAR" };
  if (DELIVERED_CODES.has(code)) return { status: "DELIVERED", attention: "CLEAR" };

  if (ADDRESS_ERROR_CODES.has(code)) return { status: "IN_TRANSIT", attention: "ADDRESS_ERROR" };
  if (NOTICE_CARD_CODES.has(code)) return { status: "IN_TRANSIT", attention: "NOTICE_CARD" };
  if (DELAY_CODES.has(code)) return { status: "IN_TRANSIT", attention: "DELAYED" };

  return { status: "IN_TRANSIT", attention: null };
}
