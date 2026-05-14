# KDExpress Design System

Tài liệu tham chiếu để xây / refactor app nội bộ KDExpress đồng bộ với **App Hub** và **Fulfillment Hub**.

Aesthetic: **logistics-tech / enterprise SaaS / internal operations platform**. Reference: Linear, Retool, modern logistics OS.

---

## 1. Triết lý

- Dark-first, gần-black navy. Tuyệt đối **không** light mode trong phạm vi nội bộ.
- **Brand color = emerald (logo)**. Primary action accent = cùng emerald → 1 màu thương hiệu duy nhất xuyên app.
- **Amber/cam = warning only**. KHÔNG dùng cho button chính, nav active, hover, card highlight.
- Calm > loud. Subtle border > harsh divider. Neutral hover > tinted hover.
- Practical first — đây là tool vận hành cho warehouse staff, không phải landing page.

---

## 2. Color Tokens

### 2.1 CSS Variables (copy-paste vào `:root`)

```css
:root {
  /* === Surfaces (dark navy stack) === */
  --bg-primary: #0a1424;      /* root background, gần-black */
  --bg-secondary: #0f1c33;    /* card, sidebar, header */
  --bg-tertiary: #152744;     /* input, button secondary, sidebar active */
  --bg-elevated: #1a2f50;     /* hover/elevated state */

  /* === Borders (neutral white alpha, blend tự nhiên) === */
  --border: rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.1);

  /* === Text === */
  --text-primary: #e4ecf7;    /* off-white, title */
  --text-secondary: #8da4c4;  /* body, label */
  --text-muted: #5e7798;      /* hint, eyebrow */

  /* === Primary accent — emerald (= logo KDExpress) === */
  --accent: #10b981;
  --accent-hover: #0d9669;
  --accent-bg: rgba(16, 185, 129, 0.08);
  --accent-strong: rgba(16, 185, 129, 0.18);

  /* === Semantic colors (saturation thấp, không neon) === */
  --color-success: #34d399;   /* emerald-400 */
  --color-info: #60a5fa;      /* blue-400 */
  --color-warning: #fbbf24;   /* amber-400 */
  --color-danger: #f87171;    /* red-400 */
  --color-purple: #a78bfa;
  --color-sky: #38bdf8;
  --color-teal: #2dd4bf;
  --color-orange: #fb923c;
  --color-pink: #f472b6;
  --color-slate: #94a3b8;

  /* === Layout === */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 14px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.25);

  --transition-fast: 120ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-feature-settings: "tnum" 1, "ss01" 1;
}
```

### 2.2 Sử dụng token nào cho gì

| Element | Token | Lý do |
|---|---|---|
| Page background | `--bg-primary` | Gần-black, sâu nhất |
| Card, sidebar, header | `--bg-secondary` | Nổi 1 lớp |
| Input, button secondary, table header | `--bg-tertiary` | Nổi 2 lớp, contrast hover |
| Hover/elevated | `--bg-elevated` | Nổi 3 lớp |
| Border mặc định | `--border` | Subtle, blend |
| Border hover/focus | `--border-strong` | Nhấn nhẹ |
| Action/active accent | `--accent` family | Emerald (logo) — primary brand |
| Warning, critical, COD | `--color-warning` `#fbbf24` | Amber — chỉ semantic |

---

## 3. Typography

### 3.1 Font

- 1 sans-serif duy nhất (Inter, Geist, system fallback). KHÔNG mix nhiều fonts.
- Font features: `font-feature-settings: "tnum" 1, "ss01" 1;` cho số tabular.

### 3.2 Hierarchy

```css
/* Page title — large, App Hub style */
.page-title {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1.15;
}
.page-title-accent {
  color: var(--accent);  /* 1 từ trong title được highlight */
}

/* Subtitle dưới title */
.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 6px;
}

/* Eyebrow — uppercase nhỏ, có gạch ngang trước */
.page-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 12px;
}
.page-eyebrow::before {
  content: "";
  width: 24px;
  height: 1px;
  background: var(--border-strong);
}

/* Section label trong page — "01 LABEL ─────" pattern */
.section-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: var(--text-muted);
  text-transform: uppercase;
  margin: 32px 0 18px;
}
.section-label::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}
.section-label .section-num {
  opacity: 0.55;
  font-size: 10px;
}

/* Sidebar section label */
.sidebar-section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--text-muted);
  text-transform: uppercase;
  padding: 0 1.25rem;
  margin: 1.5rem 0 0.5rem;
}
```

