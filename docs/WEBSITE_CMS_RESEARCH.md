# Website cơ khí tự quản trị nội dung

Ngày nghiên cứu: 22/10/2026. Mục tiêu: người quản lý tự cập nhật nội dung và ảnh thường xuyên, không cần sửa mã hoặc triển khai lại website cho mỗi lần thay đổi.

## Khảo sát website doanh nghiệp

| Website chính thức | Cách tổ chức hữu ích | Áp dụng cho xưởng nhỏ |
| --- | --- | --- |
| [Tài Phát Precision](https://taiphatprecision.com.vn/) | Năng lực, ảnh xưởng và yêu cầu báo giá | Ảnh bìa, bài giới thiệu riêng, ảnh công việc và nút liên hệ rõ ràng |
| [CNCTech – Precision Machining](https://cnctech.com.vn/en/precision-machining) | Thiết bị, vật liệu và thư viện sản phẩm | Nhóm sản phẩm, vật liệu, thông số kỹ thuật và album ảnh |
| [Protolabs CNC](https://www.protolabs.com/services/cnc-machining/) | Ưu tiên trao đổi/báo giá, trình bày năng lực và vật liệu | CTA báo giá cạnh nội dung kỹ thuật; không giả lập báo giá tự động |
| [Xometry CNC](https://www.xometry.com/capabilities/cnc-machining-service/) | Điều hướng nhanh giữa dịch vụ, thông số, vật liệu và hoàn thiện | Phân khu rõ ràng, menu gọn, chi tiết sản phẩm dễ đọc trên điện thoại |

Không sao chép thương hiệu, ảnh xưởng, số năm kinh nghiệm, chứng nhận hay thông số năng lực của các công ty tham khảo. Chủ doanh nghiệp nhập thông tin thực tế của mình. Bản mẫu tiếp tục có nhãn minh họa.

## Phần quản trị được triển khai

- **Nhận diện:** tên công ty, logo, màu chủ đạo; màu chữ trên nút được chọn theo độ tương phản.
- **Trang đầu:** dòng giới thiệu, tiêu đề, mô tả, ảnh bìa và mô tả ảnh.
- **Giới thiệu & năng lực:** bài giới thiệu riêng, ảnh xưởng và danh sách năng lực.
- **Sản phẩm:** thêm/sửa, nhân bản, ẩn/hiện, xóa khỏi bản nháp, sắp xếp lên/xuống; tối đa sáu ảnh và chọn ảnh bìa cho mỗi sản phẩm.
- **Hình ảnh công việc:** tối đa 12 mục có ảnh, tên và mô tả; sắp xếp theo nhu cầu.
- **Liên hệ & bố cục:** điện thoại, email, địa chỉ, giờ làm việc, liên kết Zalo/bản đồ và bật/tắt sáu phần nội dung.
- **Thư viện ảnh:** tải từ máy tính/điện thoại, chọn lại ảnh đã tải, xem dung lượng, xóa ảnh không còn dùng. Không xóa ảnh vẫn được tham chiếu bởi bản nháp đã lưu hoặc bản đang xuất bản.

Các thay đổi đi qua **Lưu bản nháp → chờ đồng bộ → Xem trước → Xuất bản**. Khách mở hoặc tải lại trang nhận nội dung mới từ Google, không cần một lần build GitHub khác. Ảnh tải lên ở trạng thái riêng tư; chỉ ảnh được dùng trong nội dung đã xuất bản mới được API công khai phục vụ. Tắt một phần rồi xuất bản cũng loại nội dung/ảnh của phần đó khỏi bản công khai.

## Cách lưu ảnh và giới hạn

Giữ Google Sheets hiện có để tránh yêu cầu chủ xưởng mở thêm dịch vụ, khóa API hoặc cấp thêm quyền Drive cho bản demo. Trình duyệt nhận JPG/PNG/WebP tối đa 10 MB, thu nhỏ cạnh dài về tối đa 1.600 px và tạo JPEG tối đa 160 KiB. Việc raster hóa bỏ metadata của ảnh gốc; nền trong suốt trở thành trắng. HEIC cần chuyển sang JPG trước.

Ảnh nằm ở vùng lưu riêng trong Sheet, tách khỏi snapshot đơn hàng/lương. Hạn mức thư viện của bản tích hợp là **80 ảnh hoặc 12 MiB**, tùy điều kiện nào đạt trước. Tải cùng nội dung ảnh dùng lại một bản; metadata chỉ được commit sau khi byte ảnh đã được kiểm tra. Không đặt chuỗi ảnh vào snapshot 2 MiB hay catalog công khai 256 KiB.

[Apps Script Content Service](https://developers.google.com/apps-script/guides/content) phục vụ văn bản/JSON và chuyển hướng đến `script.googleusercontent.com`; vì vậy ứng dụng tải dữ liệu ảnh riêng rồi tạo URL ảnh trong bộ nhớ trình duyệt. Ảnh tải khi sắp vào vùng nhìn thấy và được dùng lại trong phiên để giảm số yêu cầu. Xem thêm [hạn mức Apps Script](https://developers.google.com/apps-script/guides/services/quotas). Đây là lựa chọn cho demo nhỏ, không phải CDN ảnh cho website có lượng truy cập lớn.

Ảnh gốc không nằm trong bản sao JSON. JSON giữ tham chiếu để dùng lại với cùng thư viện; khi chuyển hệ thống cần giữ ảnh gốc hoặc sao lưu cả Google Sheet. Khi danh mục/lượt truy cập tăng, chuyển kho ảnh sang dịch vụ object storage/CDN phù hợp, giữ các biểu mẫu quản trị hiện có.

## Kiểm tra trước phát hành

Kiểm tra độc lập đường công khai không đọc snapshot nội bộ; ảnh nháp không truy cập ẩn danh được; ảnh đang xuất bản không bị xóa; tải ảnh không hợp lệ/quá dung lượng; thử lại sau gián đoạn không nhân bản; phiên hết hạn và thay ảnh trong khi tải; dữ liệu cũ đọc được mà không tự ghi migration; bản lưu nghiệp vụ/chứng từ/lương không thay đổi khi chỉnh website. Kiểm tra giao diện trên desktop và điện thoại ở cả hai chế độ màu.
