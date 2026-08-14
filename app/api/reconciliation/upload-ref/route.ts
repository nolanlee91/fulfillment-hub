import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { orders, orderPayments } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { withAuth } from "@/lib/auth/api-guard";
import { recomputeOrderReconSummary } from "@/lib/reconciliation/summary";
import { deleteObject, keyFromPublicUrl } from "@/lib/storage/r2";

export const maxDuration = 60;

interface ParsedFile {
  rows: { key: string; refNumber: string }[];
  keyType: "ORDER" | "TRACKING"; // khóa tra: Order ID hay Tracking Number
  badTracking: string[]; // tracking sai định dạng (bị Excel ép số) → cảnh báo
}

/** Tracking bị Excel ép scientific ("1.03136E+15") hoặc mất chữ số → coi là hỏng. */
function looksCorruptTracking(v: string): boolean {
  if (/[eE]/.test(v) || v.includes(".") || v.includes(",")) return true;
  const digits = v.replace(/\D/g, "");
  return digits.length > 0 && digits.length < 8; // quá ngắn = nghi mất số
}

/**
 * Parse Excel/CSV file → list (key, refNumber) + loại khóa.
 * Khóa tra chấp nhận MỘT trong hai (auto-detect theo header có mặt):
 *   - Order ID:  "mã đơn hàng", "order id", "orderid", "order number", "mã đơn"
 *   - Tracking:  "tracking number", "tracking", "mã tracking", "mã vận đơn", "vận đơn"
 * Ref (bắt buộc): "mã ref", "ref number", "refnumber", "reference", "ref"
 * Có cả 2 cột khóa → ưu tiên Order ID.
 */