### 3.3 Quy tắc

- **Page title**: ngắn, 1-2 từ. Có thể split 1 từ amber/accent (vd "KDExpress **Dashboard**").
- **Section label**: uppercase nhỏ, letter-spacing rộng, muted gray. Có gạch ngang fill flex bên phải.
- **Body**: text-secondary (subtle), không trắng full.
- **Hint/muted**: text-muted, đừng đè text-secondary.
- Font-weight: dùng 600 thay vì 700 cho labels nhỏ — premium feel.

---

## 4. Components

### 4.1 Card

```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
}
.card-interactive { cursor: pointer; }
.card-interactive:hover {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px var(--border-strong);
}
```

**React wrapper** (TypeScript):

```tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: "default" | "lg" | "none";
  accentLeft?: string;  // Optional left strip color, vd "var(--accent)"
  children?: React.ReactNode;
}

const PADDING_MAP = { default: "p-5", lg: "p-6", none: "" };

export function Card({
  interactive, padding = "default", accentLeft,
  className = "", style, children, ...rest
}: CardProps) {
  return (
    <div
      className={`card ${interactive ? "card-interactive" : ""} ${PADDING_MAP[padding]} ${className}`}
      style={accentLeft ? { ...style, borderLeft: `3px solid ${accentLeft}` } : style}
      {...rest}
    >
      {children}
    </div>
  );
}
```

**Quy tắc:**
- Default padding `p-5` (20px). Không bao giờ < `p-4`.
- Hover **không dùng** `transform: translateY` (movement bị amateur). Chỉ border brighter + glow nhẹ.
- Border luôn `var(--border)`, hover `var(--border-strong)`.
- Đừng overlay nhiều card lồng nhau — nếu cần phân tách thêm, dùng `--bg-tertiary` cho inner element.

### 4.2 Button

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  border: 1px solid transparent;
  transition: background-color var(--transition-fast),
              border-color var(--transition-fast),
              color var(--transition-fast);
  cursor: pointer;
  user-select: none;
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* === Primary: dark surface + emerald border + text trắng + icon emerald === */
.btn-primary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--accent-strong);
}
.btn-primary:hover:not(:disabled) {
  background: var(--bg-elevated);
  border-color: var(--accent);
}
.btn-primary .material-symbols-outlined {
  color: var(--accent);
}

/* === Secondary: dark surface + neutral border, text mute → primary on hover === */
.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-color: var(--border);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--bg-elevated);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

/* === Danger: transparent + red border, fill mờ chỉ khi hover === */
.btn-danger {
  background: transparent;
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.25);
}
.btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.4);
}
```

**React wrapper:**

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  icon?: string;       // Material Symbol name
  iconSpin?: boolean;
  children?: React.ReactNode;
}

export function Button({
  variant = "primary", icon, iconSpin,
  className = "", children, type = "button", ...rest
}: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant} ${className}`} {...rest}>
      {icon && (
        <span className={`material-symbols-outlined text-[17px] ${iconSpin ? "animate-spin" : ""}`}>
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
```

**Quy tắc CRITICAL:**
- **KHÔNG bao giờ** dùng button có background full màu accent (`background: var(--accent)`). Đó là "orange/green rectangle" — admin template feel.
- Primary = dark surface + accent border + text trắng + icon accent. Subtle, premium.
- Hover chỉ đổi border + background, **không** `transform`.
- Disabled opacity 0.45, không 0.5.

### 4.3 Table

```css
.table-shell {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}
.table-base {
  width: 100%;
  font-size: 13px;
  border-collapse: separate;
  border-spacing: 0;
}
.table-base thead tr {
  background: var(--bg-secondary);  /* Blend với card, không bg-tertiary */
  position: sticky;
  top: 0;
  z-index: 1;
}
.table-base thead th {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 14px 14px;
  border-bottom: 1px solid var(--border);
}
.table-base tbody tr {
  transition: background-color var(--transition-fast);
}
.table-base tbody tr + tr td {
  border-top: 1px solid var(--border);
}
.table-base tbody tr:hover {
  background: rgba(255, 255, 255, 0.025);  /* Neutral, không amber/accent */
}
.table-base tbody tr.selected {
  background: rgba(255, 255, 255, 0.03);
}
.table-base tbody tr.selected td:first-child {
  box-shadow: inset 2px 0 0 var(--accent);  /* 2px accent line trái */
}
.table-base tbody td {
  padding: 12px 14px;
  vertical-align: middle;
}
```

**Quy tắc:**
- Table header KHÔNG `bg-tertiary` (nhảy ra khỏi shell). Dùng `bg-secondary` để blend.
- Hover row = neutral white tint 2.5%. **KHÔNG** tint accent — quá noisy.
- Selected row = 2px accent line ở `td:first-child` (inset box-shadow), background neutral.
- Padding rộng: header 14px, row 12px. Không < 9px.

### 4.4 Status Badges

```css
/* Base — tất cả badge đều height 22px, font 10px bold */
.badge-base,
[class*="status-"],
[class*="attention-"],
[class*="payment-"] {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  white-space: nowrap;
  line-height: 1;
}

/* === Order status (logistics workflow) === */
.status-NEW          { background: rgba(59, 130, 246, 0.12);  color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); }
.status-READY        { background: rgba(16, 185, 129, 0.12);  color: #34d399; border: 1px solid rgba(16, 185, 129, 0.25); }
.status-ERROR        { background: rgba(239, 68, 68, 0.10);   color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.22); }
.status-ERROR_UPDATED{ background: rgba(245, 158, 11, 0.12);  color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.25); }
.status-EXPORTED     { background: rgba(100, 116, 139, 0.18); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.28); }
.status-LABEL_CREATED{ background: rgba(139, 92, 246, 0.12);  color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.25); }
.status-IN_TRANSIT   { background: rgba(14, 165, 233, 0.12);  color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.25); }
.status-DELIVERED    { background: rgba(20, 184, 166, 0.12);  color: #2dd4bf; border: 1px solid rgba(20, 184, 166, 0.25); }
.status-FAILED       { background: rgba(249, 115, 22, 0.12);  color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.25); }

