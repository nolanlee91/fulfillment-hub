import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { type AptEvent } from "./parser-apt";
import { classifyEvent, type TrackingCategory } from "./event-codes";

interface PerTrackingSummary {
  trackingNumber: string;
  latestEvent: AptEvent;
  latestCategory: TrackingCategory;
  hasDelivered: boolean;
  deliveredAt: Date | null; // event time của event DELIVERED đầu tiên (sớm nhất)
}

/**
 * Gộp event theo tracking number → tóm tắt status cuối + thời gian.
 * Quy tắc:
 *   - Nếu bất kỳ event nào là DELIVERED → coi như DELIVERED (terminal).
 *   - Nếu KHÔNG có DELIVERED và event mới nhất là FAILED → FAILED.
 *   - Còn lại → IN_TRANSIT.
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
    const latestCategory = classifyEvent(
      latestEvent.eventCode,
      latestEvent.returnFlag,
    );

    let hasDelivered = false;
    let deliveredAt: Date | null = null;
    for (const ev of list) {
      const cat = classifyEvent(ev.eventCode, ev.returnFlag);
      if (cat === "DELIVERED") {
        hasDelivered = true;
        if (!deliveredAt || ev.eventAt < deliveredAt) deliveredAt = ev.eventAt;
      }
    }

    out.set(tn, { trackingNumber: tn, latestEvent, latestCategory, hasDelivered, deliveredAt });
  }
  return out;
}

export interface ProcessResult {
  totalEventsInFile: number;
  totalTrackings: number;
  totalMatched: number;
  totalUpdated: number;
  totalUnmatched: number;
  unmatchedSamples: string[]; // tối đa 5 tracking number không match
  byCategory: { delivered: number; failed: number; inTransit: number };
}

/**
 * Áp dụng kết quả parse lên DB. Quy tắc cập nhật trạng thái:
 *   - Đơn hiện đang DELIVERED → không thay đổi status (terminal).
 *   - Đơn hiện đang FAILED + event mới = DELIVERED → promote lên DELIVERED.
 *   - Còn lại → set theo `nextStatus` tính từ file.
 *
 * `lastTrackingEvent` / `lastTrackingAt` luôn cập nhật nếu event mới hơn DB hiện có.
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

    // Quyết định status mới
    let nextStatus: "DELIVERED" | "FAILED" | "IN_TRANSIT" | null;
    if (sum.hasDelivered) {
      nextStatus = "DELIVERED";
    } else if (sum.latestCategory === "FAILED") {
      nextStatus = "FAILED";
    } else {
      nextStatus = "IN_TRANSIT";
    }

    // Không downgrade DELIVERED. Không downgrade FAILED trừ khi mới = DELIVERED.
    let setStatus: typeof nextStatus | null = nextStatus;
    if (ord.status === "DELIVERED") setStatus = null;
    else if (ord.status === "FAILED" && nextStatus !== "DELIVERED") setStatus = null;

    // lastTrackingAt — chỉ update nếu event mới hơn
    const newLastAt = sum.latestEvent.eventAt;
    const currentLastAt = ord.lastTrackingAt;
    const shouldUpdateLast =
      !currentLastAt || newLastAt.getTime() > currentLastAt.getTime();

    if (!setStatus && !shouldUpdateLast) continue;

    const update: Record<string, unknown> = { updatedAt: now };
    if (setStatus) {
      update.status = setStatus;
      if (setStatus === "DELIVERED") update.deliveredAt = sum.deliveredAt ?? newLastAt;
    }
    if (shouldUpdateLast) {
      update.lastTrackingEvent = `${sum.latestEvent.eventCode} — ${sum.latestEvent.descriptionEn}`;
      update.lastTrackingAt = newLastAt;
    }

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
