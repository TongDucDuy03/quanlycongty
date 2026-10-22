# Kết nối Google Sheets

## Bản dùng chung đã cấu hình sẵn

Bản trên GitHub Pages dùng **một Google Sheet cố định cho công ty**. Trên máy tính hoặc điện thoại, mở cùng đường link và đăng nhập tài khoản quản lý. Không nhập URL Apps Script hay khóa kết nối. Chọn ghi nhớ đăng nhập trên thiết bị cá nhân để tự vào lại trong thời hạn phiên (30 ngày).

Sau khi lưu đơn hàng, chấm công hoặc bảng lương, dữ liệu tự gửi lên cùng Sheet. Chờ trạng thái **đã đồng bộ** trước khi đóng trang. Khi quay lại ứng dụng hoặc kiểm tra định kỳ, thiết bị nhận dữ liệu mới; hai máy sửa đồng thời có thể cần xử lý xung đột. Khi phiên hết hạn, đăng nhập lại bằng tài khoản quản lý; cấu hình Sheet không thay đổi.

**Đăng xuất** xóa phiên và bản lưu công ty trên thiết bị. Nếu còn thay đổi chưa đồng bộ, ứng dụng hỏi trước và tải bản sao JSON khi bạn xác nhận. Không dùng tài khoản Google làm mật khẩu ứng dụng. Đây là một tài khoản quản lý chung, chưa có phân quyền nhân viên.

**Đổi mật khẩu:** vào **Cài đặt & dữ liệu → Tài khoản công ty → Đổi mật khẩu**. Nhập mật khẩu hiện tại, mật khẩu mới (12–128 ký tự, khác mật khẩu cũ) và xác nhận lại. Đổi thành công thì đăng nhập lại bằng mật khẩu mới; các phiên cũ trên thiết bị khác cũng hết hiệu lực. Dữ liệu và thay đổi chưa đồng bộ được giữ để tiếp tục sau đăng nhập. Nếu mất mạng khi gửi yêu cầu đổi mật khẩu, thử đăng nhập bằng mật khẩu mới trước vì máy chủ có thể đã đổi xong. Tệp tài khoản bàn giao ban đầu không tự cập nhật; hãy cất mật khẩu mới riêng tư.

Thông tin đăng nhập được bàn giao riêng cho chủ hệ thống, không nằm trong repository hoặc hướng dẫn công khai. Trình duyệt dùng mã phiên có hạn; khóa quản trị Apps Script không được nhúng vào mã nguồn. Trình duyệt cũ đã có kết nối được chuyển sang phiên đăng nhập tự động và bỏ khóa cũ khỏi cấu hình trình duyệt.

## Dành cho người triển khai một hệ thống mới

Các bước phía dưới dành cho kỹ thuật viên cài một hệ thống khác. Người dùng bản đã cấu hình sẵn **không làm lại các bước này trên từng thiết bị**.

Ứng dụng dùng Google Sheets làm nơi lưu chung cho máy tính và điện thoại, qua một Web App Google Apps Script trong tài khoản của bạn. Không cần Supabase, thẻ thanh toán hoặc service-account key. Google vẫn áp dụng hạn mức Apps Script; đây là bản chạy thử cho một chủ xưởng hoặc nhóm quản lý tin cậy, chưa có quyền riêng cho từng nhân viên.

## Cần chuẩn bị

- Một tài khoản Google có thể tạo Google Sheet và triển khai Apps Script Web App.
- Một **Google Sheet mới, trống**, chỉ chia sẻ với người quản lý cần thiết. Không bật “Anyone with the link” cho Sheet và không Publish to web.
- Mã nguồn [Code.gs](../google-apps-script/Code.gs) trong repository này.

Chỉ gửi link Google Sheet chưa đủ để ứng dụng ghi dữ liệu. Sau thiết lập, ứng dụng cần **URL Web App kết thúc bằng `/exec`** và **khóa kết nối**. Nhập khóa trực tiếp trong ứng dụng; không gửi khóa qua chat, không đưa vào GitHub hoặc URL.

## Thiết lập nền tảng lưu trữ một lần

