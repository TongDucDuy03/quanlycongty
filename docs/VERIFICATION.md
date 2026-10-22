# Biên bản kiểm tra demo XưởngViệt

Ngày: 22/10/2026. Thư mục dự án: `D:\quản lý công ty`. Ban đầu thư mục trống, không có mã nguồn hoặc Git remote. Nhóm diey-team gồm nghiên cứu, kiến trúc, triển khai nghiệp vụ, QA độc lập và review độc lập. Lead tích hợp và kiểm tra bản cuối.

## Đổi mật khẩu tài khoản quản lý — 22/10/2026

- QA độc lập: **117/117 unit tests**, gồm 30 kiểm thử backend; **24 trường hợp tài khoản E2E** trên desktop/mobile (lượt 22 ca và lượt bổ sung 2 ca mất phản hồi). Build production và `verify:dist` đạt, form điện thoại đã kiểm tra trực quan.
- Đổi mật khẩu yêu cầu phiên ký và mật khẩu hiện tại; áp dụng giới hạn thử, kiểm tra mật khẩu mới, đổi salt/hash/version bằng một lần ghi. Mọi phiên cũ hết hiệu lực. Load/save kiểm tra lại phiên sau khi lấy khóa để chặn yêu cầu đã xếp hàng trước lúc đổi.
- Kiểm tra xác nhận không khớp, mật khẩu hiện tại sai, mất phản hồi, đăng nhập bằng mật khẩu mới và giữ dữ liệu chưa đồng bộ. Các lần đổi thành công chạy trên backend giả lập, không thay mật khẩu thật của người dùng.
- Backend thật đã cập nhật: đăng nhập hiện tại vẫn hoạt động, handler đổi mật khẩu từ chối mật khẩu mới không hợp lệ, phiên và snapshot revision 3 giữ nguyên. Commit `c96096a` được [workflow 39736632929](https://github.com/TongDucDuy03/quanlycongty/actions/runs/39736632929) build/deploy thành công. Chrome của người dùng tải bản mới, hiển thị nút **Đổi mật khẩu**, tài khoản admin và trạng thái đã đồng bộ v3.

## Google Sheet cố định và đăng nhập công ty — 22/10/2026

- QA độc lập: **110/110 unit tests**, **64/64 E2E** (48 hồi quy và 16 đăng nhập công ty trên desktop/mobile), build production và kiểm tra bản build dưới đường dẫn con đều đạt.
- Kiểm tra đăng nhập mới, hai thiết bị đồng bộ, chuyển khóa cũ sang phiên, hết phiên giữ chỉnh sửa, đăng xuất khóa tab khác, phản hồi muộn, ngoại tuyến và cache khác công ty. Browser tests dùng API giả lập.
- `verify:dist` hỗ trợ cả demo và bản công ty, kiểm tra đăng nhập, reload đường dẫn con, payroll tải động, sáng/tối và desktop/mobile. Ảnh preview dùng dữ liệu giả.
- Apps Script thật đã cập nhật **phiên bản 2** trên endpoint hiện có. Tạo tài khoản quản lý một lần, đăng nhập thực tế khoảng 5,8 giây, tải được snapshot revision 3; toàn bộ dữ liệu giống trước cập nhật. Yêu cầu không có phiên bị từ chối `UNAUTHORIZED`.
- Mật khẩu được bàn giao bằng tệp riêng ngoài repository; không nằm trong mã nguồn, môi trường build hay tài liệu công khai. Tài khoản chung chưa phân quyền từng nhân viên.
- Đã xuất bản commit `648e0c8`; [workflow 39735161787](https://github.com/TongDucDuy03/quanlycongty/actions/runs/39735161787) thành công. Trình duyệt độc lập mô phỏng điện thoại đăng nhập qua API Google thật, nhận 12 đơn và 5 nhân viên; không tràn ngang/lỗi JavaScript, reload giữ đăng nhập. Chrome hiện có của người dùng tự chuyển sang tài khoản `admin`, hiển thị đã đồng bộ v3; Cài đặt không còn ô URL/khóa. Kiểm tra này chỉ đọc dữ liệu, không tạo bản ghi thử.

## Tự động đồng bộ Google Sheets — 22/10/2026

- Kết nối được ghi nhớ trên từng trình duyệt khi người dùng chọn; khóa nằm ngoài dữ liệu nghiệp vụ và bản sao JSON. Mở lại tự kết nối; thay đổi đã lưu trong biểu mẫu tự gửi sau khoảng 1,5 giây. Có trạng thái lưu và đường dẫn đến phần xử lý kết nối ở đầu trang.
- `npm test`: **103/103** đạt, gồm 23 kiểm thử mới cho đối chiếu bản cục bộ/bản Google và dữ liệu ghi nhớ bị hỏng. `npm run build` đạt; Apps Script không đổi, không cần người dùng triển khai lại backend.
- QA độc lập: **48/48 trường hợp E2E** đạt trên desktop/mobile (26 Sheets, 22 nghiệp vụ/lương). Gồm ghi nhớ và quên kết nối, tự lưu lương, sửa trong lúc đang gửi, offline qua reload, phản hồi ghi bị mất, xung đột qua reload, tab cũ, nhận bản mới khi focus, giữ bản nháp lương, cache hỏng và khởi tạo mất phản hồi không chồng yêu cầu.
- `npm run verify:dist` đạt: assets dưới đường dẫn con, điều hướng khi tải lại trang, màn hình desktop/mobile và sáng/tối không tràn ngang hoặc lỗi JavaScript. Đã xem ảnh Sheets mobile sáng và desktop tối.
- Review độc lập đã kiểm tra và sửa: chồng yêu cầu khi khởi tạo mất phản hồi, cập nhật trạng thái từ tab cũ, đồng bộ đến khi đang sửa biểu mẫu, phục hồi cache hỏng và tham chiếu dữ liệu React trước khi render. Không còn lỗi chặn theo review mã cuối.
- Tự lưu dùng SHA-256 của bản đã xác nhận và bản đang gửi để đối chiếu sau reload/lỗi mạng; không tự gộp hai thiết bị cùng sửa. Kiểm tra bản mới khi quay lại ứng dụng và mỗi 60 giây khi trang hiển thị. Biểu mẫu đang sửa được giữ; sau khi đóng, có thể cần lần kiểm tra tiếp theo để nhận bản mới.
- Đã xuất bản commit `c088c52`; [workflow 39729520646](https://github.com/TongDucDuy03/quanlycongty/actions/runs/39729520646) thành công. Trên Chrome của người dùng, cấu hình ghi nhớ được bật và tải lại trang tự kết nối phiên bản 1 mà không nhập khóa. Sửa ghi chú một đơn mẫu qua UI tự lưu lên Google thật ở phiên bản 2; hoàn trả ghi chú tự lưu phiên bản 3. Đọc API xác nhận toàn bộ dữ liệu phiên bản 3 giống bản trước kiểm tra. Không bấm nút đồng bộ thủ công trong hai lần ghi này.

## Bản Google Sheets đầu tiên, đồng bộ thủ công — 22/10/2026

- `npm test`: **80/80** đạt, gồm 23 kiểm thử transport và 16 kiểm thử backend Apps Script giả lập.
- `npx playwright test`: **34/34** đạt, gồm 12 trường hợp Sheets trên desktop/mobile. Đã kiểm tra tải/lưu đầy đủ payroll, khởi tạo có xác nhận, khóa không lưu trong localStorage/sessionStorage/URL, hủy tải, sửa trong lúc đang tải, lỗi mạng, xung đột revision và tab cục bộ cũ bị chặn gửi.
- `npm run build`: đạt; kiểm tra mã Apps Script sinh ra khớp nguồn đạt. `npm run verify:dist`: đạt tại đường dẫn con, có màn hình Sheets sáng/tối trên hai kích thước, không lỗi JS hoặc tràn ngang toàn trang.
- Đã xem ảnh [Sheets desktop sáng](previews/sheets-desktop-light.png), [desktop tối](previews/sheets-desktop-dark.png), [mobile sáng](previews/sheets-mobile-light.png), [mobile tối](previews/sheets-mobile-dark.png).
- Review độc lập phát hiện backend kiểm tra schema chưa đủ chặt: đã thay bằng cùng bộ `validateData` của frontend, sinh vào `Code.gs`. Các trường hợp ngày sai, cấu hình lương sai, mã nhân viên/công trùng, kỳ lương hỏng và tổng đơn không an toàn bị từ chối trước commit; dữ liệu cũ và revision được giữ nguyên. Đã thống nhất độ dài khóa 32–256 ký tự.
- Vitest cập nhật 4.1.12; npm báo **0 lỗ hổng** sau cập nhật. Bộ kiểm tra đầy đủ chạy đạt trên phiên bản mới.
- **Trạng thái tại thời điểm kiểm thử bản đầu:** chưa có deployment Apps Script của chủ tài khoản; các test phía trên dùng mô phỏng. Sau đó người dùng đã cấp quyền và triển khai: xác nhận từ frontend công khai lưu thành công phiên bản 1, API đọc thật trả HTTP 200 với 12 đơn, 6 khách, 7 vật tư, 5 nhân viên, 225 dòng công và cấu hình lương. Đây là kiểm tra kết nối dữ liệu demo, chưa phải đo quota hoặc hiệu năng dưới tải lớn.
- **Đã xuất bản frontend:** commit `35f8e6d`, [workflow 39725904305](https://github.com/TongDucDuy03/quanlycongty/actions/runs/39725904305) thành công. Kiểm tra trực tiếp GitHub Pages trên desktop/mobile: màn hình kết nối Sheets, ô khóa che nội dung, link hướng dẫn, chế độ tối và phân hệ lương hiển thị; không lỗi JavaScript hoặc tràn ngang. Đây là xác minh frontend công khai, không phải kết nối dữ liệu Google thật.

## Kết quả bản bàn giao nhân sự trước khi bổ sung Sheets

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
