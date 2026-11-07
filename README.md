# BOO HRM — Admin Web & Zalo Mini App

Nền tảng HRM/chấm công đa công ty, mobile-first, dùng React, TypeScript, ZMP UI và Supabase.

## Trạng thái hiện tại

- Giao diện nhân viên theo phương án A: chấm công và bằng chứng QR/GPS/mạng đứng đầu.
- Không có dữ liệu giả: khi chưa kết nối backend, ứng dụng hiển thị trạng thái cấu hình.
- Migration nền tảng đa tenant, RLS, ca làm, chấm công, phép, duyệt đơn và audit.
- Edge Function `verify-attendance`: xác thực JWT, QR hash/hạn dùng, GPS, độ chính xác, khoảng cách, idempotency và chống lượt trùng.

Hai bề mặt dùng chung một Supabase project:

- `/#/`: Zalo Mini App dành cho nhân viên đăng ký, đọc tin và chấm công.
- `/#/admin`: Admin Web dành cho HR/quản trị, quản lý nhân viên, ca, nhiều địa điểm GPS/BSSID, bảng công và xuất CSV.

GitHub Actions trong `.github/workflows/deploy-pages.yml` tự build và phát hành Admin Web lên GitHub Pages.

## Chạy local

```bash
npm install
copy .env.example .env
npm run dev
```

Điền `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` và `VITE_ZALO_APP_ID` trong `.env`.

## Supabase

1. Cài Supabase CLI phiên bản phù hợp và chạy `supabase --help` để kiểm tra cú pháp hiện hành.
2. Tạo/link project Supabase.
3. Chạy migration trong `supabase/migrations` ở môi trường local trước.
4. Thiết lập secret `SUPABASE_SECRET_KEY` cho Edge Functions. Secret này không được đưa vào frontend.
5. Deploy functions và kiểm tra RLS/advisors trước khi dùng hosted database.

Supabase từ 2026 không tự expose bảng mới qua Data API. Migration chỉ `GRANT` các bảng cần thiết và bật RLS trên toàn bộ bảng public.

## Nguyên tắc xác thực Zalo

Frontend phải lấy bằng chứng xác thực qua API chính thức được Zalo Mini App hỗ trợ. Edge Function `zalo-auth` (chưa triển khai) phải đổi/xác minh bằng chứng đó trực tiếp với Zalo, liên kết `provider_user_id` với `auth.users`, rồi phát hành phiên ứng dụng. Không nhận một `zalo_user_id` tự khai từ frontend làm danh tính.

## Kiểm tra

```bash
npm run typecheck
npm run build
```

Các ca integration bắt buộc: QR hết hạn, replay QR, idempotency, GPS ngoài bán kính, GPS kém chính xác, check-in trùng, check-out thiếu check-in, ca qua đêm, cross-tenant RLS và tự duyệt đơn.
