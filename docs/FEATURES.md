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
- **Dữ liệu:** lưu trên thiết bị, sao lưu/khôi phục JSON; có kết nối Supabase tùy chọn để tải/lưu giữa các thiết bị của một chủ tài khoản.

Bản công khai trên GitHub Pages dùng dữ liệu giả để demo. Chưa có tích hợp máy chấm công, tự tính thuế lũy tiến hoặc phân quyền riêng cho phòng nhân sự. Google Sheets không bắt buộc; file CSV xuất ra mở được trong Google Sheets/Excel.
