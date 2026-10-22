# Tính năng hệ thống

**XưởngViệt** gồm website giới thiệu công khai và khu quản lý doanh nghiệp gia công cơ khí nhỏ có đăng nhập. Dùng được trên máy tính, điện thoại; khu quản lý có giao diện sáng/tối.

- **Tổng quan:** theo dõi đơn đang làm, đơn trễ, vật tư cần bổ sung và công nợ.
- **Đơn hàng & sản xuất:** tạo/sửa đơn, quản lý khách hàng, thông tin bản vẽ, người/máy phụ trách và tiến độ từng công đoạn.
- **Kho vật tư:** ghi nhập/xuất, lịch sử giao dịch, cảnh báo tồn thấp và chặn xuất quá tồn.
- **Thu tiền & công nợ:** mỗi lần thu lập phiếu có ngày, phương thức, mã giao dịch, ghi chú; tự cập nhật khoản còn phải thu và chặn thu quá công nợ. Tiền đã thu từ trước được giữ là số dư đầu kỳ.
- **Chứng từ bán hàng:** báo giá, đề nghị thanh toán, phiếu giao hàng và phiếu thu gắn với đơn hàng; tải PDF tiếng Việt, in A4 hoặc tải bản HTML. Hồ sơ doanh nghiệp, ngân hàng, khách hàng và chi tiết được lưu nguyên theo lúc lập. Phiếu sai được hủy có lý do, giữ lịch sử; hủy phiếu thu hoàn lại công nợ.
- **Website giới thiệu:** hồ sơ công ty, năng lực, sản phẩm/dịch vụ, lọc danh mục và xem chi tiết. Trang công khai tách khỏi nhân sự, lương, đơn hàng và công nợ; bản mẫu không tự điền thông tin liên hệ giả.
- **Quản trị website:** vào **Trang giới thiệu** (`#website`), chỉnh hồ sơ/danh mục, **Lưu bản nháp website → chờ Đã đồng bộ → Xuất bản website**. Chỉ các sản phẩm được chọn hiển thị mới được xuất bản; có xem trước bản nháp.
- **Trao đổi báo giá:** khách điền yêu cầu và bấm **Soạn email báo giá** để mở ứng dụng email, đính kèm bản vẽ rồi tự gửi. Website chưa có hộp thư lưu yêu cầu hay tự gửi email; cần cấu hình email doanh nghiệp trước.
- **Nhân sự:** hồ sơ nhân viên, thời gian làm việc, mức lương tháng/ngày/giờ và phụ cấp riêng từng người.
- **Chấm công:** ghi giờ làm, nghỉ phép hưởng lương, tăng ca ngày thường/ngày nghỉ/ngày lễ; tổng hợp công theo tháng.
- **Cấu hình lương:** ngày/giờ công chuẩn, hệ số tăng ca, tỷ lệ bảo hiểm và các loại phụ cấp cố định hoặc theo ngày thực làm.
- **Bảng lương:** tính thu nhập và thực lĩnh, thêm thưởng/tạm ứng/khấu trừ/thuế nhập tay, xem chi tiết, chốt/mở lại kỳ lương và xuất CSV.
- **Dùng chung trên mọi thiết bị:** Google Sheet được cấu hình cố định cho hệ thống. Máy tính và điện thoại chỉ cần mở cùng đường link, đăng nhập tài khoản quản lý; không nhập URL Sheet hoặc khóa kết nối. Có lựa chọn ghi nhớ phiên đăng nhập 30 ngày trên thiết bị cá nhân.
- **Đổi mật khẩu:** đổi ngay trong Cài đặt bằng mật khẩu hiện tại; xác nhận mật khẩu mới và thu hồi các phiên cũ. Đăng nhập lại để tiếp tục, giữ nguyên dữ liệu và thay đổi chờ đồng bộ.
- **Google Sheets:** tự lưu sau thay đổi, nhận bản mới khi quay lại ứng dụng và kiểm tra định kỳ; giữ cả chấm công/kỳ lương đã chốt, chặn ghi đè khi hai máy cùng sửa. Chờ trạng thái “Đã đồng bộ” trước khi chuyển thiết bị. Sửa dữ liệu trong ứng dụng; tab báo cáo trên Sheet chỉ dùng để xem.
- **Sao lưu & phiên đăng nhập:** bản lưu trên thiết bị, xuất/khôi phục JSON và xuất CSV. Phiên hết hạn vẫn giữ thay đổi chưa đồng bộ để tiếp tục sau khi đăng nhập lại. Đăng xuất xóa phiên và dữ liệu công ty trên thiết bị; nếu còn thay đổi chưa đồng bộ, hỏi xác nhận và tải bản sao JSON trước khi xóa. Mật khẩu và phiên đăng nhập không nằm trong bản sao JSON.

Mở link gốc hoặc `#home` để xem website, chọn **Đăng nhập quản lý** (`#admin`) để vào ứng dụng. Lập chứng từ tại **Bán hàng & chứng từ**, điền **Thông tin xuất chứng từ** trước; cũng có các nút lập nhanh từ chi tiết đơn hàng.

Bản trên GitHub Pages dùng dữ liệu giả để demo, không phải hệ thống vận hành thương mại điện tử. Chứng từ **không phải hóa đơn VAT**; mỗi chứng từ hiện có một đơn/một dòng chi tiết. Báo giá và đề nghị thanh toán không ghi nhận thu tiền; phiếu giao hàng không tự cập nhật kho hoặc sản xuất. Tài khoản quản lý dùng chung có quyền đọc/ghi toàn bộ dữ liệu, gồm bảng lương; chưa có phân quyền từng nhân viên, tích hợp máy chấm công hoặc tự tính thuế lũy tiến.

Người triển khai thiết lập hệ thống một lần theo [hướng dẫn Google Sheets](GOOGLE_SHEETS.md); người dùng chỉ đăng nhập. Cần có mạng để xác thực khi mở lại; mất mạng trong lúc làm việc vẫn giữ thay đổi đã lưu trên thiết bị để đồng bộ sau. Apps Script áp dụng hạn mức Google và giới hạn 2 MiB/snapshot; không tự gộp xung đột. Khôi phục JSON không được xóa/sửa lịch sử chứng từ hay số dư đầu kỳ đã có.