/* === Attention reasons === */
.attention-ADDRESS_ERROR { background: rgba(239, 68, 68, 0.12);  color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.25); }
.attention-DELAYED       { background: rgba(234, 179, 8, 0.12);  color: #facc15; border: 1px solid rgba(234, 179, 8, 0.25); }
.attention-NOTICE_CARD   { background: rgba(236, 72, 153, 0.12); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.25); }
.attention-STUCK         { background: rgba(107, 114, 128, 0.18); color: #9ca3af; border: 1px solid rgba(107, 114, 128, 0.28); }

/* === Payment === */
.payment-PREPAID { background: rgba(148, 163, 184, 0.12); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.25); }
.payment-COD     { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.25); }
```

**Semantic color map:**

| Vai trò | Màu | Hex | Khi dùng |
|---|---|---|---|
| Success / Live / Ready | Emerald | `#34d399` | Trạng thái thành công, action OK |
| Processing / In Transit | Sky | `#38bdf8` | Đang xử lý, đang chuyển |
| Delivered terminal | Teal | `#2dd4bf` | Hoàn thành cuối cùng |
| Staged / Label | Purple | `#a78bfa` | Đã chuẩn bị, chờ tiếp |
| Warning / COD / Updated | Amber | `#fbbf24` | Cần chú ý, nhưng không nguy hiểm |
| Error / Address | Red | `#fca5a5` | Lỗi, dừng workflow |
| Failed terminal | Orange | `#fb923c` | Đã thất bại cuối cùng |
| Inactive / Stuck | Slate | `#9ca3af` | Không hoạt động |
| Info | Blue | `#60a5fa` | Mới, thông báo trung tính |

### 4.5 Forms / Inputs

```css
input, select, textarea {
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
input:hover, select:hover, textarea:hover {
  border-color: var(--border-strong);
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg);  /* 3px emerald glow */
}
select { cursor: pointer; }

/* Filter row */
.filter-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 18px 20px;
  margin-bottom: 20px;
}
.filter-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-muted);
  text-transform: uppercase;
  display: block;
  margin-bottom: 8px;
}
.filter-input {
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
}
.filter-search {
  width: 100%;
  padding: 7px 10px 7px 32px;
  font-size: 13px;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%235e7798' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><path d='m21 21-4.3-4.3'/></svg>");
  background-repeat: no-repeat;
  background-position: 10px center;
}
```

### 4.6 Sidebar

**Cấu trúc:**
- Width: 240px fixed
- Background: `var(--bg-secondary)`
- Border-right: 1px `var(--border)`

