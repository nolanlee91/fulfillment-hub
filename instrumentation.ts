/**
 * Next.js instrumentation: register() chạy 1 lần khi server khởi động.
 * Dùng để bật scheduler in-app (tự pull tracking APT + detect-stuck) — app tự gọi
 * định kỳ, không cần dịch vụ cron ngoài.
 *
 * Chỉ chạy ở runtime Node.js + production (next start trên Railway). KHÔNG chạy khi
 * `next dev` để tránh máy local đụng vào prod DB. Đặt DISABLE_IN_APP_CRON=true để tắt.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.DISABLE_IN_APP_CRON !== "true"
  ) {
    const { startSchedulers } = await import("./instrumentation-node");
    startSchedulers();
  }
}
