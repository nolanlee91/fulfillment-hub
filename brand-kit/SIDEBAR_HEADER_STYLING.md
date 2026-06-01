# Sidebar Header Styling — Khắc phục logo trắng trên nền tối

Tài liệu phụ cho [`BRANDING_GUIDE.md`](BRANDING_GUIDE.md). Áp dụng khi:
- Logo PNG có **nền trắng** (không transparent)
- Sidebar app dùng **theme dark** (nền sidebar đậm như `#111315`, `#1a1f2e`...)
- Kết quả: ô trắng của logo nổi lên trên nền đen → nhìn xấu

## Vấn đề

```
┌─────────────────────────┐
│  ┌──────┐               │  ← nền sidebar đen
│  │ LOGO │               │  ← nền PNG trắng → ô trắng lồi
│  │ TEXT │               │
│  └──────┘               │
│  fulfillment.hub        │  ← text trên nền đen
├─────────────────────────┤
│  > Dashboard            │
│  > Active Orders        │
│  ...                    │
└─────────────────────────┘
```

## Giải pháp

**Đổi nền của chỉ phần header (logo + sub-text) sang trắng** để khớp với nền PNG. Phần sidebar bên dưới (menu items) giữ nguyên dark.

```
┌─────────────────────────┐
│  ┌──────┐               │  ← nền header TRẮNG
│  │ LOGO │               │  ← logo blend in seamless
│  │ TEXT │               │
│  └──────┘               │
│  fulfillment.hub        │  ← text màu đậm trên nền trắng
├─────────────────────────┤  ← border subtle ngăn cách
│  > Dashboard            │  ← phần dưới vẫn DARK
│  > Active Orders        │
│  ...                    │
└─────────────────────────┘
```

## Code

Trong file `components/sidebar.tsx` (hoặc tương đương), tìm block div bao logo + sub-text:

### Trước

```tsx
<div
  className="px-5 py-5 border-b flex flex-col items-start gap-1"
  style={{ borderColor: "var(--sidebar-border)" }}
>
  <Image src="/logo.png" ... className="h-9 w-auto" />
  <p
    className="text-[10px] tracking-[0.12em] font-medium lowercase"
    style={{ color: "var(--sidebar-text-muted)" }}
  >
    fulfillment.hub
  </p>
</div>
```

### Sau

```tsx
<div
  className="px-5 py-5 border-b flex flex-col items-start gap-1"
  style={{
    backgroundColor: "#ffffff",              /* trùng nền PNG */
    borderColor: "rgba(0, 0, 0, 0.08)",      /* border subtle ngăn cách */
  }}
>
  <Image src="/logo.png" ... className="h-9 w-auto" />
  <p
    className="text-[10px] tracking-[0.12em] font-semibold lowercase"
    style={{ color: "#4b5563" }}             /* gray-600 đậm vừa */
  >
    fulfillment.hub
  </p>
</div>
```

## Giải thích các giá trị

| Property | Giá trị | Lý do |
|---|---|---|
| `backgroundColor` | `#ffffff` | Khớp chính xác nền trắng của logo PNG. Nếu logo dùng off-white (vd `#fafafa`), thử match cho khớp. |
| `borderColor` | `rgba(0,0,0,0.08)` | Ngăn cách subtle với phần dark bên dưới. Đủ thấy để mắt phân biệt 2 vùng, không quá đậm. |
| Sub-text `color` | `#4b5563` (gray-600) | Trên nền trắng cần đậm hơn `var(--sidebar-text-muted)` cũ. `#6b7280` (gray-500) cũng OK nhưng hơi nhạt. |
| Sub-text `font-weight` | `font-semibold` | Đậm hơn `font-medium` 1 bậc để dễ đọc trên trắng. |

## Lưu ý

- **Chỉ áp dụng cho header div bao logo**, KHÔNG động vào `<aside>` parent (giữ dark cho phần menu items).
- Nếu logo có background **transparent** thay vì trắng → không cần fix này, logo tự blend với màu sidebar.
- Nếu app dùng theme **light mode** rồi → không cần fix này.

## Liên quan

- Pattern logo + favicon: xem [`BRANDING_GUIDE.md`](BRANDING_GUIDE.md)
- Verified trên `fulfillment-hub` ngày 2026-05-29 (commit `87469c6` + `223346d`)
