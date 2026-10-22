# Biên bản kiểm tra demo XưởngViệt

Ngày: 22/10/2026. Thư mục dự án: `D:\qu?n l? c?ng ty`. Ban đầu thư mục trống, không có mã nguồn hoặc Git remote. Nhóm diey-team gồm nghiên cứu, kiến trúc, triển khai nghiệp vụ, QA độc lập và review độc lập. Lead tích hợp và kiểm tra bản cuối.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run build` | TypeScript và Vite build thành công |
| `npm test` | 19/19 kiểm thử domain và storage đạt |
| `npx playwright test` | 16/16 đạt, desktop 1440×1000 và mobile 390×844 |
| `npm run verify:dist` | Release chạy tại `/workshop-demo/`, assets đúng đường dẫn, reload hash route được |
| Kiểm tra hình ảnh | Đã xem desktop/mobile, sáng/tối; không tràn ngang toàn trang |
| Supabase thật | Chưa chạy: chưa có project và tài khoản được cấu hình |
| GitHub Pages công khai | Chưa xuất bản: chưa có repository đích và phiên đăng nhập GitHub |

Screenshots bản production: [desktop sáng](previews/desktop-light.png), [desktop tối](previews/desktop-dark.png), [điện thoại sáng](previews/mobile-light.png), [điện thoại tối](previews/mobile-dark.png).

## Luồng được kiểm tra bằng trình duyệt

- Mọi màn hình, menu điện thoại, hash route, không tràn document, sáng/tối lưu qua reload.
- Tạo/sửa đơn, cập nhật công đoạn và số lượng hoàn thành, lưu qua reload.
- Nhập/xuất vật tư, lịch sử và chặn xuất quá tồn; lỗi đọc được ngay trong modal.
- Thêm khách, chọn khách trong đơn mới.
- Thu tiền không quá công nợ; thu đủ đưa số còn lại về 0.
- Xuất/khôi phục JSON, từ chối dữ liệu không đúng định dạng, hủy đặt lại dữ liệu.
- Shortcut quá hạn và khách hàng giữ bộ lọc mong muốn.
- Hai tab cùng trình duyệt: bản cũ bị chặn lưu đè, bản nhập vẫn giữ trong form.
- Dialog có tên truy cập; native dialog hỗ trợ focus và Escape.

## Những điểm review đã sửa

1. Hash navigation xóa bộ lọc ngay sau khi bấm KPI → điều hướng nội bộ cập nhật URL bằng History API; regression đạt.
2. Lỗi nhập kho nằm sau backdrop → hiển thị lỗi trong dialog; regression đạt.
3. Thiếu tên dialog → `aria-labelledby` trỏ đến tiêu đề; regression đạt.
4. Cache chung giữa người dùng → cache riêng theo owner; đăng xuất có xác nhận và xóa cache owner, trở về demo riêng.
5. Auth refresh xóa revision → chỉ chuyển workspace khi ID người dùng thay đổi.
6. Response cloud chậm có thể làm mất thay đổi mới → kiểm tra thế hệ dữ liệu và phiên Auth trước khi áp dụng; save không đánh dấu sạch nếu vẫn còn thay đổi mới.
7. Cache cloud hỏng khôi phục revision sai → không khôi phục revision khi local data có cảnh báo; cần tải lại cloud.
8. Tab cũ lưu cloud → kiểm tra token local trước gửi snapshot; cloud còn kiểm tra revision phía database.
9. Bundle cloud tải cả trong demo → dùng dynamic import; demo không cấu hình không tải Supabase.
10. HTTP LAN không có `crypto.randomUUID` → UUID v4 dự phòng bằng `crypto.getRandomValues`; unit test xác nhận cả tạo ID và nhập kho.

Các mục cloud được review mã và kiểm tra storage bằng unit tests; chưa phải bằng chứng luồng Auth/RLS chạy trên Supabase thật. Kiểm thử hai tài khoản, mất mạng, xung đột phiên bản và logout trên project thật vẫn bắt buộc trước pilot.

## Giới hạn nghiệm thu

Bản nghiệm thu là **demo quản lý**, không phải phần mềm kế toán hoặc ERP production. Gói Supabase có thể thay đổi hạn mức/tạm dừng. Kho snapshot một chủ xưởng chưa hỗ trợ quyền theo nhân viên. Không có dữ liệu doanh nghiệp thật trong seed. GitHub workflow chỉ xuất bản demo tĩnh, chưa có URL triển khai đã kiểm chứng.


## B? sung nh?n s? v? ti?n l??ng

Ki?m th? ??i chi?u s? ti?n ??c l?p: m?c l??ng th?ng 26.000.000?, chu?n 26 ng?y/8 gi?, m?t ng?y 8 gi? th??ng +2 gi? t?ng ca h? s?1,5 t?o l??ng c?ng+t?ng ca 1.375.000?. C?ng ph? c?p ng?y, th??ng v? tr? b?o hi?m10%, t?m ?ng, thu?, kh?u tr? cho k?t qu? ??ng k? v?ng trong test. Ch?m c?ng tr?ng ng??i/ng?y c?p nh?t d?ng c?; c?ng v??t gi? chu?n b? ch?n.

?? ki?m tra ch?t/m? th?ng, thay m?c l??ng sau ch?t kh?ng l?m ??i snapshot c?, CSV ??ng s? ti?n, th?ng kh?ng c? c?ng, ??c b?n sao c? kh?ng t? th?m nh?n vi?n v? t? ch?i b?n sao c? c?u h?nh l??ng sai. C? b?n tab ??u ???c ki?m tra ? hai k?ch th??c v? hai theme.

Sau khi Windows kh?a th? m?c g?c v? c? ch? ki?m tra t? ??ng ch?n l?nh di chuy?n/x?a, d? ?n ???c sao ch?p ??y ?? sang `D:\qu?n l? c?ng ty`; th? m?c `D:\Bot AI` ???c gi? nguy?n. B?n b?n giao v? c?c l?nh Git ch?y t?i th? m?c m?i. Kh?ng c? d? li?u nh?n s? th?t ???c xu?t b?n.
