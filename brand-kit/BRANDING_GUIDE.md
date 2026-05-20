# Hướng dẫn thay logo / favicon cho app Next.js (App Router)

Tài liệu này để áp dụng cho **mọi app KDExpress** (fulfillment, checkout, ...) khi cần update branding. Đã verified trên `fulfillment-hub` ngày 2026-05-20.

> **Cách dùng cho app khác:** Folder `brand-kit/` chứa cặp file `BRANDING_GUIDE.md` + `logo.png` (master). Khi apply sang repo khác:
> 1. Copy `logo.png` → `public/logo.png` của app đó (sidebar + login sẽ load từ đây)
> 2. Copy `logo.png` → `app/icon.png` của app đó (Next.js auto thành favicon)
> 3. Mở `BRANDING_GUIDE.md` này, làm theo Bước 2-4 ở dưới
> 4. **Đừng quên check middleware matcher** — xem GOTCHA ở cuối file

## 4 chỗ cần thay

| # | Vị trí | File | Hiệu ứng |
|---|---|---|---|
| 1 | Sidebar (sau khi login) | `components/sidebar.tsx` | Header trái màn hình |
| 2 | Trang Login | `app/login/page.tsx` | Logo trên form đăng nhập |
| 3 | Favicon (icon tab) | `app/icon.png` | Icon hiện ở tab trình duyệt |
| 4 | Tab title | `app/layout.tsx` (`metadata.title`) | Tên hiện ở tab trình duyệt |

## Bước 1 — Đặt file ảnh

```
public/logo.png        # Logo dùng cho sidebar + login (qua next/image)
app/icon.png           # Favicon (Next.js auto-handle thành <link rel="icon">)
```

Xóa `app/favicon.ico` cũ nếu là Vercel default (Vercel triangle):
```bash
rm app/favicon.ico
```

> **Lưu ý:** Next.js App Router tự sinh `<link rel="icon">` từ file `app/icon.{png,jpg,svg}` — không cần config trong `<head>`. Xem `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`.

## Bước 2 — Sidebar

Trong file sidebar (vd `components/sidebar.tsx`):

```tsx
// Thêm import
import Image from "next/image";

// Trong JSX, thay khối <div gradient box + icon + h1 + p> bằng:
<div
  className="px-5 py-5 border-b flex flex-col items-start gap-1"
  style={{ borderColor: "var(--sidebar-border)" }}
>
  <Image
    src="/logo.png"
    alt="KDExpress"
    width={187}                  /* chiều thật của ảnh */
    height={92}
    priority                     /* logo above-the-fold, ưu tiên load */
    className="h-9 w-auto"        /* fix chiều cao 36px, width auto theo tỷ lệ */
  />
  <p
    className="text-[10px] tracking-[0.12em] font-medium lowercase"
    style={{ color: "var(--sidebar-text-muted)" }}
  >
    fulfillment.hub            {/* tên app phụ — đổi theo từng app */}
  </p>
</div>
```

## Bước 3 — Trang Login

Cùng pattern, cỡ ảnh lớn hơn (`h-14` ≈ 56px), căn giữa:

```tsx
import Image from "next/image";

<div className="flex flex-col items-center gap-2 mb-6">
  <Image
    src="/logo.png"
    alt="KDExpress"
    width={187}
    height={92}
    priority
    className="h-14 w-auto"
  />
  <p
    className="text-[10px] tracking-[0.12em] font-medium lowercase"
    style={{ color: "var(--text-muted)" }}
  >
    fulfillment.hub
  </p>
</div>
```

## Bước 4 — Tab title

`app/layout.tsx`:

```tsx
export const metadata: Metadata = {
  title: "KDExpress Fulfillment",   // đổi theo từng app
  description: "...",
};
```

## ⚠️ GOTCHA QUAN TRỌNG — Middleware chặn file static

Nếu app dùng middleware (`middleware.ts` hoặc `proxy.ts`) để force auth, **PHẢI exclude file static khỏi matcher**. Nếu không, request `/logo.png` cũng bị redirect về `/login` → browser nhận HTML thay vì PNG → broken image (icon vỡ + alt text hiện).

**Matcher đúng** — exclude path chứa dấu chấm:

```ts
export const config = {
  matcher: [
    // .*\..* loại bỏ MỌI file có extension (.png, .ico, .svg, .css, .js, ...)
    "/((?!api/cron|api/auth|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\..*).*)",
  ],
};
```

**Triệu chứng nếu quên:** logo hiện ô vuông broken + chữ alt text trên trang login. Mở DevTools Network → thấy `/logo.png` trả 307 redirect về `/login?next=/logo.png`.

## Tỷ lệ ảnh & responsive

- File `avata.png` / `logo.png` thường ngang (vd 187×92, tỷ lệ ~2:1). Dùng `h-X w-auto` để giữ tỷ lệ, không bị méo.
- Sidebar (cố định 240px width): `h-9` đến `h-10` là vừa.
- Login (centered): `h-12` đến `h-16` tuỳ độ to muốn nhấn.
- Nếu logo là vuông (icon-only), có thể fix cả `w-X h-X`.

## Test sau khi push

1. Đợi Railway deploy (~1-2 phút).
2. **Hard refresh** (Ctrl+Shift+R hoặc Cmd+Shift+R) để bypass cache.
3. Check:
   - Tab title đã đổi chưa
   - Favicon (icon tab) đã đổi chưa
   - Vào `/login` xem logo
   - Login vào app, check sidebar
4. Nếu vẫn vỡ ảnh → mở DevTools Network → tìm request `/logo.png`:
   - Status 200 + image/png → OK
   - Status 307 → middleware đang chặn, xem GOTCHA ở trên
   - Status 404 → file chưa được commit hoặc đặt sai path

## Apply sang app khác (vd checkout)

1. Copy `public/logo.png` + `app/icon.png` sang repo mới
2. Xoá `app/favicon.ico` cũ
3. Áp dụng pattern Bước 2 + 3 cho sidebar/login của app đó (cấu trúc CSS có thể khác — chú ý `--sidebar-bg`, `--sidebar-text-muted` vs `--bg-primary`, `--text-muted`)
4. Update `metadata.title` ở `app/layout.tsx`
5. **CHECK middleware matcher** — nếu app dùng auth gate, fix theo GOTCHA
6. Đổi sub-text dưới logo theo tên app (`fulfillment.hub`, `checkout.hub`, …)