1. Tạo Sheet mới, đặt tên **Quản lý công ty**. Mở **Tiện ích mở rộng → Apps Script**.
2. Thay nội dung `Code.gs` bằng toàn bộ mã từ [file Code.gs](../google-apps-script/Code.gs), rồi lưu. Không dán dấu ``` bao quanh mã.
3. Trong **Project Settings**, bật hiển thị file manifest `appsscript.json`; thay nội dung bằng [manifest đi kèm](../google-apps-script/appsscript.json) để dùng V8, múi giờ Việt Nam và quyền bảng tính. Sau đó chọn hàm **setup** và bấm **Run / Chạy**. Cấp quyền truy cập bảng tính cho script của chính bạn. Nếu tài khoản công ty chặn ứng dụng chưa xác minh hoặc triển khai công khai, cần quản trị viên Google Workspace cho phép; không công khai Sheet để khắc phục.
4. Xem **Execution log / Nhật ký thực thi** để lấy khóa kết nối do script tạo. Chỉ người giữ khóa mới gọi được API đọc/ghi; người giữ khóa có thể đọc toàn bộ dữ liệu, kể cả tiền lương. Cất khóa trong trình quản lý mật khẩu.
5. Bấm **Deploy → New deployment → Web app**. Chọn **Execute as: Me**, **Who has access: Anyone**, rồi **Deploy**. “Anyone” ở đây áp dụng cho endpoint; script vẫn kiểm tra khóa cho mọi lần đọc/ghi. Quyền của Google Sheet giữ ở **Restricted**.
6. Sao chép URL dạng `https://script.google.com/macros/s/…/exec`. Không dùng URL `/dev`, URL trang chỉnh sửa script hoặc URL Google Sheet cho ô kết nối.
7. Mở ứng dụng → **Cài đặt & dữ liệu → Kết nối Google Sheets**. Dán URL Web App và khóa, giữ lựa chọn ghi nhớ trên thiết bị rồi bấm **Kết nối Google Sheets**. Chỉ cần làm một lần trên mỗi trình duyệt; lần sau ứng dụng tự kết nối.
8. Nếu Sheet chưa có dữ liệu ứng dụng, kiểm tra bản dữ liệu đang hiển thị rồi bấm **Khởi tạo Sheet**. Ứng dụng sẽ hỏi trước khi gửi; không tự tải dữ liệu mẫu lên Google.
9. Trên thiết bị thứ hai, nhập cùng URL và khóa một lần, rồi nhận dữ liệu hiện có. Thử sửa một đơn trên thiết bị thứ nhất, chờ trạng thái **đã đồng bộ**, rồi trở lại cửa sổ ứng dụng trên thiết bị thứ hai để kiểm tra cập nhật.

Khi cập nhật `Code.gs`, phải vào **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Chỉ lưu file không cập nhật bản `/exec` đang dùng.

Để bật bản dùng chung có đăng nhập:

1. Sau khi backend mới được triển khai, gọi POST `configureLogin` với khóa quản trị hiện có, tên tài khoản quản lý và mật khẩu mạnh. API này chỉ khởi tạo tài khoản một lần, không ghi đè tài khoản đã tồn tại. Không đưa các giá trị bí mật vào URL, file được Git theo dõi hoặc log.
2. Đặt `VITE_COMPANY_ENDPOINT` bằng URL `/exec` trong môi trường build Pages, và `VITE_COMPANY_NAME` bằng tên hiển thị. Đây là URL công khai, không phải khóa. Không có biến `VITE_*` chứa mật khẩu hoặc khóa quản trị.
3. Build và deploy frontend. Thiết bị mới thấy màn hình đăng nhập và tự nhận dữ liệu sau xác thực. Cache công ty được tách khỏi demo; không tự đẩy dữ liệu mẫu lên công ty.
4. Tài khoản dùng PBKDF2-SHA256 600.000 vòng; phiên được ký bằng HMAC, hết hạn sau 30 ngày. Sai đăng nhập 5 lần trong cửa sổ 15 phút sẽ tạm giới hạn thử tiếp. Khóa quản trị cũ chỉ dành cho bảo trì và chuyển phiên, không chia sẻ cho người dùng hằng ngày.

Các bước nhập URL/khóa ở chế độ phát triển chỉ còn dành cho bản không đặt `VITE_COMPANY_ENDPOINT`.

## Cách đồng bộ và sao lưu

