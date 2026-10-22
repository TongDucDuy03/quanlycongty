# Tính năng hệ thống

**XưởngViệt** là web app quản lý doanh nghiệp gia công cơ khí nhỏ, dùng được trên máy tính và điện thoại, có giao diện sáng/tối.

- **Tổng quan:** theo dõi đơn đang làm, đơn trễ, vật tư cần bổ sung và công nợ.
- **Đơn hàng & sản xuất:** tạo/sửa đơn, quản lý khách hàng, thông tin bản vẽ, người/máy phụ trách và tiến độ từng công đoạn.
- **Kho vật tư:** ghi nhập/xuất, lịch sử giao dịch, cảnh báo tồn thấp và chặn xuất quá tồn.
- **Thu tiền & công nợ:** ghi nhận tiền thu theo đơn, xem khoản còn phải thu, xuất danh sách CSV.
- **Nhân sự:** hồ sơ nhân viên, thời gian làm việc, mức lương tháng/ngày/giờ và phụ cấp riêng từng người.
- **Chấm công:** ghi giờ làm, nghỉ phép hưởng lương, tăng ca ngày thường/ngày nghỉ/ngày lễ; tổng hợp công theo tháng.
- **Cấu hình lương:** ngày/giờ công chuẩn, hệ số tăng ca, tỷ lệ bảo hiểm và các loại phụ cấp cố định hoặc theo ngày thực làm.
- **Bảng lương:** tính thu nhập và thực lĩnh, thêm thưởng/tạm ứng/khấu trừ/thuế nhập tay, xem chi tiết, chốt/mở lại kỳ lương và xuất CSV.
- **Google Sheets:** tải/lưu dữ liệu giữa máy tính và điện thoại qua Apps Script, kiểm tra phiên bản chống ghi đè, giữ cả chấm công và kỳ lương đã chốt; Sheet vẫn riêng tư. Đồng bộ bằng nút bấm, chưa realtime.
- **Sao lưu:** bản lưu trên thiết bị, xuất/khôi phục JSON và xuất CSV. Khóa kết nối chỉ giữ trong phiên ứng dụng; ngắt kết nối không xóa bản lưu cục bộ.

Bản công khai trên GitHub Pages dùng dữ liệu giả để demo. Chưa có tích hợp máy chấm công, tự tính thuế lũy tiến hoặc phân quyền riêng cho phòng nhân sự. Người giữ khóa Sheets có quyền đọc/ghi toàn bộ dữ liệu. Cần thiết lập một lần theo [hướng dẫn Google Sheets](GOOGLE_SHEETS.md); chỉ có link Sheet chưa đủ để kết nối. Apps Script áp dụng hạn mức Google và bản tích hợp giới hạn 2 MiB/snapshot.
