import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { orders, orderPayments } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { withAuth } from "@/lib/auth/api-guard";
import { recomputeOrderReconSummary } from "@/lib/reconciliation/summary";

export const maxDuration = 60;

interface ParsedRow {
  orderId: string;
  refNumber: string;
}

/**
 * Parse Excel/CSV file → list (orderId, refNumber).
 * Chấp nhận header (case-insensitive, trim):
 *   - Order ID column: "mã đơn hàng", "order id", "orderid", "order number"
 *   - Ref column:      "mã ref", "ref number", "refnumber", "reference", "ref"
 */
async function parseRefFile(buffer: ArrayBuffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File không có sheet nào");

  const ORDER_ALIASES = ["mã đơn hàng", "order id", "orderid", "order number", "mã đơn"];
  const REF_ALIASES = ["mã ref", "ref number", "refnumber", "reference", "ref", "ref no", "mã refnumber"];

  const headerRow = sheet.getRow(1);
  let orderCol = 0;
  let refCol = 0;
  headerRow.eachCell((cell, colNumber) => {
    const v = String(cell.value || "").trim().toLowerCase();
    if (!orderCol && ORDER_ALIASES.includes(v)) orderCol = colNumber;
    if (!refCol && REF_ALIASES.includes(v)) refCol = colNumber;
  });

  if (!orderCol || !refCol) {
    throw new Error(
      "File thiếu cột bắt buộc. Cần 2 cột: 'Mã đơn hàng' và 'Mã Ref' (hoặc tương đương).",
    );
  }

  const rows: ParsedRow[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const orderId = String(row.getCell(orderCol).value || "").trim();
    const refNumber = String(row.getCell(refCol).value || "").trim();
    if (!orderId || !refNumber) continue;
    rows.push({ orderId, refNumber });
  }
  return rows;
}

/**
 * Upload file Ref đối soát (ETF). 2 pha stateless:
 *   Pha 1 (không kèm `resolutions`): nếu có Order ID đã có mã ETF trước đó → trả
 *     `needsResolution` + danh sách conflict. Client mở popup cho khách chọn
 *     Update (thay mã cũ) / Bổ sung (thêm khoản mới) từng Order ID rồi gửi lại.
 *   Pha 2 (kèm `resolutions`): thực thi add/update theo lựa chọn.
 *   Nếu KHÔNG có conflict nào → pha 1 apply luôn (không cần popup).
 *
 * CUSTOMER role: chỉ match đơn của customer mình (security).
 * COD: bỏ qua (đối soát chỉ áp prepaid).
 * Đơn đã có khoản ETF BOOKED: không cho Update, chỉ cho Bổ sung.
 */
