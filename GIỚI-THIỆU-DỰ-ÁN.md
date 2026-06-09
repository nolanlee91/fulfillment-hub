# Fulfillment Hub — Hệ thống quản lý & vận hành fulfillment

> Nền tảng web nội bộ điều phối toàn bộ vòng đời đơn hàng fulfillment: từ lúc đơn rơi vào từ kênh bán → đóng gói → tạo nhãn vận chuyển → theo dõi hành trình giao hàng → đối soát thu hộ (COD). Thay thế hoàn toàn quy trình Excel thủ công bằng một hệ thống tự động, minh bạch theo thời gian thực, có phân quyền cho cả đội vận hành lẫn khách hàng.

---

## 1. Bài toán

Một đơn vị fulfillment xử lý đơn cho **nhiều khách hàng (brand)** cùng lúc. Mỗi khách có:

- Nhiều dòng **sản phẩm** với trọng lượng khác nhau.
- Dữ liệu đơn nằm rải rác ở **các bảng tính (Google Sheets) riêng** do khách tự quản lý.
- Yêu cầu giao hàng khác nhau (trả trước / thu hộ COD), khu vực khác nhau.

Quy trình thủ công gặp các nút thắt kinh điển:

- **Nhập liệu chéo dễ sai**: copy đơn từ sheet khách sang file nội bộ, gõ tay địa chỉ → sai sót địa chỉ, sai số lượng.
- **Không biết nên đóng hộp nào**: chọn thùng theo cảm tính → sai cước, hỏng hàng.
- **Mù thông tin sau khi giao**: khách liên tục hỏi "đơn của tôi tới đâu rồi?".
- **Đối soát COD rối**: tiền thu hộ về nhưng không khớp được đơn nào đã thanh toán.

## 2. Giải pháp

Một **web app duy nhất** đóng vai trò trung tâm điều phối, tự động hóa các điểm chạm và mở quyền truy cập minh bạch cho cả 2 phía:

