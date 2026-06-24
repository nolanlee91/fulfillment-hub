import { db } from "../db";
import { orders } from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { type AptEvent } from "./parser-apt";
import {
  classifyEvent,
  type AttentionReason,
  type TrackingStatus,
} from "./event-codes";

interface AttentionUpdate {
  reason: AttentionReason;
  at: Date;
  note: string;
}

// Ngưỡng coi 1 event vận chuyển (IN_TRANSIT) sau ngày giao là "nghi trả về".
// Để >24h nhằm bỏ qua event đến lệch thứ tự (out-of-order) cùng quanh lúc giao.
const POST_DELIVERY_MOVE_MARGIN_MS = 24 * 60 * 60 * 1000;

interface PerTrackingSummary {
  trackingNumber: string;
  latestEvent: AptEvent;
  // null = batch event này chỉ toàn event "thông tin" (vd: cập nhật ngày giao,
  // info điện tử) → không có tín hiệu status → giữ nguyên trạng thái hiện tại của đơn.
  finalStatus: TrackingStatus | null;
  // Thời điểm của event quyết định finalStatus — dùng để so với deliveredAt/lastTrackingAt
  // khi xét có nên override trạng thái terminal hay không (chống event đến lệch thứ tự).
  statusAt: Date | null;
  deliveredAt: Date | null;
  newAttention: AttentionUpdate | null;
}

/**
 * Gộp event theo tracking number → tóm tắt status + attention từ batch event này.
 *
 * Logic finalStatus (chỉ xét event có tín hiệu status, bỏ qua event "thông tin"):
 *   - Nếu có BẤT KỲ event nào classify = DELIVERED (forward delivery, không phải RTS-completed)
 *     → DELIVERED (terminal).
 *   - Nếu event-có-tín-hiệu mới nhất = FAILED → FAILED.
 *   - Nếu có event vận chuyển thật → IN_TRANSIT.
 *   - Nếu chỉ toàn event "thông tin" (status null) → null = không đổi trạng thái
 *     (đơn vừa tạo label nhận event "Expected delivery date updated" sẽ KHÔNG bị
 *     đẩy lên IN_TRANSIT, giữ LABEL_CREATED).
 *
 * Logic newAttention: đi từ event mới nhất ngược về cũ, lấy event đầu tiên có
 * `classification.attention !== null`. Nếu là "CLEAR" thì newAttention = null
 * (terminal status sẽ tự clear flag bên ngoài). Nếu là một AttentionReason cụ thể
 * thì set thông tin tương ứng.
 */
function summarizePerTracking(events: AptEvent[]): Map<string, PerTrackingSummary> {
  const map = new Map<string, AptEvent[]>();
  for (const ev of events) {
    if (!map.has(ev.trackingNumber)) map.set(ev.trackingNumber, []);
    map.get(ev.trackingNumber)!.push(ev);
  }

  const out = new Map<string, PerTrackingSummary>();
  for (const [tn, list] of map.entries()) {
    list.sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime());
    const latestEvent = list[list.length - 1];

    const classified = list.map((ev) => ({
      ev,
      cls: classifyEvent(ev.eventCode, ev.returnFlag, ev.descriptionEn),
    }));

    // finalStatus — quyết định theo event MANG-TÍN-HIỆU MỚI NHẤT (theo timestamp).
    //   DELIVERED/FAILED = trạng thái "mạnh": cái mới nhất trong 2 cái này thắng
    //   (giao rồi bị trả về → FAILED; trả rồi giao lại → DELIVERED).
    //   IN_TRANSIT KHÔNG hạ được trạng thái mạnh (event "item processed" xuất hiện
    //   sau khi đã giao không làm "mất giao").
    //   Không có trạng thái mạnh → IN_TRANSIT nếu có event vận chuyển, else null.
    let finalStatus: TrackingStatus | null = null;
    let statusAt: Date | null = null;
    let deliveredAt: Date | null = null;
    let hasTransit = false;
    for (const c of classified) {
      // classified đã sort tăng dần theo eventAt → ghi đè để giữ cái mới nhất.
      if (c.cls.status === "DELIVERED" || c.cls.status === "FAILED") {
        finalStatus = c.cls.status;
        statusAt = c.ev.eventAt;
        if (c.cls.status === "DELIVERED") deliveredAt = c.ev.eventAt;
      } else if (c.cls.status === "IN_TRANSIT") {
        hasTransit = true;
      }
    }
    if (finalStatus === null && hasTransit) {
      finalStatus = "IN_TRANSIT";
      for (let i = classified.length - 1; i >= 0; i--) {
        if (classified[i].cls.status === "IN_TRANSIT") {
          statusAt = classified[i].ev.eventAt;
          break;
        }
      }
    }
    // Chốt FAILED ở cuối → không lưu deliveredAt (đơn đã bị trả về).
    if (finalStatus !== "DELIVERED") deliveredAt = null;

    // newAttention: đi từ cuối lên, lấy event đầu tiên có attention != null
    let newAttention: AttentionUpdate | null = null;
    for (let i = classified.length - 1; i >= 0; i--) {
      const c = classified[i];
      if (c.cls.attention === null) continue;
      if (c.cls.attention !== "CLEAR") {
        newAttention = {
          reason: c.cls.attention,
          at: c.ev.eventAt,
          note: `${c.ev.eventCode} — ${c.ev.descriptionEn}`.slice(0, 200),
        };
      }
      break;
    }

    out.set(tn, { trackingNumber: tn, latestEvent, finalStatus, statusAt, deliveredAt, newAttention });
  }
  return out;
}

