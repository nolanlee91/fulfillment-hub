import { runPullApt } from "@/lib/carrier-tracking/pull-apt";
import { runDetectStuck } from "@/lib/carrier-tracking/detect-stuck";

// Chu kỳ 4 giờ = 6 lần/ngày (đủ để bắt kịp event APT, không cần quét dày).
const CYCLE_MS = 4 * 60 * 60_000;
// An toàn: mỗi chu kỳ pull tối đa DRAIN_CAP lượt (mỗi lượt 20 file) để nạp hết tồn.
const DRAIN_CAP = 50;

let running = false;

async function runCycle() {
  if (running) return; // chống chồng lượt nếu lượt trước chưa xong
  running = true;
  try {
    // Pull-apt: lặp tới khi hết file pending → dù 4h mới quét vẫn nạp hết backlog.
    let totalUpdated = 0;
    let loops = 0;
    for (;;) {
      const r = await runPullApt();
      totalUpdated += r.updated;
      loops += 1;
      if (r.remainingNextRun <= 0 || loops >= DRAIN_CAP) break;
    }
    if (totalUpdated > 0) {
      console.log(`[cron] pull-apt: cập nhật ${totalUpdated} đơn (${loops} lượt)`);
    }

    const s = await runDetectStuck();
    if (s.flagged || s.cleared) console.log(`[cron] detect-stuck: ${s.message}`);
  } catch (e) {
    console.error("[cron] cycle error:", e);
  } finally {
    running = false;
  }
}

let started = false;

/** Khởi động scheduler in-app (gọi 1 lần từ instrumentation register). */
export function startSchedulers() {
  if (started) return; // idempotent — register có thể được gọi lại
  started = true;
  setTimeout(runCycle, 30_000); // chạy lần đầu 30s sau khi server sẵn sàng
  setInterval(runCycle, CYCLE_MS); // rồi mỗi 4 giờ
  console.log("[cron] in-app schedulers started (chu kỳ 4h: pull-apt + detect-stuck)");
}
