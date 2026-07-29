import { db } from "../db";
import { orders, boxes, boxRules } from "../db/schema";
import { and, eq, or } from "drizzle-orm";
import { checkCanadianPostal } from "./postal";
import { resolvePhone } from "./parser";

export interface ValidateResult {
  total: number;
  validated: number;
  ready: number;
  errors: number;
  skipped: number;
  durationMs: number;
}

/**
 * Quét toàn bộ orders, validate + gán box.
 *
 * Logic:
 *  1. Skip dòng đã EXPORTED hoặc đã có batch_id (đã đóng gói)
 *  2. Validate địa chỉ → thiếu = ERROR
 *  3. Tìm box: product match + max_qty >= qty → chọn box NHỎ NHẤT đủ chứa
 *  4. Verify box active
 *  5. Update DB
 */
export async function validateAndAssignAll(customerId?: string): Promise<ValidateResult> {
  const startedAt = Date.now();

  // 1. Load Box Master (active only) → map code → box info
  const boxList = await db.select().from(boxes).where(eq(boxes.active, true));
  const boxMap: Record<string, { code: string }> = {};
  for (const b of boxList) {
    boxMap[b.code.toLowerCase()] = { code: b.code };
  }

  // 2. Load Box Rules → group by productId
  const rules = await db
    .select()
    .from(boxRules)
    .where(eq(boxRules.active, true));

  const rulesByProduct: Record<
    string,
    Array<{ boxCode: string; maxQty: number }>
  > = {};
  for (const r of rules) {
    if (r.maxQty <= 0) continue; // skip rule chưa nhập
    if (!boxMap[r.boxCode.toLowerCase()]) continue; // skip nếu box không active
    if (!rulesByProduct[r.productId]) rulesByProduct[r.productId] = [];
    rulesByProduct[r.productId].push({
      boxCode: r.boxCode,
      maxQty: r.maxQty,
    });
  }

  // 3. Load orders cần validate (NEW, READY, ERROR — chưa đóng batch).
  //    Scope theo customer khi khách tự validate (chỉ đơn của họ).
  const statusFilter = or(
    eq(orders.status, "NEW"),
    eq(orders.status, "READY"),
    eq(orders.status, "ERROR"),
    eq(orders.status, "ERROR_UPDATED"),
  );
  const ordersToProcess = await db
    .select()
    .from(orders)
    .where(customerId ? and(statusFilter, eq(orders.customerId, customerId)) : statusFilter);

  // Rule: SĐT sai/thiếu → tự điền số DỰ PHÒNG (đơn không bị chặn vì phone). Áp MỌI khách.
  // Ghi thẳng DB + cập nhật in-memory để vòng validate dưới thấy số mới hợp lệ.
  for (const order of ordersToProcess) {
    const resolved = resolvePhone(order.phone || "");
    if (resolved !== (order.phone || "")) {
      await db
        .update(orders)
        .set({ phone: resolved, updatedAt: new Date() })
        .where(eq(orders.uniqueKey, order.uniqueKey));
      order.phone = resolved;
    }
  }

  const result: ValidateResult = {
    total: ordersToProcess.length,
    validated: 0,
    ready: 0,
    errors: 0,
    skipped: 0,
    durationMs: 0,
  };

  // 4. Process từng order
  const updates: Array<{
    uniqueKey: string;
    status: "READY" | "ERROR";
    boxCode: string | null;
    errorNote: string;
  }> = [];

  for (const order of ordersToProcess) {
    // Skip nếu READY và đã có batch (đã đóng gói, không động lại)
    // ERROR/ERROR_UPDATED giữ nguyên batchId từ batch fail trước → cần re-validate
    if (order.batchId && order.status === "READY") {
      result.skipped++;
      continue;
    }

    // Validate required fields
    const missingFields: string[] = [];
    if (!String(order.name || "").trim()) missingFields.push("Name");
    if (!String(order.companyName || "").trim()) missingFields.push("#COMPANYNAME");
    if (!String(order.addressLine1 || "").trim()) missingFields.push("#ADDRESSLINE1");
    if (!String(order.city || "").trim()) missingFields.push("City");
    if (!String(order.province || "").trim()) missingFields.push("#PROVINCE/STATE");
    if (!String(order.zipcode || "").trim()) missingFields.push("Zipcode");
    // Phone KHÔNG còn là điều kiện ERROR: pre-pass ở trên đã thay sai/thiếu bằng
    // FALLBACK_PHONE nên tới đây SĐT luôn hợp lệ.

    if (missingFields.length > 0) {
      updates.push({
        uniqueKey: order.uniqueKey,
        status: "ERROR",
        boxCode: null,
        errorNote: "Missing: " + missingFields.join(", "),
      });
      result.errors++;
      result.validated++;
      continue;
    }

    // Validate postal code Canada (format ANANAN) → bắt lỗi nhầm O↔0 ngay,
    // không phải chờ ClickShip báo. Đơn US (zip toàn số) được bỏ qua.
    const postal = checkCanadianPostal(order.zipcode || "");
    if (!postal.ok) {
      updates.push({
        uniqueKey: order.uniqueKey,
        status: "ERROR",
        boxCode: null,
        errorNote: postal.suggestion
          ? `${postal.reason} → sửa thành: ${postal.suggestion}`
          : (postal.reason ?? "Postal code sai định dạng"),
      });
      result.errors++;
      result.validated++;
      continue;
    }

    // Validate COD: phải có số tiền > 0
    if (order.paymentMethod === "COD") {
      const amt = order.codAmount !== null ? Number(order.codAmount) : 0;
      if (!amt || amt <= 0) {
        updates.push({
          uniqueKey: order.uniqueKey,
          status: "ERROR",
          boxCode: null,
          errorNote: "COD thiếu số tiền thu",
        });
        result.errors++;
        result.validated++;
        continue;
      }
    }

    // Validate quantity
    const qty = order.quantity || 0;
    if (qty <= 0) {
      updates.push({
        uniqueKey: order.uniqueKey,
        status: "ERROR",
        boxCode: null,
        errorNote: `Invalid quantity (${qty})`,
      });
      result.errors++;
      result.validated++;
      continue;
    }

    // Find suitable box
    const productRules = rulesByProduct[order.productId] || [];
    const eligible = productRules
      .filter((r) => r.maxQty >= qty)
      .sort((a, b) => a.maxQty - b.maxQty);

    if (eligible.length === 0) {
      const errorNote =
        productRules.length === 0
          ? "Missing box rule for product"
          : `No box fits qty=${qty} (max available: ${Math.max(...productRules.map((r) => r.maxQty))})`;
      updates.push({
        uniqueKey: order.uniqueKey,
        status: "ERROR",
        boxCode: null,
        errorNote,
      });
      result.errors++;
      result.validated++;
      continue;
    }

    // Choose smallest box that fits
    const chosen = eligible[0];
    updates.push({
      uniqueKey: order.uniqueKey,
      status: "READY",
      boxCode: chosen.boxCode,
      errorNote: "",
    });
    result.ready++;
    result.validated++;
  }

  // 5. Bulk update via UPDATE ... FROM (values)
  // Drizzle chưa hỗ trợ batch update tốt → loop từng dòng (vẫn nhanh với 100-1000 đơn)
  // Có thể optimize sau bằng SQL raw nếu cần
  for (const u of updates) {
    await db
      .update(orders)
      .set({
        status: u.status,
        boxCode: u.boxCode,
        errorNote: u.errorNote,
        updatedAt: new Date(),
      })
      .where(eq(orders.uniqueKey, u.uniqueKey));
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