async function parseRefFile(buffer: ArrayBuffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("File không có sheet nào");

  const ORDER_ALIASES = ["mã đơn hàng", "order id", "orderid", "order number", "mã đơn"];
  const TRACKING_ALIASES = [
    "tracking number", "tracking", "tracking no", "tracking#",
    "mã tracking", "ma tracking", "mã vận đơn", "vận đơn", "mã vandon", "vandon",
  ];
  const REF_ALIASES = ["mã ref", "ref number", "refnumber", "reference", "ref", "ref no", "mã refnumber"];

  const headerRow = sheet.getRow(1);
  let orderCol = 0;
  let trackingCol = 0;
  let refCol = 0;
  headerRow.eachCell((cell, colNumber) => {
    const v = String(cell.value || "").trim().toLowerCase();
    if (!orderCol && ORDER_ALIASES.includes(v)) orderCol = colNumber;
    if (!trackingCol && TRACKING_ALIASES.includes(v)) trackingCol = colNumber;
    if (!refCol && REF_ALIASES.includes(v)) refCol = colNumber;
  });

  if (!refCol) {
    throw new Error("File thiếu cột 'Mã Ref' (hoặc tương đương).");
  }
  if (!orderCol && !trackingCol) {
    throw new Error(
      "File thiếu cột khóa tra. Cần 'Mã đơn hàng' HOẶC 'Tracking Number' (kèm 'Mã Ref').",
    );
  }

  const keyType: "ORDER" | "TRACKING" = orderCol ? "ORDER" : "TRACKING";
  const keyCol = orderCol || trackingCol;

  const rows: { key: string; refNumber: string }[] = [];
  const badTracking: string[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    // Ưu tiên .text (hiển thị) để tránh mất chính xác số dài; fallback .value.
    const rawKey = row.getCell(keyCol).text ?? String(row.getCell(keyCol).value ?? "");
    const key = String(rawKey).trim();
    const refNumber = String(row.getCell(refCol).value ?? "").trim();
    if (!key || !refNumber) continue;
    if (keyType === "TRACKING" && looksCorruptTracking(key)) {
      badTracking.push(key);
      continue;
    }
    rows.push({ key, refNumber });
  }
  return { rows, keyType, badTracking };
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
 * Cột "Mã đơn hàng" nhận cả Mã đơn LẪN Tracking Number (fallback khi không khớp mã đơn).
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
      let parsed: ParsedFile;
      try {
        parsed = await parseRefFile(buffer);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: msg }, { status: 400 });
      }
      const { rows, keyType, badTracking } = parsed;

      if (rows.length === 0) {
        const extra = badTracking.length
          ? ` (${badTracking.length} dòng tracking sai định dạng — xuất lại file dạng CSV/text, đừng để Excel tự đổi thành số)`
          : "";
        return NextResponse.json(
          { success: false, error: `File không có dòng nào hợp lệ${extra}` },
          { status: 400 },
        );
      }

      // Map fileKey (orderId HOẶC tracking) → DANH SÁCH mã ref.
      // Giữ MỌI mã ref KHÁC nhau của cùng 1 khóa (cho phép 1 đơn nhiều khoản ngay
      // trong 1 file); chỉ bỏ khi cùng khóa + cùng mã (trùng y hệt).
      const refsByKey: Record<string, string[]> = {};
      for (const r of rows) {
        const list = (refsByKey[r.key] ??= []);
        if (!list.includes(r.refNumber)) list.push(r.refNumber);
      }
      const fileKeys = Object.keys(refsByKey);

      // Load orders matching — theo orderId hoặc trackingNumber tùy cột trong file.
      // CUSTOMER chỉ thấy đơn của customer mình.
      const keyField = keyType === "ORDER" ? orders.orderId : orders.trackingNumber;
      const dbOrders = await db
        .select({
          uniqueKey: orders.uniqueKey,
          orderId: orders.orderId,
          trackingNumber: orders.trackingNumber,
          paymentMethod: orders.paymentMethod,
        })
        .from(orders)
        .where(and(inArray(keyField, fileKeys), eq(orders.customerId, customerId)));

      // Quy MỌI thứ về khóa orderId để luồng conflict/book phía sau giữ nguyên.
      const refsByOrderId: Record<string, string[]> = {};
      const orderByOrderId = new Map<string, (typeof dbOrders)[number]>();
      const matchedFileKeys = new Set<string>();
      for (const o of dbOrders) {
        const fk = keyType === "ORDER" ? o.orderId : (o.trackingNumber ?? "");
        if (!fk || !(fk in refsByKey)) continue;
        matchedFileKeys.add(fk);
        refsByOrderId[o.orderId] = refsByKey[fk];
        orderByOrderId.set(o.orderId, o);
      }

      // Fallback: key không khớp theo cột đã nhận diện → thử field còn lại
      // (vd header "Mã đơn hàng" nhưng khách dán mã tracking, hoặc ngược lại).
      const missingKeys = fileKeys.filter((k) => !matchedFileKeys.has(k));
      if (missingKeys.length > 0) {
        const altField = keyType === "ORDER" ? orders.trackingNumber : orders.orderId;
        const altOrders = await db
          .select({
            uniqueKey: orders.uniqueKey,
            orderId: orders.orderId,
            trackingNumber: orders.trackingNumber,
            paymentMethod: orders.paymentMethod,
          })
          .from(orders)
          .where(and(inArray(altField, missingKeys), eq(orders.customerId, customerId)));
        for (const o of altOrders) {
          const fk = keyType === "ORDER" ? (o.trackingNumber ?? "") : o.orderId;
          if (!fk || !(fk in refsByKey) || matchedFileKeys.has(fk)) continue;
          if (orderByOrderId.has(o.orderId)) continue; // đơn đã khớp qua key chính
          matchedFileKeys.add(fk);
          refsByOrderId[o.orderId] = refsByKey[fk];
          orderByOrderId.set(o.orderId, o);
        }
      }

      const orderIds = [...orderByOrderId.keys()];
      const unmatched = fileKeys.filter((k) => !matchedFileKeys.has(k));

      // Load MỌI khoản hiện có (ETF lẫn non-ETF) của những đơn khớp — để phát hiện
      // conflict kể cả khi đơn trước đó chỉ có ảnh non-ETF.
      const matchedKeys = Array.from(
        new Set(Array.from(orderByOrderId.values()).map((o) => o.uniqueKey)),
      );
      const existingPayments = matchedKeys.length
        ? await db
            .select({
              id: orderPayments.id,
              orderUniqueKey: orderPayments.orderUniqueKey,
              paymentType: orderPayments.paymentType,
              refNumber: orderPayments.refNumber,
              proofUrl: orderPayments.proofUrl,
              accountedAt: orderPayments.accountedAt,
            })
            .from(orderPayments)
            .where(inArray(orderPayments.orderUniqueKey, matchedKeys))
        : [];

      type ExistingItem = { type: string; ref: string | null };
      type UnbookedRow = { id: string; proofUrl: string | null };
      const payByKey = new Map<
        string,
        { items: ExistingItem[]; hasBooked: boolean; unbooked: UnbookedRow[] }
      >();
      for (const p of existingPayments) {
        const cur =
          payByKey.get(p.orderUniqueKey) ?? { items: [], hasBooked: false, unbooked: [] };
        cur.items.push({ type: p.paymentType, ref: p.refNumber });
        if (p.accountedAt) cur.hasBooked = true;
        else cur.unbooked.push({ id: p.id, proofUrl: p.proofUrl });
        payByKey.set(p.orderUniqueKey, cur);
      }

      // Phân loại
      const skippedCOD: string[] = [];
      const conflicts: Array<{
        orderId: string;
        existing: ExistingItem[];
        hasBooked: boolean;
        canUpdate: boolean;
      }> = [];
      // Order IDs không conflict (đơn CHƯA có khoản nào) → auto add
      const autoAddOrderIds: string[] = [];

      for (const oid of orderIds) {
        const o = orderByOrderId.get(oid);
        if (!o) continue; // unmatched (đã tính ở trên)
        if (o.paymentMethod === "COD") {
          skippedCOD.push(oid);
          continue;
        }
        const existing = payByKey.get(o.uniqueKey);
        if (existing && existing.items.length > 0) {
          conflicts.push({
            orderId: oid,
            existing: existing.items,
            hasBooked: existing.hasBooked,
            canUpdate: !existing.hasBooked,
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
          badTracking: badTracking.length,
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

      // 1) Auto-add các đơn chưa có khoản ETF — chèn MỌI mã ref của đơn đó.
      for (const oid of autoAddOrderIds) {
        const o = orderByOrderId.get(oid)!;
        for (const ref of refsByOrderId[oid] ?? []) {
          await insertEtf(o.uniqueKey, ref);
          added++;
        }
      }

      // 2) Conflict → theo resolution (mặc định "add" nếu thiếu để không mất dữ liệu)
      for (const c of conflicts) {
        const o = orderByOrderId.get(c.orderId)!;
        const choice = resolutions?.[c.orderId] ?? "add";
        const fileRefs = refsByOrderId[c.orderId] ?? [];
        if (choice === "update") {
          if (!c.canUpdate) {
            blockedBooked.push(c.orderId);
            continue; // đơn đã booked — không cho ghi đè
          }
          // Xóa MỌI khoản CHƯA booked cũ (kể cả ảnh non-ETF) + dọn object R2, rồi thêm MỌI mã ETF mới.
          const unbooked = payByKey.get(o.uniqueKey)?.unbooked ?? [];
          for (const u of unbooked) {
            if (u.proofUrl) {
              const key = keyFromPublicUrl(u.proofUrl);
              if (key) {
                try {
                  await deleteObject(key);
                } catch (e) {
                  console.error("R2 delete failed (continuing):", e);
                }
              }
            }
          }
          await db
            .delete(orderPayments)
            .where(
              and(
                eq(orderPayments.orderUniqueKey, o.uniqueKey),
                isNull(orderPayments.accountedAt),
              ),
            );
          for (const ref of fileRefs) await insertEtf(o.uniqueKey, ref);
          updated++;
        } else {
          // Bổ sung: chèn các mã file CHƯA có trên đơn (bỏ mã trùng y hệt đã tồn tại).
          const existingEtfRefs = new Set(
            (payByKey.get(o.uniqueKey)?.items ?? [])
              .filter((it) => it.type === "ETF" && it.ref)
              .map((it) => it.ref as string),
          );
          for (const ref of fileRefs) {
            if (existingEtfRefs.has(ref)) continue;
            await insertEtf(o.uniqueKey, ref);
            added++;
          }
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
      if (badTracking.length > 0)
        messageParts.push(`${badTracking.length} tracking sai định dạng (bỏ qua)`);

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
        badTracking: badTracking.length,
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
