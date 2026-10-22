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
- **Dùng chung trên mọi thiết bị:** Google Sheet được cấu hình cố định cho hệ thống. Máy tính và điện thoại chỉ cần mở cùng đường link, đăng nhập tài khoản quản lý; không nhập URL Sheet hoặc khóa kết nối. Có lựa chọn ghi nhớ phiên đăng nhập 30 ngày trên thiết bị cá nhân.
- **Đổi mật khẩu:** đổi ngay trong Cài đặt bằng mật khẩu hiện tại; xác nhận mật khẩu mới và thu hồi các phiên cũ. Đăng nhập lại để tiếp tục, giữ nguyên dữ liệu và thay đổi chờ đồng bộ.
- **Google Sheets:** tự lưu sau thay đổi, nhận bản mới khi quay lại ứng dụng và kiểm tra định kỳ; giữ cả chấm công/kỳ lương đã chốt, chặn ghi đè khi hai máy cùng sửa. Chờ trạng thái “Đã đồng bộ” trước khi chuyển thiết bị. Sửa dữ liệu trong ứng dụng; tab báo cáo trên Sheet chỉ dùng để xem.
- **Sao lưu & phiên đăng nhập:** bản lưu trên thiết bị, xuất/khôi phục JSON và xuất CSV. Phiên hết hạn vẫn giữ thay đổi chưa đồng bộ để tiếp tục sau khi đăng nhập lại. Đăng xuất xóa phiên và dữ liệu công ty trên thiết bị; nếu còn thay đổi chưa đồng bộ, hỏi xác nhận và tải bản sao JSON trước khi xóa. Mật khẩu và phiên đăng nhập không nằm trong bản sao JSON.

Bản công khai trên GitHub Pages dùng dữ liệu giả để demo. Tài khoản quản lý dùng chung có quyền đọc/ghi toàn bộ dữ liệu, gồm bảng lương; chưa có tài khoản hoặc phân quyền riêng từng nhân viên/phòng nhân sự. Chưa có tích hợp máy chấm công hoặc tự tính thuế lũy tiến. Người triển khai thiết lập hệ thống một lần theo [hướng dẫn Google Sheets](GOOGLE_SHEETS.md); người dùng chỉ đăng nhập. Cần có mạng để xác thực khi mở lại ứng dụng; mất mạng trong lúc làm việc vẫn giữ thay đổi trên thiết bị để đồng bộ sau. Apps Script áp dụng hạn mức Google và bản tích hợp giới hạn 2 MiB/snapshot; không tự gộp các thay đổi xung đột.
