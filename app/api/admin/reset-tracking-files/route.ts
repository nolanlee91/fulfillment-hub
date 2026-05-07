import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackingFiles } from "@/lib/db/schema";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * One-shot: xóa tất cả record trong bảng `tracking_files` để cron pull-apt
 * re-pull + re-process toàn bộ file APT còn trên SFTP.
 *
 * Mục đích: fix các đơn LABEL_CREATED có trackingNumber nhưng status không
 * progress thành IN_TRANSIT/DELIVERED — vì events lúc đó được parse khi đơn
 * chưa có trackingNumber (chưa import label), nên match miss.
 *
 * Sau khi chạy:
 *   1. TRUNCATE tracking_files
 *   2. Lần pull-apt cron tới (max 15 phút), re-process tất cả file APT
 *      trên SFTP (Canada Post giữ ~30 ngày)
 *   3. Events match được với đơn → status progress đúng
 */
async function handler(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "CRON_SECRET chưa setup" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const deleted = await db
    .delete(trackingFiles)
    .returning({ filename: trackingFiles.filename });

  return NextResponse.json({
    success: true,
    deletedCount: deleted.length,
    message: `Đã xóa ${deleted.length} record từ tracking_files. Lần pull-apt cron tới (max 15 phút) sẽ re-pull + re-process tất cả file APT trên SFTP. Anh có thể vào cron-job.org → Pull APT Canada Post → Execute now để chạy ngay.`,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
