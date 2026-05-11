import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser, type Role } from "./current-user";

export interface AuthOptions {
  roles?: Role[];
}

type Handler<TContext> = (
  req: NextRequest,
  user: CurrentUser,
  context: TContext,
) => Promise<NextResponse> | NextResponse;

/**
 * Wrapper cho API route handler — guard auth + role, convert lỗi thành 401/403.
 * - Không opts.roles: chỉ cần login (mọi role).
 * - opts.roles: chỉ role trong list được vào.
 *
 *   export const POST = withAuth(async (req, user) => {...}, { roles: ["STAFF", "SUPER_ADMIN"] });
 */
export function withAuth<TContext = unknown>(
  handler: Handler<TContext>,
  opts: AuthOptions = {},
) {
  return async (req: NextRequest, context: TContext) => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Chưa đăng nhập" },
        { status: 401 },
      );
    }
    if (opts.roles && !opts.roles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Không có quyền truy cập" },
        { status: 403 },
      );
    }
    return handler(req, user, context);
  };
}