**Logo block (top, ~64px):**
- Logo icon: gradient emerald `#10b981 → #0e8e63` (= brand color)
- Wordmark: bold "KDEXPRESS" trắng + sub-text "app-name.hub" muted lowercase
- Border-bottom: 1px `var(--border)`

**Section labels:**
- `.sidebar-section-label` (uppercase nhỏ, muted, padding 1.25rem)

**Nav items:**
```css
/* Inactive */
{
  display: flex;
  gap: 12px;
  margin: 0 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  /* Icon: 18px, color var(--text-muted), FILL 0 wght 400 */
}
:hover {
  background: rgba(255, 255, 255, 0.025);
}

/* Active — dark surface + 3px accent line trái */
{
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--accent);  /* THIN ACCENT LINE */
  /* Icon: color var(--accent), FILL 1 wght 500 */
}
```

**User profile (bottom):**
- Avatar 32×32: bg `var(--accent)`, text `var(--bg-primary)` — initial của user
- Name `text-primary`, role `text-muted`
- Logout icon button hover: `bg-tertiary`

**Quy tắc CRITICAL:**
- Active state **KHÔNG** dùng full accent background block. Phải là dark surface + 3px inset line trái.
- Hover inactive = neutral `rgba(white, 0.025)`. **KHÔNG** tint accent.
- Icon size 18px (không 19-20). Premium = tinh tế.

### 4.7 Page Header (PageHeader)

```tsx
<header className="mb-8">
  <p className="page-eyebrow">SECTION NAME</p>
  <h1 className="page-title">
    Page <span className="page-title-accent">Title</span>
  </h1>
  <p className="page-subtitle">Mô tả ngắn về trang.</p>
</header>
```

**Quy tắc:**
- Eyebrow uppercase trước title, có gạch ngang `::before`.
- Title 32px, có thể split 1 từ amber/accent.
- Subtitle muted, optional.
- Action buttons (sync, create) đặt phải, align-start.
- `margin-bottom: 32px` (tạo breathing room với content dưới).

---

## 5. Patterns

### 5.1 Section trong page

Pattern "01 LABEL ─────":

```tsx
<div className="section-label">
  <span className="section-num">01</span>
  <span>FULFILLMENT OPERATIONS</span>
  {/* Gạch ngang tự fill bằng ::after */}
</div>
```

### 5.2 KPI card

```tsx
<a href="/path" className="card card-interactive p-5 block">
  <div className="flex items-start justify-between mb-2">
    <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-muted">
      Label
    </p>
    <span className="material-symbols-outlined text-[20px]" style={{ color: accent, opacity: 0.6 }}>
      icon
    </span>
  </div>
  <p className="text-[28px] font-bold leading-none tracking-tight" style={{ color: accent }}>
    {value}
  </p>
  <p className="text-[11px] mt-2.5 text-muted">Sub-info</p>
</a>
```

### 5.3 Action bar (trên table)

```css
.action-bar {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 14px 20px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
}
```

### 5.4 Live indicator

```css
.live-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18);
  animation: live-pulse 2s ease-in-out infinite;
}
@keyframes live-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.18); }
  50% { box-shadow: 0 0 0 5px rgba(52, 211, 153, 0.08); }
}
```

---

## 6. States

### Hover

| Element | Hover effect |
|---|---|
| Card-interactive | Border brighter + 1px glow. **KHÔNG** translate. |
| Button primary | Border full accent + bg-elevated |
| Button secondary | Border-strong + bg-elevated + text-primary |
| Nav inactive | `rgba(white, 0.025)` neutral |
| Table row | `rgba(white, 0.025)` neutral |
| Input/select | Border-strong |
| Link | Color amber/accent |

### Focus

- Input/select/textarea: border `var(--accent)` + 3px ring `var(--accent-bg)`
- KHÔNG dùng default browser outline

### Selected (table row)

- Background `rgba(white, 0.03)` neutral
- 2px accent line inset trái cell đầu (`td:first-child { box-shadow: inset 2px 0 0 var(--accent) }`)

### Disabled

- Opacity `0.45`
- `cursor: not-allowed`
- KHÔNG đổi color (tránh giả trạng thái mới)

---

## 7. Spacing