export interface ProcessResult {
  totalEventsInFile: number;
  totalTrackings: number;
  totalMatched: number;
  totalUpdated: number;
  totalUnmatched: number;
  unmatchedSamples: string[];
  byCategory: { delivered: number; failed: number; inTransit: number };
}

/**
 * Áp dụng kết quả parse lên DB.
 *
 * Status (DELIVERED/FAILED là "terminal mềm" — override nhau theo timestamp):
 *   - DELIVERED giữ nguyên, trừ khi có event trả-về (FAILED) MỚI HƠN ngày giao
 *     (giao rồi bị khách từ chối/trả về) → FAILED.
 *   - FAILED giữ nguyên, trừ khi có event GIAO mới hơn → DELIVERED (giao lại).
 *   - IN_TRANSIT/info KHÔNG bao giờ hạ được DELIVERED/FAILED.
 *
 * Attention (cờ "cần chú ý"):
 *   - Nếu status sau update = DELIVERED hoặc FAILED → CLEAR cờ (set null).
 *   - Nếu status sau update = IN_TRANSIT (hoặc trước đó):
 *       + Có attention mới trong batch event này → set.
 *       + Không có → giữ nguyên flag hiện tại trong DB (event intermediate
 *         như "Item processed" không xóa flag NOTICE_CARD/ADDRESS_ERROR cũ).
 */
