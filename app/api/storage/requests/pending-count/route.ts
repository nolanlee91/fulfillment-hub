import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/api-guard";
import { countPendingRequests } from "@/lib/storage/requests";

/** Số pickup request đang PENDING — cho badge noti sidebar. STAFF/SUPER_ADMIN. */
export const GET = withAuth(
  async () => {
    try {
      const count = await countPendingRequests();
      return NextResponse.json({ success: true, count });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { roles: ["SUPER_ADMIN", "STAFF"] },
);