export const POST = withAuth(
  async (req, user) => {
    try {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof Blob)) {
        return NextResponse.json(
          { success: false, error: "Chưa upload file" },
          { status: 400 },
        );
      }

      const customerId = user.customerId;
      if (!customerId) {
        return NextResponse.json(
          { success: false, error: "Account is not linked to a customer" },
          { status: 400 },
        );
      }

      // resolutions: map orderId -> "update" | "add" (chỉ có ở pha 2)
      let resolutions: Record<string, "update" | "add"> | null = null;
      const rawResolutions = formData.get("resolutions");
      if (typeof rawResolutions === "string" && rawResolutions.trim()) {
        try {
          resolutions = JSON.parse(rawResolutions);
        } catch {
          return NextResponse.json(
            { success: false, error: "resolutions không hợp lệ (JSON)" },
            { status: 400 },
          );
        }
      }

      // Parse file
      const buffer = await file.arrayBuffer();
      let rows: ParsedRow[];
      try {
        rows = await parseRefFile(buffer);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }

      if (rows.length === 0) {
        return NextResponse.json(
          { success: false, error: "File không có dòng nào hợp lệ" },
          { status: 400 },
        );
      }

      // Map orderId → refNumber (dedup, lấy entry cuối nếu duplicate trong file)
      const refByOrderId: Record<string, string> = {};
      for (const r of rows) refByOrderId[r.orderId] = r.refNumber;
      const orderIds = Object.keys(refByOrderId);

      // Load orders matching — CUSTOMER chỉ thấy đơn của customer mình
      const dbOrders = await db
        .select({
          uniqueKey: orders.uniqueKey,
          orderId: orders.orderId,
          paymentMethod: orders.paymentMethod,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.orderId, orderIds),
            eq(orders.customerId, customerId),
          ),
        );

      const orderByOrderId = new Map(dbOrders.map((o) => [o.orderId, o]));
      const matchedOrderIds = new Set(dbOrders.map((d) => d.orderId));
      const unmatched = orderIds.filter((oid) => !matchedOrderIds.has(oid));

      // Load các khoản ETF hiện có của những đơn khớp
      const matchedKeys = dbOrders.map((o) => o.uniqueKey);
      const existingEtf = matchedKeys.length
        ? await db
            .select({
              orderUniqueKey: orderPayments.orderUniqueKey,
              refNumber: orderPayments.refNumber,
              accountedAt: orderPayments.accountedAt,
            })
            .from(orderPayments)
            .where(
              and(
                inArray(orderPayments.orderUniqueKey, matchedKeys),
                eq(orderPayments.paymentType, "ETF"),
              ),
            )
        : [];

      const etfByKey = new Map<string, { refs: string[]; hasBooked: boolean }>();
      for (const p of existingEtf) {
        const cur = etfByKey.get(p.orderUniqueKey) ?? { refs: [], hasBooked: false };
        if (p.refNumber) cur.refs.push(p.refNumber);
        if (p.accountedAt) cur.hasBooked = true;
        etfByKey.set(p.orderUniqueKey, cur);
      }

      // Phân loại
      const skippedCOD: string[] = [];
      const conflicts: Array<{
        orderId: string;
        existingRefs: string[];
        hasBooked: boolean;
        canUpdate: boolean;
      }> = [];
      // Order IDs không conflict (chưa có khoản ETF) → auto add
      const autoAddOrderIds: string[] = [];

      for (const oid of orderIds) {
        const o = orderByOrderId.get(oid);
        if (!o) continue; // unmatched (đã tính ở trên)
        if (o.paymentMethod === "COD") {
          skippedCOD.push(oid);
          continue;
        }
        const etf = etfByKey.get(o.uniqueKey);
        if (etf && etf.refs.length > 0) {
          conflicts.push({
            orderId: oid,
            existingRefs: etf.refs,
            hasBooked: etf.hasBooked,
            canUpdate: !etf.hasBooked,
          });
        } else {
          autoAddOrderIds.push(oid);
        }
      }

      // Pha 1: có conflict nhưng chưa có resolutions → yêu cầu khách chọn (chưa ghi gì)
      if (conflicts.length > 0 && !resolutions) {
        return NextResponse.json({
          success: true,
          needsResolution: true,
          conflicts,
          autoAddCount: autoAddOrderIds.length,
          unmatched: unmatched.length,
          unmatchedOrderIds: unmatched.slice(0, 50),
          skippedCOD: skippedCOD.length,
        });
      }

      // Apply — auto-add + resolutions
      const now = new Date();
      const createdBy = `CUSTOMER:${customerId}`;
      const touchedKeys = new Set<string>();
      let added = 0;
      let updated = 0;
      const blockedBooked: string[] = []; // update bị chặn vì đã booked (an toàn kép)

      const insertEtf = async (uniqueKey: string, refNumber: string) => {
        await db.insert(orderPayments).values({
          id: randomUUID(),
          orderUniqueKey: uniqueKey,
          paymentType: "ETF",
          refNumber,
          reconciledAt: now,
          createdBy,
          createdAt: now,
        });
        touchedKeys.add(uniqueKey);
      };

      // 1) Auto-add các đơn chưa có khoản ETF
      for (const oid of autoAddOrderIds) {
        const o = orderByOrderId.get(oid)!;
        await insertEtf(o.uniqueKey, refByOrderId[oid]);
        added++;
      }

      // 2) Conflict → theo resolution (mặc định "add" nếu thiếu để không mất dữ liệu)
      for (const c of conflicts) {
        const o = orderByOrderId.get(c.orderId)!;
        const choice = resolutions?.[c.orderId] ?? "add";
        if (choice === "update") {
          if (!c.canUpdate) {
            blockedBooked.push(c.orderId);
            continue; // đơn đã booked — không cho ghi đè
          }
          // Xóa các khoản ETF CHƯA booked cũ rồi thêm mới
          await db
            .delete(orderPayments)
            .where(
              and(
                eq(orderPayments.orderUniqueKey, o.uniqueKey),
                eq(orderPayments.paymentType, "ETF"),
                isNull(orderPayments.accountedAt),
              ),
            );
          await insertEtf(o.uniqueKey, refByOrderId[c.orderId]);
          updated++;
        } else {
          await insertEtf(o.uniqueKey, refByOrderId[c.orderId]);
          added++;
        }
      }

      // Recompute summary cho mọi đơn đụng tới
      for (const key of touchedKeys) {
        await recomputeOrderReconSummary(key);
      }

      const messageParts = [`${added} khoản thêm`];
      if (updated > 0) messageParts.push(`${updated} khoản cập nhật`);
      if (unmatched.length > 0) messageParts.push(`${unmatched.length} không khớp`);
      if (blockedBooked.length > 0)
        messageParts.push(`${blockedBooked.length} đã hạch toán nên không ghi đè`);
      if (skippedCOD.length > 0) messageParts.push(`bỏ qua ${skippedCOD.length} đơn COD`);

      return NextResponse.json({
        success: true,
        needsResolution: false,
        totalInFile: rows.length,
        added,
        updated,
        unmatched: unmatched.length,
        unmatchedOrderIds: unmatched.slice(0, 50),
        skippedCOD: skippedCOD.length,
        blockedBooked: blockedBooked.length,
        blockedBookedOrderIds: blockedBooked.slice(0, 50),
        message: `Đối soát: ${messageParts.join(", ")}.`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Reconciliation upload error:", error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["CUSTOMER"] },
);
