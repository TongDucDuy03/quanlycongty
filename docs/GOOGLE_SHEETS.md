# Kết nối Google Sheets

Ứng dụng dùng Google Sheets làm nơi lưu chung cho máy tính và điện thoại, qua một Web App Google Apps Script trong tài khoản của bạn. Không cần Supabase, thẻ thanh toán hoặc service-account key. Google vẫn áp dụng hạn mức Apps Script; đây là bản chạy thử cho một chủ xưởng hoặc nhóm quản lý tin cậy, chưa có quyền riêng cho từng nhân viên.

## Cần chuẩn bị

- Một tài khoản Google có thể tạo Google Sheet và triển khai Apps Script Web App.
- Một **Google Sheet mới, trống**, chỉ chia sẻ với người quản lý cần thiết. Không bật “Anyone with the link” cho Sheet và không Publish to web.
- Mã nguồn [Code.gs](../google-apps-script/Code.gs) trong repository này.

Chỉ gửi link Google Sheet chưa đủ để ứng dụng ghi dữ liệu. Sau thiết lập, ứng dụng cần **URL Web App kết thúc bằng `/exec`** và **khóa kết nối**. Nhập khóa trực tiếp trong ứng dụng; không gửi khóa qua chat, không đưa vào GitHub hoặc URL.

## Thiết lập một lần

1. Tạo Sheet mới, đặt tên **Quản lý công ty**. Mở **Tiện ích mở rộng → Apps Script**.
2. Thay nội dung `Code.gs` bằng toàn bộ mã từ [file Code.gs](../google-apps-script/Code.gs), rồi lưu. Không dán dấu ``` bao quanh mã.
3. Trong **Project Settings**, bật hiển thị file manifest `appsscript.json`; thay nội dung bằng [manifest đi kèm](../google-apps-script/appsscript.json) để dùng V8, múi giờ Việt Nam và quyền bảng tính. Sau đó chọn hàm **setup** và bấm **Run / Chạy**. Cấp quyền truy cập bảng tính cho script của chính bạn. Nếu tài khoản công ty chặn ứng dụng chưa xác minh hoặc triển khai công khai, cần quản trị viên Google Workspace cho phép; không công khai Sheet để khắc phục.
4. Xem **Execution log / Nhật ký thực thi** để lấy khóa kết nối do script tạo. Chỉ người giữ khóa mới gọi được API đọc/ghi; người giữ khóa có thể đọc toàn bộ dữ liệu, kể cả tiền lương. Cất khóa trong trình quản lý mật khẩu.
5. Bấm **Deploy → New deployment → Web app**. Chọn **Execute as: Me**, **Who has access: Anyone**, rồi **Deploy**. “Anyone” ở đây áp dụng cho endpoint; script vẫn kiểm tra khóa cho mọi lần đọc/ghi. Quyền của Google Sheet giữ ở **Restricted**.
6. Sao chép URL dạng `https://script.google.com/macros/s/…/exec`. Không dùng URL `/dev`, URL trang chỉnh sửa script hoặc URL Google Sheet cho ô kết nối.
7. Mở ứng dụng → **Cài đặt & dữ liệu → Kết nối Google Sheets**. Dán URL Web App và khóa, bấm **Kết nối Google Sheets**.
8. Nếu Sheet chưa có dữ liệu ứng dụng, kiểm tra bản dữ liệu đang hiển thị rồi bấm **Khởi tạo Sheet**. Ứng dụng sẽ hỏi trước khi gửi; không tự tải dữ liệu mẫu lên Google.
9. Trên thiết bị thứ hai, nhập cùng URL và khóa. Kết nối rồi xác nhận tải dữ liệu hiện có. Tạo một thay đổi thử trên thiết bị thứ nhất, bấm **Lưu lên Google Sheets**, sau đó bấm **Tải từ Google Sheets** ở thiết bị thứ hai để kiểm tra.

Khi cập nhật `Code.gs`, phải vào **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Chỉ lưu file không cập nhật bản `/exec` đang dùng.

## Cách dùng hằng ngày

1. **Tải từ Google Sheets** trước khi bắt đầu làm việc trên một thiết bị khác. Việc tải thay thế bản trên thiết bị, nên xuất JSON trước nếu còn thay đổi chưa gửi.
2. Thêm/sửa đơn, kho, chấm công hoặc lương như bình thường. Thay đổi được lưu cục bộ trước.
3. Bấm **Lưu lên Google Sheets** sau khi hoàn thành. Chờ thông báo thành công; đóng trình duyệt trước đó không đảm bảo dữ liệu đã lên Sheet.
4. Xuất **Sao lưu JSON** định kỳ và trước khi đổi kết nối. CSV phục vụ xem bảng; JSON giữ đầy đủ dữ liệu khôi phục.

Đồng bộ **thủ công**, không realtime. Sau khi tải lại trang phải nhập lại khóa. Ứng dụng chỉ nhớ URL endpoint, không lưu khóa trong localStorage/sessionStorage. Ngắt kết nối xóa khóa khỏi phiên ứng dụng nhưng **không xóa bản dữ liệu trên thiết bị**. Tránh dùng máy công cộng.

