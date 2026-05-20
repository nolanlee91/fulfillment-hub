import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Proxy gate: redirect /login nếu chưa có session cookie.
 * Không validate session ở đây (chỉ check tồn tại) — layout (app)/layout.tsx
 * sẽ làm check sâu (DB lookup, role) khi render server component.
 *
 * Cron endpoints (/api/cron/*) bypass auth — chúng dùng Bearer CRON_SECRET.
 * /api/auth/* (login/logout) cũng bypass.
 */
const CANONICAL_HOST = "app-fulfillment.kdexpress.ca";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  // Redirect domain cũ (Railway *.up.railway.app, alias khác) → canonical
  // Bỏ qua localhost để dev không bị bounce lên prod.
  if (host && host !== CANONICAL_HOST && !host.startsWith("localhost")) {
    return NextResponse.redirect(
      `https://${CANONICAL_HOST}${request.nextUrl.pathname}${request.nextUrl.search}`,
      308
    );
  }

  const sid = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  // Đã có cookie + đang ở /login → đẩy về home
  if (sid && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Chưa có cookie + không phải /login → redirect
  if (!sid && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /**
     * Match tất cả EXCEPT:
     *   - /api/cron/*       (cron-job.org dùng Bearer CRON_SECRET)
     *   - /api/auth/*       (login/logout)
     *   - /_next/*          (Next.js assets)
     *   - /favicon.ico, /robots.txt, /sitemap.xml
     *   - File static (path chứa dấu chấm — logo.png, icon.png, ...)
     */
    "/((?!api/cron|api/auth|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