1. Mở ứng dụng. Trên thiết bị đã ghi nhớ kết nối, ứng dụng tự kiểm tra và nhận dữ liệu mới.
2. Thêm/sửa đơn, kho, chấm công hoặc lương như bình thường. Khi bạn hoàn tất thao tác trong biểu mẫu, thay đổi được lưu trên thiết bị rồi tự gửi lên Sheet sau khoảng 1–2 giây.
3. Chờ trạng thái **đã đồng bộ** trước khi đóng ứng dụng. **Đồng bộ ngay** dùng để yêu cầu kiểm tra ngay, không phải bước bắt buộc sau mỗi lần sửa.
4. Xuất **Sao lưu JSON** định kỳ và trước khi đổi kết nối. CSV phục vụ xem bảng; JSON giữ đầy đủ dữ liệu khôi phục.

Ứng dụng **tự đồng bộ** khi có thay đổi, khi mở lại/quay lại cửa sổ và kiểm tra định kỳ lúc trang đang mở. Đây không phải đồng bộ tức thì từng ký tự. Trong bản công ty cố định, thiết bị chỉ lưu phiên đăng nhập, không lưu mật khẩu hay khóa quản trị. Xóa dữ liệu trình duyệt, đổi thiết bị hoặc phiên hết hạn thì đăng nhập lại, không cấu hình lại Sheet. Chế độ kỹ thuật không có endpoint cố định vẫn hỗ trợ ghi nhớ khóa trên thiết bị và ngắt kết nối như trước.

Nếu hai thiết bị cùng sửa một phiên bản, ứng dụng tạm dừng tự lưu và báo xung đột để tránh ghi đè. Xuất JSON của bản chưa gửi, nhận bản mới nhất, rồi nhập lại những thay đổi cần giữ. Chưa có tự gộp hai bản; tải lại trang không tự bỏ qua xung đột.

Nếu mất mạng, các thao tác đã lưu trên thiết bị vẫn còn. Ứng dụng thử kết nối lại và đối chiếu bản phía Google trước khi tiếp tục gửi. Nếu máy chủ đã ghi xong nhưng phản hồi bị mất, ứng dụng nhận diện bản đã gửi để không ghi đè mù. Giữ trang mở hoặc mở lại khi có mạng và chờ trạng thái đã đồng bộ. Đây chưa phải PWA cài đặt chạy offline; lần mở trang mới vẫn cần tải được ứng dụng.

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

GitHub Pages của dự án vẫn dành cho trình diễn bằng dữ liệu giả. Trước khi đưa dữ liệu lương thật vào vận hành, dùng môi trường hosting phù hợp và kiểm tra quyền thực tế. Bản cố định có tài khoản quản lý và phiên đăng nhập; chưa có đăng nhập Google từng nhân viên, phân quyền phòng ban hoặc nhật ký ai thay đổi.

## Kiểm tra nghiệm thu trên tài khoản Google của bạn

Các kiểm thử tự động trong repository giả lập Apps Script/HTTP, không thay thế kiểm tra Google thật. Sau khi triển khai cần xác nhận: khóa sai không đọc được dữ liệu; khóa đúng tải/lưu được từ máy tính và điện thoại; Sheet vẫn Restricted; hai thiết bị cùng sửa bị chặn ghi đè; chấm công/kỳ lương đã chốt còn nguyên sau tải lại; lỗi mạng được hiển thị rõ.

Tài liệu Google: [Web Apps](https://developers.google.com/apps-script/guides/web), [Content Service và chuyển hướng phản hồi](https://developers.google.com/apps-script/guides/content), [LockService](https://developers.google.com/apps-script/reference/lock/lock-service), [hạn mức Apps Script](https://developers.google.com/apps-script/guides/services/quotas).

## Dành cho người bảo trì mã nguồn

`Code.gs` là file triển khai được sinh từ `google-apps-script/Backend.js` và bộ kiểm tra dữ liệu dùng chung trong `src/domain.ts`, `src/payroll.ts`. Khi sửa các file này, chạy `npm run build:apps-script`, commit lại `Code.gs` rồi cập nhật deployment Google. `npm run build` kiểm tra file sinh có khớp nguồn hay không. Người thiết lập chỉ cần dán **Code.gs** và manifest, không cần dán thêm `Backend.js`.