```
┌─────────────────────────────────────────────────────────────────┐
│                        FULFILLMENT HUB                            │
│                                                                   │
│  Sheets khách ──► Đồng bộ ──► Kiểm tra & ──► Tạo lô ──► Xuất nhãn  │
│   (tự động)       đơn về      gợi ý hộp      (batch)    vận chuyển │
│                      │                                       │     │
│                      ▼                                       ▼     │
│              Theo dõi hành trình  ◄── Nhập tracking ── Đối tác     │
│              (IN_TRANSIT/DELIVERED)    (tự động/tay)    vận chuyển │
│                      │                                             │
│                      ▼                                             │
│              Đối soát COD ──► Hạch toán kế toán                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Kiến trúc & công nghệ

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| **Framework** | Next.js 16 (App Router, React 19, Server Components) | SSR, route handlers cho API, server actions |
| **Ngôn ngữ** | TypeScript (end-to-end type-safe) | Zod validate dữ liệu vào/ra |
| **Database** | PostgreSQL + Drizzle ORM | Schema type-safe, migration bằng `drizzle-kit` |
| **UI** | Tailwind CSS v4 + design system tự xây | Light mode, component library nội bộ |
| **Auth** | Session-based, mật khẩu hash `bcrypt` | RBAC 3 vai trò, middleware bảo vệ route |
| **Tích hợp ngoài** | Google Sheets API, SFTP (`ssh2-sftp-client`), Cloudflare R2 (S3 API) | Đồng bộ dữ liệu & lưu file chứng từ |
| **Xử lý file** | ExcelJS | Xuất file đơn để in nhãn, import tracking |
| **Hạ tầng** | Railway (auto-deploy từ GitHub) + cron jobs | Domain riêng, CI/CD theo `git push` |

**Đặc điểm kiến trúc nổi bật:**

- **Type-safe toàn trình** — từ schema DB (Drizzle) → API (Zod) → UI (TypeScript), giảm tối đa lỗi runtime.
- **Idempotent sync** — mỗi đơn có `unique_key`; đồng bộ lặp lại không tạo trùng, không ghi đè ngược trạng thái đã tiến xa hơn.
- **Soft-delete có audit** — xóa lô đơn vẫn giữ lý do / người xóa / thời điểm để truy vết.
- **Snapshot dữ liệu** — tin nhắn lưu kèm tên người gửi tại thời điểm gửi, phòng khi user đổi tên sau này.

---

## 4. Các phân hệ chính

### 4.1 Đồng bộ đơn tự động từ nhiều nguồn
Tự động kéo đơn từ **nhiều bảng tính của nhiều khách** về một kho dữ liệu thống nhất theo lịch (cron). Tự nhận diện sản phẩm, khách hàng, hình thức thanh toán (trả trước / COD) từ nội dung đơn. Phát hiện và đánh dấu đơn lỗi (thiếu địa chỉ, thiếu thông tin) để xử lý riêng.

### 4.2 Kiểm tra & gợi ý đóng hộp thông minh
Dựa trên **bộ luật `sản phẩm × loại hộp → số lượng tối đa`**, hệ thống tự gợi ý loại thùng phù hợp cho từng đơn theo số lượng và trọng lượng — chuẩn hóa khâu đóng gói, tối ưu cước vận chuyển.

### 4.3 Tạo lô (batch) & xuất nhãn
Gom đơn đã sẵn sàng thành **lô theo khu vực / nền tảng vận chuyển**, xuất file chuẩn để tạo nhãn hàng loạt. Hỗ trợ xóa lô an toàn (đơn tự revert về trạng thái sẵn sàng, giữ lịch sử xóa).

### 4.4 Theo dõi hành trình giao hàng (tracking)
Cập nhật trạng thái giao hàng **tự động** từ dữ liệu đối tác vận chuyển (qua SFTP) và **thủ công** (import file). Tự phân loại sự kiện thành các trạng thái: đang giao, đã giao, thất bại. Tự động phát hiện đơn **bị kẹt** (đếm theo ngày làm việc) để cảnh báo xử lý sớm.

### 4.5 Cổng thông tin cho khách hàng
Khách đăng nhập tài khoản riêng để **tự xem trạng thái đơn của mình theo thời gian thực** — không cần hỏi qua chat/điện thoại. Chỉ thấy dữ liệu của chính mình (phân quyền chặt).

### 4.6 Gắn cờ & trao đổi 2 chiều
Cơ chế **đánh cờ đơn có vấn đề** (đỏ / vàng) kèm khung **chat 2 chiều giữa đội vận hành và khách hàng** ngay trên từng đơn — tập trung mọi trao đổi vào đúng ngữ cảnh đơn hàng, có thể gỡ cờ khi xử lý xong.

### 4.7 Đối soát & hạch toán COD
Quy trình 2 bước cho tiền thu hộ:
1. **Đối soát** — khách tải lên chứng từ thanh toán (mã tham chiếu chuyển khoản, hoặc ảnh biên lai — lưu trên Cloudflare R2).
2. **Hạch toán** — kế toán tra cứu, đối chiếu và ghi sổ, lưu vết người/thời điểm hạch toán.

### 4.8 Bảng điều khiển & phân tích
Dashboard tổng quan: phễu đơn hàng (funnel) theo từng giai đoạn, số đơn cần chú ý, đơn bị kẹt, tình trạng đối soát — giúp đội vận hành nắm "sức khỏe" hệ thống trong một màn hình.

---

## 5. Bảo mật & phân quyền (RBAC)

Hệ thống phân **3 vai trò** với ranh giới rõ ràng:

| Vai trò | Phạm vi |
|---|---|
| **SUPER_ADMIN** | Toàn quyền: cấu hình hệ thống, quản lý người dùng, reset mật khẩu, quản lý sản phẩm/hộp/luật đóng gói. |
| **STAFF** | Vận hành: xử lý đơn, tạo lô, xuất nhãn, nhập tracking, tra cứu & hạch toán đối soát. |
| **CUSTOMER** | Chỉ xem đơn của chính mình, tải chứng từ đối soát, trao đổi qua cờ. **Không** thấy dữ liệu khách khác. |

- Mật khẩu hash bằng `bcrypt`, phiên đăng nhập quản lý qua session có hạn dùng.
- Middleware chặn truy cập route khi chưa đăng nhập, điều hướng theo vai trò.

---

## 6. Tự động hóa (cron jobs)

- **Đồng bộ sheet nguồn** — định kỳ kéo đơn mới từ bảng tính khách về hệ thống.
- **Kéo dữ liệu tracking** — tự lấy cập nhật hành trình từ đối tác vận chuyển qua SFTP, chống xử lý trùng file.
- **Phát hiện đơn kẹt** — quét nền, gắn cờ cảnh báo đơn quá hạn (tính theo ngày làm việc).

---

## 7. Mô hình dữ liệu (rút gọn)

```
customers ──┬─► products ──► source_sheets   (cấu hình nguồn đồng bộ)
            │       │
            │       └──► box_rules ◄── boxes  (luật đóng gói)
            │
            └─► orders ──┬─► batches           (gom lô / xuất nhãn)
                         ├─► flags ─► flag_messages   (cờ + chat 2 chiều)
                         └─► (tracking, đối soát, hạch toán nằm trong orders)

users ─► sessions       (auth)
tracking_files          (dedup file tracking đã xử lý)
sync_logs               (nhật ký đồng bộ)
```

Bảng `orders` là trung tâm, mang đầy đủ vòng đời: trạng thái (9 mức từ `NEW` → `DELIVERED`/`FAILED`), thông tin giao hàng, tracking, lý do cần chú ý, và dữ liệu đối soát.

---

## 8. Giá trị mang lại

- ✅ **Loại bỏ nhập liệu thủ công** — đơn tự chảy từ sheet khách vào hệ thống.
- ✅ **Chuẩn hóa đóng gói** — gợi ý hộp tự động, giảm sai cước và hư hỏng.
- ✅ **Minh bạch cho khách** — khách tự tra cứu, giảm tải hỏi đáp cho đội vận hành.
- ✅ **Đối soát COD rõ ràng** — có chứng từ, có vết hạch toán, hết cảnh "tiền về không khớp đơn".
- ✅ **Cảnh báo sớm** — tự phát hiện đơn kẹt / cần chú ý trước khi khách phàn nàn.
- ✅ **Triển khai liên tục** — `git push` là deploy, không downtime thủ công.

---

*Tài liệu giới thiệu năng lực — Fulfillment Hub. Tên các đối tác vận chuyển được ẩn bằng từ chung.*
