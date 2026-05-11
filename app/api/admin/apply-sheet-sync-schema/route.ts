import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-shot: thêm cột synced_to_sheet_at vào orders + index.
 * Idempotent (IF NOT EXISTS). SUPER_ADMIN only.
 * Xóa endpoint sau khi chạy 1 lần.
 */
export const GET = withAuth(
  async () => {
    try {
      await db.execute(
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS synced_to_sheet_at timestamp`,
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS orders_unsynced_sheet_idx ON orders(synced_to_sheet_at)`,
      );
      return NextResponse.json({
        success: true,
        message:
          "Đã thêm cột synced_to_sheet_at + index. Endpoint này nên được xóa sau khi chạy 1 lần.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 },
      );
    }
  },
  { roles: ["SUPER_ADMIN"] },
);
