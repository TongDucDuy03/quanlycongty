# Nghiên cứu và kế hoạch nâng cấp bán hàng – website công ty

Ngày: 22/10/2026. Đối tượng: xưởng gia công cơ khí nhỏ, sản xuất theo yêu cầu. Giữ Google Sheets làm nơi lưu dữ liệu và giao diện quản lý hiện có.

## Kết quả rà soát trước nâng cấp

Đã có đơn hàng một dòng chi tiết, công đoạn, kho, khách hàng, tổng tiền đã thu/còn phải thu, nhân sự và lương. Chưa có chứng từ gửi khách, lịch sử từng lần thu, thông tin doanh nghiệp có thể cấu hình hoặc website công khai. Trường `Order.paid` chỉ là số tổng, không đủ để dựng lại ngày/phương thức thanh toán lịch sử.

## Đối chiếu nguồn chính thức

| Nguồn | Nghiệp vụ phù hợp với xưởng | Áp dụng |
| --- | --- | --- |
| [MRPeasy CRM](https://www.mrpeasy.com/resources/user-manual/crm/) và [Manufacturing CRM](https://www.mrpeasy.com/manufacturing-crm/) | Theo dõi đơn từ báo giá đến giao hàng; chứng từ PDF và thông tin thanh toán | Bổ sung chứng từ gắn với đơn, giữ bản phát hành để in/gửi lại |
| [ERPNext Quotation](https://docs.frappe.io/erpnext/quotation) | Hàng hóa, số lượng, giá, hiệu lực và điều khoản báo giá | Mẫu báo giá có điều khoản và ngày; đợt này dùng đơn hiện có làm nguồn |
| [ERPNext Payment Request](https://docs.frappe.io/erpnext/payment-request) | Đề nghị khách thanh toán, riêng với ghi nhận tiền thực nhận | Tạo đề nghị thanh toán không làm giảm công nợ |
| [ERPNext Payment Entry](https://docs.frappe.io/erpnext/payment-entry) | Ghi nhận khoản thu, phương thức, ngày và tham chiếu; hỗ trợ ứng trước/thu từng phần | Phiếu thu làm sổ thu tiền; tổng thu được đối chiếu với công nợ |
| [Odoo – Down payments](https://www.odoo.com/documentation/19.0/applications/sales/sales/invoicing/down_payment.html) | Nhận đặt cọc trước, thanh toán phần còn lại sau | Cho phép thu từng đợt, không gắn cứng thu tiền với trạng thái giao hàng |
| [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) | Giới hạn đối với kinh doanh trực tuyến/ecommerce/SaaS và giao dịch nhạy cảm | Pages tiếp tục là bản demo dữ liệu giả; vận hành thật cần hosting phù hợp |

PDF thương mại của ứng dụng không thay thế hóa đơn điện tử của nhà cung cấp đáp ứng quy định thuế. Tham khảo [Chính phủ – nội dung hóa đơn theo Nghị định 70/2025](https://xaydungchinhsach.chinhphu.vn/nghi-dinh-so-70-2025-nd-cp-sua-doi-bo-sung-quy-dinh-noi-dung-cua-hoa-don-119250402145733568.htm).

## Phạm vi nâng cấp lần này

1. **Hồ sơ doanh nghiệp:** tên, địa chỉ, liên hệ, mã số thuế và thông tin tài khoản ngân hàng dùng trên chứng từ.
2. **Bốn loại chứng từ:** báo giá, đề nghị thanh toán, phiếu giao hàng, phiếu thu. Lập từ đơn hiện có; có mã, ngày, khách hàng, chi tiết hàng và điều khoản. Xem trước, in A4, tải PDF tiếng Việt và bản HTML để lưu/chia sẻ.
3. **Thu tiền nhiều lần:** lưu khoản thu thực tế, ngày, phương thức và tham chiếu. Số tiền đã thu từ bản cũ giữ thành số đầu kỳ; không tự tạo phiếu thu giả. Hủy chứng từ phải có lý do, giữ lịch sử; hủy phiếu thu cập nhật lại công nợ.
4. **Lịch sử chứng từ:** lưu thông tin người bán, khách và đơn tại thời điểm lập; sửa danh mục sau đó không đổi bản đã phát hành. Máy chủ chống xóa/sửa lịch sử và ghi đè từ thiết bị cũ.
5. **Website công khai:** giới thiệu doanh nghiệp, năng lực, sản phẩm/dịch vụ, lọc danh mục, xem chi tiết và soạn email yêu cầu báo giá. Nút quản lý đưa vào khu đăng nhập.
6. **Quản lý nội dung website:** sửa bản nháp hồ sơ/danh mục trong quản trị, đánh dấu sản phẩm hiển thị, xuất bản riêng. Khách chỉ đọc bản đã xuất bản; API công khai không trả dữ liệu nhân sự, lương, khách hàng, công nợ, ngân hàng hay khóa đăng nhập.

Trang demo dùng nội dung minh họa được ghi rõ; chưa có thông tin thật của doanh nghiệp thì không tự bịa số điện thoại, tài khoản ngân hàng, chứng chỉ hay khách hàng tiêu biểu. Soạn email mở ứng dụng email của khách, không tự gửi hoặc giả báo đã tiếp nhận yêu cầu.

## Kiến trúc và thứ tự triển khai

- Thêm `Data.commerce` tùy chọn để các bản sao cũ vẫn đọc được. Khi bắt đầu dùng nghiệp vụ mới mới lưu phần mở rộng; không thay snapshot hiện có trong lúc triển khai.
- Backend và trình duyệt dùng chung bộ kiểm tra dữ liệu. Kiểm tra chuyển trạng thái dưới khóa máy chủ để bảo vệ lịch sử và công nợ, giữ CAS và giới hạn 2 MiB.
- Website công khai nằm ngoài cổng đăng nhập, dùng API đọc bản xuất bản riêng. Phần quản lý vẫn phải xác thực. Public không tải dữ liệu nội bộ rồi giấu bằng CSS.
- PDF tạo trong trình duyệt với font tiếng Việt nhúng, không gửi chứng từ sang dịch vụ chuyển đổi bên ngoài. Font và thư viện PDF chỉ tải khi cần xuất file.
- Sau lập trình: kiểm tra chức năng, quyền truy cập, hồi quy dữ liệu cũ, desktop/mobile và hiển thị PDF; cập nhật Apps Script trước frontend; xác minh bản demo sau phát hành.

## Tiêu chí nghiệm thu

- Đề nghị thanh toán/báo giá/giao hàng không tự cộng tiền đã thu. Phiếu thu một phần làm giảm đúng công nợ, không cho thu vượt số còn lại.
- Hủy phiếu thu khôi phục đúng công nợ, không mất thông tin gốc; nhập lại bản sao cũ không xóa được lịch sử mới trên máy chủ.
- Tổng số lượng trên phiếu giao hàng còn hiệu lực không vượt số lượng đặt; đây là chứng từ giao hàng, chưa tự trừ kho hoặc tự đổi công đoạn.
- Chứng từ tải lại từ Sheets in ra đúng bản đã lập. Nội dung nhập tay được hiển thị như văn bản, không chạy mã HTML/JavaScript.
- PDF mở được, đủ chữ Việt, bảng và chữ ký không chồng/cắt; nội dung dài có phân trang.
- Khách lạ xem giới thiệu/sản phẩm được phép công khai mà không có dữ liệu quản lý hoặc phiên đăng nhập. Bản nháp chưa xuất bản không xuất hiện với khách.
- Đơn hàng, payroll, phiên đăng nhập, tự lưu và xử lý xung đột hiện có tiếp tục hoạt động.

## Các bước tiếp theo sau bản demo

Báo giá độc lập nhiều dòng và chuyển thành đơn có xác nhận; quy trình nhận yêu cầu báo giá trên máy chủ có chống spam; đơn mua/gia công ngoài; định mức vật tư và giá thành; lịch máy; phân quyền nhiều người; tích hợp hóa đơn điện tử và cổng thanh toán. Đây là lộ trình tiếp theo, không mô tả là tính năng đã có trong lần nâng cấp này.
