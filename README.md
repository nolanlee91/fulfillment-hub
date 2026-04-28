# Fulfillment Hub

Web app quản lý đóng gói fulfillment, đồng bộ từ Google Sheets, xuất file Excel cho ClickShip.

## Tech stack

- **Frontend**: Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (Drizzle ORM)
- **Hosting**: Railway
- **Auth**: NextAuth.js + Google OAuth
- **Data fetching**: TanStack Query

## Setup local

### 1. Cài dependencies

```bash
npm install
```

### 2. Tạo `.env.local`

Copy `.env.example` thành `.env.local` và điền các giá trị.

Để chạy local, bạn có thể dùng Postgres trên Railway (lấy DATABASE_URL từ tab Variables) hoặc cài Postgres local.

### 3. Migrate database

```bash
npm run db:push   # tạo bảng theo schema
```

### 4. Chạy dev server

```bash
npm run dev
```

Mở http://localhost:3000

## Deploy lên Railway

1. Push code lên GitHub repo
2. Vào railway.app → New Project → Deploy from GitHub
3. Chọn repo này
4. Add service: PostgreSQL
5. Vào tab Variables của service Next.js, copy `DATABASE_URL` từ Postgres service
6. Add các env var khác (Google credentials, NextAuth)
7. Railway auto build & deploy

## Cấu trúc thư mục

```
src/
├── app/                 # Next.js App Router
│   ├── api/             # API endpoints
│   ├── dashboard/       # Trang Dashboard
│   ├── orders/          # Trang Orders
│   ├── errors/          # Trang Errors
│   ├── batches/         # Trang Batches
│   └── export/          # Trang Export
├── components/          # React components dùng chung
├── lib/
│   ├── db/              # Drizzle ORM (schema + connection)
│   ├── sheets/          # Google Sheets API helper
│   └── sync/            # Logic sync, validate, batch
```

## Database schema

- `customers`: khách hàng (Venatureco, Skylane, ...)
- `products`: sản phẩm + unit weight
- `source_sheets`: cấu hình 13 sheet nguồn
- `boxes`: 4 loại thùng + dimension
- `box_rules`: ma trận product × box → max_qty
- `orders`: đơn hàng (table chính)
- `batches`: gom đơn để xuất CSV
- `sync_logs`: audit trail