| Element | Padding | Gap |
|---|---|---|
| Card default | `p-5` (20px) | — |
| Card large | `p-6` (24px) | — |
| Filter card | 18px 20px | gap-3 (cols) |
| Action bar | 14px 20px | — |
| Table header cell | 14px 14px | — |
| Table body cell | 12px 14px | — |
| Page header → content | `mb-8` (32px) | — |
| Between sections | `mt-8` / section-label `margin: 32px 0 18px` | — |
| Sidebar nav item | 8px 12px | gap-3 (icon ↔ label) |

---

## 8. Radius

- Badge: `--radius-sm` (6px)
- Button, input, small element: `--radius-md` (8px)
- Section heading box: `--radius-lg` (12px)
- Card, table-shell, filter-card, action-bar: `--radius-xl` (14px)

---

## 9. Do's & Don'ts

### ✅ DO

- Dùng `var(--accent)` (emerald) cho mọi action primary, nav active, focus, link.
- Border `var(--border)` mọi nơi — neutral alpha, blend tự nhiên.
- Hover neutral (`rgba(white, 0.025)`) cho row/nav.
- Section gap 32px, card padding 20px — breathing room.
- Status badges semantic (red/amber/blue/teal theo vai trò).
- Logo emerald cùng tone với accent → 1 brand color duy nhất.
- Typography 600 weight cho labels nhỏ (premium feel).

### ❌ DON'T

- **KHÔNG** dùng button có background full accent (orange/green rectangle). Primary = dark surface + accent **border**.
- **KHÔNG** dùng amber/cam cho: sidebar active bg, button chính, card highlight, table hover, major CTA.
- **KHÔNG** tint accent vào row hover/selected. Phải neutral white tint.
- **KHÔNG** dùng `transform: translateY` trong card hover. Movement = amateur.
- **KHÔNG** trộn nhiều fonts. 1 sans-serif duy nhất.
- **KHÔNG** dùng font-weight 700 cho labels nhỏ. 600 mới premium.
- **KHÔNG** border đậm (`#1e3556` navy gắt). Phải neutral alpha (`rgba(white, 0.06)`).
- **KHÔNG** light mode trong app vận hành nội bộ.
- **KHÔNG** show vendor names (ClickShip, Canada Post, vendor cụ thể) trong UI user-facing — dùng từ chung ("đơn vị vận chuyển", "đối tác giao hàng").

---

## 10. Implementation checklist khi áp dụng sang app mới

1. [ ] Copy CSS variables vào `:root` trong global stylesheet.
2. [ ] Đặt body bg-color `var(--bg-primary)`, text `var(--text-primary)`.
3. [ ] Setup font system (Inter / Geist) + features `tnum ss01`.
4. [ ] Copy class CSS: `.btn`, `.btn-primary/secondary/danger`, `.card`, `.card-interactive`, `.table-shell`, `.table-base`, `.filter-card`, `.filter-label`, `.action-bar`, `.section-label`, `.page-title`, `.page-eyebrow`, `.live-dot`.
5. [ ] Setup Sidebar component: logo emerald + KDEXPRESS wordmark + app-name.hub sub-text.
6. [ ] Setup Topbar/PageHeader component với eyebrow + title 32px + optional description.
7. [ ] Tạo `components/ui/` với: Button, Card, StatusBadge, SectionHeader, FilterBar.
8. [ ] Khi style component nội bộ — luôn check token đã đủ trước khi hardcode color.
9. [ ] Test toàn app trên dark mode (không có light fallback).
10. [ ] Verify amber chỉ xuất hiện trong: warning badge, COD payment, delayed attention, critical action. KHÔNG ở button/nav/hover.

---

## 11. React component templates

Folder structure đề xuất:

```
components/
  ui/
    button.tsx
    card.tsx
    status-badge.tsx
    section-header.tsx
    filter-bar.tsx
    index.ts          ← re-export gom 1 chỗ
  sidebar.tsx
  page-header.tsx     ← (= Topbar)
```

Xem source code đầy đủ trong `components/ui/` của fulfillment-hub.

---

## 12. Tham chiếu

- **App reference**: KDExpress App Hub (`internal.app.hub`)
- **Implementation reference**: Fulfillment Hub (`app-fulfillment.kdexpress.ca`)
- **Aesthetic targets**: Linear, Retool, modern enterprise SaaS dashboards
- **Anti-pattern**: Bootstrap admin templates, ERP cũ, dark admin dashboard với accent loud

---

*Mọi câu hỏi/clarification về design system — refer back file này trước. Đụng tới `globals.css` token chính chỉ khi cần.*