Nếu hai thiết bị cùng sửa một phiên bản, bản lưu sau bị chặn để tránh ghi đè. Xuất JSON của bản chưa gửi, tải bản mới nhất, rồi nhập lại những thay đổi cần giữ. Chưa có tự gộp hai bản.

Nếu mất mạng hoặc hết thời gian chờ khi lưu, máy chủ có thể đã ghi xong. Ứng dụng yêu cầu tải lại để xác định trạng thái trước khi lưu tiếp; không tự gửi lại yêu cầu ghi.

## Dữ liệu nằm ở đâu?

Toàn bộ đơn hàng, khách hàng, vật tư, lịch sử kho, nhân sự, chấm công, cấu hình/phụ cấp và kỳ lương đã chốt nằm trong snapshot có phiên bản trong Sheet. Script chia dữ liệu thành nhiều ô, giữ hai vùng lưu luân phiên và kiểm tra checksum trước khi chuyển bản đang dùng.

Các tab báo cáo do script tạo dùng để xem/lọc dữ liệu; chúng được tạo lại khi lưu thành công. **Không sửa trực tiếp các tab này để cập nhật ứng dụng**. Nếu tab báo cáo chưa cập nhật vì quota/lỗi, snapshot đã lưu vẫn là nguồn dữ liệu chính; xem thông báo trong ứng dụng. Không sửa/xóa các tab kỹ thuật hoặc Script Properties.

Giới hạn bản tích hợp này là **2 MiB (2.097.152 byte) cho mỗi snapshot JSON**, độc lập với dung lượng tối đa của Google Sheets. Giới hạn giúp giữ thời gian xử lý và mức sử dụng Apps Script phù hợp cho pilot. Ảnh, PDF, bản vẽ để Google Drive và dùng mã/đường dẫn tham chiếu; không nhúng tệp vào dữ liệu. Khi gần giới hạn cần đo dữ liệu và chuyển sang cách lưu theo bản ghi; không có cam kết miễn phí hoặc sức chứa vô hạn.

## Quyền truy cập và xử lý sự cố

- **Sai khóa:** kiểm tra khóa trong Script Properties theo tên được ghi trong `Code.gs`. Không đưa khóa vào ảnh chụp hỗ trợ. Để thu hồi khóa đã lộ, thay khóa tương ứng bằng một giá trị ngẫu nhiên dài ít nhất 32 ký tự; các thiết bị phải nhập khóa mới.
- **Trả trang HTML / lỗi mạng / CORS:** kiểm tra URL `/exec`, quyền Web App **Anyone**, triển khai phiên bản mới và tài khoản Workspace có cho phép không. Không dùng `no-cors`: cách đó không đọc được phản hồi và không biết lưu có thành công.
- **Bận / quá quota:** đợi rồi thử tải lại; không bấm liên tục. Apps Script dùng hạn mức tài khoản chủ script.
- **Xung đột:** giữ JSON bản trên thiết bị trước, tải bản mới rồi xử lý thay đổi; không có nút ép ghi đè.
- **Sheet bị sửa tay/hỏng:** không khởi tạo đè để chữa lỗi. Giữ bản sao Sheet và JSON, kiểm tra các vùng dữ liệu với người triển khai.

GitHub Pages của dự án vẫn dành cho trình diễn bằng dữ liệu giả. Có thể nối một Sheet demo để thử giữa hai thiết bị. Trước khi đưa dữ liệu lương thật vào vận hành, dùng môi trường hosting phù hợp và kiểm tra quyền thực tế. Bản kết nối này dùng chung một khóa quản lý, chưa có đăng nhập Google từng nhân viên, phân quyền phòng ban hoặc nhật ký ai thay đổi.

## Kiểm tra nghiệm thu trên tài khoản Google của bạn

Các kiểm thử tự động trong repository giả lập Apps Script/HTTP, không thay thế kiểm tra Google thật. Sau khi triển khai cần xác nhận: khóa sai không đọc được dữ liệu; khóa đúng tải/lưu được từ máy tính và điện thoại; Sheet vẫn Restricted; hai thiết bị cùng sửa bị chặn ghi đè; chấm công/kỳ lương đã chốt còn nguyên sau tải lại; lỗi mạng được hiển thị rõ.

Tài liệu Google: [Web Apps](https://developers.google.com/apps-script/guides/web), [Content Service và chuyển hướng phản hồi](https://developers.google.com/apps-script/guides/content), [LockService](https://developers.google.com/apps-script/reference/lock/lock-service), [hạn mức Apps Script](https://developers.google.com/apps-script/guides/services/quotas).

## Dành cho người bảo trì mã nguồn

`Code.gs` là file triển khai được sinh từ `google-apps-script/Backend.js` và bộ kiểm tra dữ liệu dùng chung trong `src/domain.ts`, `src/payroll.ts`. Khi sửa các file này, chạy `npm run build:apps-script`, commit lại `Code.gs` rồi cập nhật deployment Google. `npm run build` kiểm tra file sinh có khớp nguồn hay không. Người thiết lập chỉ cần dán **Code.gs** và manifest, không cần dán thêm `Backend.js`.
