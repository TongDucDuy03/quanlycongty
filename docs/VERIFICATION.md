# Biên bản kiểm tra demo XưởngViệt

Ngày: 22/10/2026. Thư mục dự án: `D:\quản lý công ty`. Ban đầu thư mục trống, không có mã nguồn hoặc Git remote. Nhóm diey-team gồm nghiên cứu, kiến trúc, triển khai nghiệp vụ, QA độc lập và review độc lập. Lead tích hợp và kiểm tra bản cuối.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run build` | TypeScript và Vite build thành công |
| `npm test` | 41/41 kiểm thử nghiệp vụ, tính lương và lưu trữ đạt |
| `npx playwright test` | 22/22 đạt, desktop 1440×1000 và mobile 390×844 |
| `npm run verify:dist` | Release chạy tại `/workshop-demo/`, assets đúng đường dẫn, reload hash route được |
| Kiểm tra hình ảnh | Đã xem desktop/mobile, sáng/tối; không tràn ngang toàn trang |
| Supabase thật | Chưa chạy: chưa có project và tài khoản được cấu hình |
| GitHub Pages công khai | Workflow 39722088275 thành công; trang công khai trả HTTP 200 |
| Kiểm tra trực tiếp bản công khai | Desktop/mobile: tổng quan, bốn tab nhân sự, xuất CSV, chế độ tối; không lỗi JavaScript hoặc tràn ngang toàn trang |

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

Bản nghiệm thu là **demo quản lý**, không phải phần mềm kế toán hoặc ERP production. Gói Supabase có thể thay đổi hạn mức/tạm dừng. Kho snapshot một chủ xưởng chưa hỗ trợ quyền theo nhân viên. Không có dữ liệu doanh nghiệp thật trong seed. GitHub workflow xuất bản demo tĩnh tại https://tongducduy03.github.io/quanlycongty/.


## Bổ sung nhân sự và tiền lương

Kiểm thử đối chiếu số tiền độc lập: mức lương tháng 26.000.000đ, chuẩn 26 ngày/8 giờ, một ngày 8 giờ thường + 2 giờ tăng ca hệ số 1,5 tạo lương công và tăng ca 1.375.000đ. Cộng phụ cấp ngày, thưởng và trừ bảo hiểm 10%, tạm ứng, thuế, khấu trừ cho kết quả đúng kỳ vọng trong test. Chấm công trùng người/ngày cập nhật dòng cũ; công vượt giờ chuẩn bị chặn.

Đã kiểm tra chốt/mở tháng, thay mức lương sau chốt không làm đổi snapshot cũ, CSV đúng số tiền, tháng không có công, đọc bản sao cũ không tự thêm nhân viên và từ chối bản sao có cấu hình lương sai. Cả bốn tab đều được kiểm tra ở hai kích thước và hai theme.

Sau khi Windows khóa thư mục gốc và cơ chế kiểm tra tự động chặn lệnh di chuyển/xóa, dự án được sao chép đầy đủ sang `D:\quản lý công ty`; thư mục `D:\Bot AI` được giữ nguyên. Bản bàn giao và các lệnh Git chạy tại thư mục mới. Không có dữ liệu nhân sự thật được xuất bản.
