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

interface PerTrackingSummary {
  trackingNumber: string;
  latestEvent: AptEvent;
  finalStatus: TrackingStatus;
  deliveredAt: Date | null;
  newAttention: AttentionUpdate | null;
}

/**
 * Gộp event theo tracking number → tóm tắt status + attention từ batch event này.
 *
 * Logic finalStatus:
 *   - Nếu có BẤT KỲ event nào classify = DELIVERED (forward delivery, không phải RTS-completed)
 *     → DELIVERED (terminal).
 *   - Nếu latest event classify = FAILED → FAILED.
 *   - Else → IN_TRANSIT.
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
      cls: classifyEvent(ev.eventCode, ev.returnFlag),
    }));

    // finalStatus
    let finalStatus: TrackingStatus = "IN_TRANSIT";
    let deliveredAt: Date | null = null;
    for (const c of classified) {
      if (c.cls.status === "DELIVERED") {
        finalStatus = "DELIVERED";
        if (!deliveredAt || c.ev.eventAt < deliveredAt) deliveredAt = c.ev.eventAt;
      }
    }
    if (finalStatus !== "DELIVERED") {
      const latestCls = classified[classified.length - 1].cls;
      if (latestCls.status === "FAILED") finalStatus = "FAILED";
    }

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

    out.set(tn, { trackingNumber: tn, latestEvent, finalStatus, deliveredAt, newAttention });
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
 * Status:
 *   - Không downgrade DELIVERED.
 *   - Không downgrade FAILED trừ khi status mới = DELIVERED.
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

    let setStatus: TrackingStatus | null = sum.finalStatus;
    if (ord.status === "DELIVERED") setStatus = null;
    else if (ord.status === "FAILED" && sum.finalStatus !== "DELIVERED") setStatus = null;

    const update: Record<string, unknown> = { updatedAt: now };

    if (setStatus) {
      update.status = setStatus;
      if (setStatus === "DELIVERED") {
        update.deliveredAt = sum.deliveredAt ?? sum.latestEvent.eventAt;
      }
    }

    const finalStatusAfter = setStatus ?? ord.status;
    if (finalStatusAfter === "DELIVERED" || finalStatusAfter === "FAILED") {
      if (ord.attentionReason !== null) {
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