export async function processAptEvents(
  events: AptEvent[],
): Promise<ProcessResult> {
  const summaries = summarizePerTracking(events);
  const trackingNumbers = Array.from(summaries.keys());

  if (trackingNumbers.length === 0) {
    return {
      totalEventsInFile: events.length,
      totalTrackings: 0,
      totalMatched: 0,
      totalUpdated: 0,
      totalUnmatched: 0,
      unmatchedSamples: [],
      byCategory: { delivered: 0, failed: 0, inTransit: 0 },
    };
  }

  const existing = await db
    .select({
      uniqueKey: orders.uniqueKey,
      trackingNumber: orders.trackingNumber,
      status: orders.status,
      lastTrackingAt: orders.lastTrackingAt,
      deliveredAt: orders.deliveredAt,
      attentionReason: orders.attentionReason,
    })
    .from(orders)
    .where(inArray(orders.trackingNumber, trackingNumbers));

  const matchedTrackings = new Set(existing.map((o) => o.trackingNumber!));
  const unmatched = trackingNumbers.filter((tn) => !matchedTrackings.has(tn));

  let totalUpdated = 0;
  const counts = { delivered: 0, failed: 0, inTransit: 0 };
  const now = new Date();

  for (const ord of existing) {
    const sum = summaries.get(ord.trackingNumber!);
    if (!sum) continue;

    const next = sum.finalStatus;
    let setStatus: TrackingStatus | null = next;

    if (ord.status === "DELIVERED") {
      // Giữ DELIVERED, TRỪ KHI có event trả-về (FAILED) MỚI HƠN ngày giao → giao
      // rồi bị trả về. So theo timestamp để không bị event đến lệch thứ tự hạ nhầm.
      const deliveredRef = ord.deliveredAt ?? ord.lastTrackingAt;
      if (
        next === "FAILED" &&
        sum.statusAt &&
        (!deliveredRef || sum.statusAt.getTime() > deliveredRef.getTime())
      ) {
        setStatus = "FAILED";
      } else {
        setStatus = null;
      }
    } else if (ord.status === "FAILED") {
      // Giữ FAILED, TRỪ KHI có event GIAO (DELIVERED) mới hơn event gần nhất → giao lại.
      if (
        next === "DELIVERED" &&
        sum.statusAt &&
        (!ord.lastTrackingAt || sum.statusAt.getTime() > ord.lastTrackingAt.getTime())
      ) {
        setStatus = "DELIVERED";
      } else {
        setStatus = null;
      }
    }
    // else (NEW/READY/EXPORTED/LABEL_CREATED/IN_TRANSIT): setStatus = next (có thể null).

    const update: Record<string, unknown> = { updatedAt: now };

    if (setStatus) {
      update.status = setStatus;
      if (setStatus === "DELIVERED") {
        update.deliveredAt = sum.deliveredAt ?? sum.statusAt ?? sum.latestEvent.eventAt;
      } else if (setStatus === "FAILED") {
        // Chuyển DELIVERED → FAILED (giao rồi trả) thì xóa ngày giao cũ.
        update.deliveredAt = null;
      }
    }

    const finalStatusAfter = setStatus ?? ord.status;

    // Heuristic: đơn đã DELIVERED nhưng có event vận chuyển (IN_TRANSIT) MỚI HƠN
    // ngày giao quá ngưỡng → nghi hàng bị trả về. Carrier không hạ DELIVERED và
    // không phát mã RTS (vd giao vào parcel locker rồi thu hồi) nên đây là tín
    // hiệu duy nhất. KHÔNG đổi status (giữ DELIVERED), chỉ nổi cờ cho CSKH.
    const deliveredRefForMove = ord.deliveredAt ?? ord.lastTrackingAt;
    const isPostDeliveryMove =
      finalStatusAfter === "DELIVERED" &&
      next === "IN_TRANSIT" &&
      !!sum.statusAt &&
      !!deliveredRefForMove &&
      sum.statusAt.getTime() >
        deliveredRefForMove.getTime() + POST_DELIVERY_MOVE_MARGIN_MS;

    if (isPostDeliveryMove) {
      // Set một lần (không spam attentionAt mỗi file event sau đó).
      if (ord.attentionReason !== "RETURN_SUSPECTED") {
        update.attentionReason = "RETURN_SUSPECTED";
        update.attentionAt = sum.statusAt;
        update.attentionNote =
          `Có chuyển động sau khi đã giao (${sum.latestEvent.eventCode} — ${sum.latestEvent.descriptionEn}) — nghi hàng bị trả về`.slice(
            0,
            200,
          );
      }
    } else if (finalStatusAfter === "FAILED") {
      // FAILED rõ ràng → trạng thái đã nói hết, clear mọi cờ (kể cả RETURN_SUSPECTED).
      if (ord.attentionReason !== null) {
        update.attentionReason = null;
        update.attentionAt = null;
        update.attentionNote = null;
      }
    } else if (finalStatusAfter === "DELIVERED") {
      // Đã giao → clear cờ giao-hàng, NHƯNG GIỮ cờ RETURN_SUSPECTED (post-delivery,
      // event "info"/transit sau đó không được xóa nghi-ngờ trả về).
      if (
        ord.attentionReason !== null &&
        ord.attentionReason !== "RETURN_SUSPECTED"
      ) {
        update.attentionReason = null;
        update.attentionAt = null;
        update.attentionNote = null;
      }
    } else if (sum.newAttention) {
      update.attentionReason = sum.newAttention.reason;
      update.attentionAt = sum.newAttention.at;
      update.attentionNote = sum.newAttention.note;
    }

    const newLastAt = sum.latestEvent.eventAt;
    const currentLastAt = ord.lastTrackingAt;
    const shouldUpdateLast =
      !currentLastAt || newLastAt.getTime() > currentLastAt.getTime();
    if (shouldUpdateLast) {
      update.lastTrackingEvent = `${sum.latestEvent.eventCode} — ${sum.latestEvent.descriptionEn}`;
      update.lastTrackingAt = newLastAt;
    }

    // Skip nếu chỉ có updatedAt (không có thay đổi gì khác)
    if (Object.keys(update).length === 1) continue;

    await db.update(orders).set(update).where(eq(orders.uniqueKey, ord.uniqueKey));
    totalUpdated += 1;

    if (setStatus === "DELIVERED") counts.delivered += 1;
    else if (setStatus === "FAILED") counts.failed += 1;
    else if (setStatus === "IN_TRANSIT") counts.inTransit += 1;
  }

  return {
    totalEventsInFile: events.length,
    totalTrackings: trackingNumbers.length,
    totalMatched: existing.length,
    totalUpdated,
    totalUnmatched: unmatched.length,
    unmatchedSamples: unmatched.slice(0, 5),
    byCategory: counts,
  };
}
