import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackingFiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseAptFile } from "@/lib/carrier-tracking/parser-apt";
import { processAptEvents } from "@/lib/carrier-tracking/processor";
import { withAuth } from "@/lib/auth/api-guard";

export const maxDuration = 60;

export const POST = withAuth(
  async (req) => {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: "Chưa upload file" },
        { status: 400 },
      );
    }

    const filename =
      "name" in file && typeof (file as File).name === "string"
        ? (file as File).name
        : "";

    if (!filename) {
      return NextResponse.json(
        { success: false, error: "File không có tên" },
        { status: 400 },
      );
    }

    // Dedup: kiểm tra file đã xử lý chưa
    const existing = await db
      .select()
      .from(trackingFiles)
      .where(eq(trackingFiles.filename, filename))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `File "${filename}" đã được xử lý lúc ${existing[0].processedAt.toISOString()}. Đổi tên file nếu muốn xử lý lại.`,
        },
        { status: 409 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const events = parseAptFile(buffer);

    if (events.length === 0) {
      return NextResponse.json(
        { success: false, error: "File không có dòng event hợp lệ nào" },
        { status: 400 },
      );
    }

    const result = await processAptEvents(events);

    await db.insert(trackingFiles).values({
      filename,
      source: "APT",
      totalRows: result.totalEventsInFile,
      totalUpdated: result.totalUpdated,
    });

    return NextResponse.json({
      success: true,
      filename,
      ...result,
      message: `Đã xử lý ${result.totalEventsInFile} sự kiện cho ${result.totalTrackings} đơn. Cập nhật ${result.totalUpdated} đơn (${result.byCategory.delivered} đã giao, ${result.byCategory.failed} thất bại, ${result.byCategory.inTransit} đang vận chuyển). ${result.totalUnmatched} tracking không tìm thấy trong hệ thống.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Tracking events upload error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
