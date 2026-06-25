import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncLogs } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { syncAllSheets } from "@/lib/sync/sync";
import { withAuth } from "@/lib/auth/api-guard";
import type { CurrentUser } from "@/lib/auth/current-user";

export const maxDuration = 60; // Vercel/Next limit, Railway không bị giới hạn

// Khách tự sync: chặn spam Google Sheets API bằng cooldown ngắn.
const CUSTOMER_SYNC_COOLDOWN_MS = 20_000;

async function handleSync(_req: unknown, user: CurrentUser) {
  try {
    // CUSTOMER → ép scope theo customerId trong session (không nhận từ request →
    // khách không thể sync sheet của khách khác). STAFF/ADMIN → global như cũ.
    const customerId =
      user.role === "CUSTOMER" ? (user.customerId ?? undefined) : undefined;
    if (user.role === "CUSTOMER" && !customerId) {
      return NextResponse.json(
        { success: false, error: "Tài khoản chưa gắn khách hàng" },
        { status: 403 },
      );
    }

    if (customerId) {
      const triggeredBy = `customer:${customerId}`;
      const [last] = await db
        .select({ startedAt: syncLogs.startedAt })
        .from(syncLogs)
        .where(eq(syncLogs.triggeredBy, triggeredBy))
        .orderBy(desc(syncLogs.startedAt))
        .limit(1);
      if (last?.startedAt) {
        const elapsed = Date.now() - last.startedAt.getTime();
        if (elapsed < CUSTOMER_SYNC_COOLDOWN_MS) {
          const wait = Math.ceil((CUSTOMER_SYNC_COOLDOWN_MS - elapsed) / 1000);
          return NextResponse.json(
            { success: false, error: `Vui lòng đợi ${wait} giây rồi đồng bộ lại` },
            { status: 429 },
          );
        }
      }
    }

    const result = await syncAllSheets(
      customerId ? `customer:${customerId}` : "manual",
      customerId,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sync error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAuth(handleSync, {
  roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"],
});
export const GET = withAuth(handleSync, {
  roles: ["SUPER_ADMIN", "STAFF", "CUSTOMER"],
});
