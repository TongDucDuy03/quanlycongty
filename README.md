# XưởngViệt

Demo quản lý doanh nghiệp gia công cơ khí nhỏ, bằng tiếng Việt. React 19 + TypeScript + Vite, chạy trên GitHub Pages dưới dạng trang tĩnh. Có đơn hàng, sản xuất, kho, công nợ, nhân sự, chấm công, tính lương, chế độ sáng/tối và giao diện điện thoại.

Repository: [TongDucDuy03/quanlycongty](https://github.com/TongDucDuy03/quanlycongty). Địa chỉ Pages: [tongducduy03.github.io/quanlycongty](https://tongducduy03.github.io/quanlycongty/). Xem [mô tả tính năng ngắn gọn](docs/FEATURES.md).

Thư mục bản bàn giao: `D:\quản lý công ty`.

## Chạy ngay

Yêu cầu Node.js 22.12+ (hoặc bản LTS mới tương thích Vite).

```sh
npm ci
npm run dev
```

Mở địa chỉ Vite in ra, thường là `http://localhost:5173`. Trình duyệt hiện đại có hỗ trợ ES2022 và native dialog. Khi không đặt `VITE_COMPANY_ENDPOINT`, bản phát triển chạy demo cục bộ, không cần Google/Supabase.

```sh
npm run build
npm run preview -- --port 4173
```

Không mở `dist/index.html` bằng `file://`; cần web server. Giao diện điện thoại truy cập được qua IP LAN của máy chạy server nếu cùng mạng và firewall cho phép; mỗi trình duyệt có dữ liệu demo riêng.

## Các luồng đã xây

- **Tổng quan:** đơn đang mở, giá trị đơn, tiền còn phải thu, đơn trễ, phân bố công đoạn và vật tư cần bổ sung.
- **Đơn hàng:** thêm, chỉnh sửa, chi tiết, tìm kiếm không dấu, lọc công đoạn/trễ hạn. Ghi mã bản vẽ/phiên bản, vật liệu, máy và người phụ trách.
- **Sản xuất:** bảng công đoạn chờ → gia công → QC → sẵn sàng giao → đã giao; cập nhật số chi tiết hoàn thành.
- **Kho:** tồn, ngưỡng tối thiểu, nhập/xuất có ghi chú và lịch sử; chặn xuất quá tồn.
- **Khách hàng:** danh bạ, thêm khách, xem các đơn liên quan.
- **Công nợ:** giá trị đơn, tổng đã thu, số còn phải thu; chặn thu quá số còn lại.
- **Nhân sự:** thêm/sửa hồ sơ, bộ phận, ngày vào/nghỉ, lương tháng/ngày/giờ, cơ sở bảo hiểm và phụ cấp từng người.
- **Chấm công:** theo người/ngày, giờ thường, phép hưởng lương và tăng ca theo ba nhóm ngày; tổng hợp tháng, không tính trùng một người/ngày.
- **Cấu hình lương:** ngày công chuẩn, giờ/ngày, hệ số tăng ca, tỷ lệ bảo hiểm, danh mục phụ cấp và mức mặc định.
- **Bảng lương:** công thức thu nhập/thực lĩnh rõ ràng; thưởng, tạm ứng, khấu trừ, thuế nhập tay; chi tiết lương, CSV, chốt tháng giữ nguyên lịch sử và mở lại có xác nhận.
- **Dữ liệu:** CSV để mở trong Sheets/Excel, sao lưu/khôi phục JSON được kiểm tra; chế độ demo cục bộ có đặt lại dữ liệu mẫu với xác nhận.
- **Google Sheets công ty:** cấu hình Sheet một lần cho hệ thống. Máy tính và điện thoại mở cùng đường link, đăng nhập tài khoản quản lý để nhận cùng dữ liệu; không nhập URL hoặc khóa kết nối trên từng thiết bị. Tự lưu sau thay đổi, kiểm tra dữ liệu mới khi quay lại ứng dụng và chống ghi đè giữa các thiết bị. Giữ đầy đủ chấm công, kỳ lương đã chốt và các tab báo cáo để xem. Người triển khai thiết lập theo [hướng dẫn](docs/GOOGLE_SHEETS.md).
- **Supabase tùy chọn:** giữ bộ kết nối cũ cho môi trường đã cấu hình; không cần dùng khi chọn Google Sheets.

Các nút thao tác cập nhật dữ liệu thực trong demo. Số phần trăm ở danh sách đơn phản ánh **mốc công đoạn**, còn số chi tiết hoàn thành theo dõi riêng ở chi tiết/bảng sản xuất. Kho chưa tự trừ theo định mức đơn hàng. Một đơn hiện có một dòng chi tiết. Tên, thông tin liên hệ và số liệu seed là giả lập.

Đây chưa phải ERP/kế toán hoàn chỉnh: chưa có phân quyền nhân viên, lịch máy hữu hạn, QC theo tiêu chí, xuất PDF báo giá, tệp bản vẽ, gia công ngoài, hóa đơn VAT, nhật ký phiếu thu, sổ chi, giá thành hoặc lợi nhuận. Responsive không đồng nghĩa app offline/PWA.

## Lưu dữ liệu bằng Google Sheets

**Demo cục bộ khi không cấu hình endpoint công ty:** localStorage, không mất tiền/không cần tài khoản; không tự đồng bộ giữa điện thoại và máy tính. Nên xuất JSON trước khi xóa bộ nhớ trình duyệt. JSON khôi phục đầy đủ; CSV xuất riêng danh sách đơn hàng hoặc bảng lương của tháng được chọn.

**Lựa chọn hiện tại: Google Sheets + Apps Script với cấu hình công ty cố định.** Người triển khai chuẩn bị Sheet, Apps Script, tài khoản quản lý và đặt URL `/exec` công khai trong `VITE_COMPANY_ENDPOINT` khi build. Mật khẩu và khóa quản trị không đưa vào mã nguồn hay cấu hình build. Không cần Supabase hoặc thẻ thanh toán. Người dùng mở cùng đường link trên máy tính/điện thoại rồi đăng nhập; không cần thiết lập Google Sheet riêng cho từng thiết bị.

Đổi mật khẩu tại **Cài đặt & dữ liệu → Tài khoản công ty → Đổi mật khẩu**, bằng mật khẩu hiện tại và mật khẩu mới xác nhận hai lần. Sau khi đổi, đăng nhập lại trên các thiết bị; dữ liệu đang chờ đồng bộ vẫn được giữ.

Phiên đăng nhập có thời hạn 30 ngày. Chọn ghi nhớ trên thiết bị cá nhân để tự kết nối khi mở lại; bỏ chọn để chỉ lưu phiên trong tab hiện tại. Khi hết hạn, đăng nhập lại và tiếp tục đồng bộ các thay đổi còn giữ trên máy. Ứng dụng xác thực với máy chủ trước khi hiển thị dữ liệu khi mở lại, nên bước này cần có mạng. Đăng xuất xóa phiên và bản lưu công ty trên thiết bị; nếu có thay đổi chưa đồng bộ, ứng dụng hỏi xác nhận và tải bản sao JSON trước khi xóa. Mật khẩu/phiên không nằm trong bản sao JSON. Tài khoản quản lý dùng chung có quyền đọc/ghi toàn bộ dữ liệu, gồm lương; chưa có tài khoản hoặc phân quyền riêng từng nhân viên.

Đồng bộ tự động sau thay đổi, có khóa phía máy chủ và kiểm tra revision. Thay đổi lưu cục bộ trước; chờ trạng thái đã đồng bộ trước khi đóng trang. Khi mất mạng, ứng dụng đối chiếu lại bản Google trước khi gửi tiếp. Khi hai thiết bị cùng sửa, tự lưu tạm dừng để người dùng xử lý xung đột; không tự gộp dữ liệu. Giới hạn pilot 2 MiB JSON mỗi snapshot; không lưu ảnh/bản vẽ trong snapshot. Sửa dữ liệu trong ứng dụng, không sửa trực tiếp tab báo cáo để nhập ngược. Hướng dẫn: [docs/GOOGLE_SHEETS.md](docs/GOOGLE_SHEETS.md).

Bộ kết nối Supabase trước đây vẫn có trong mã nguồn, xem [docs/SUPABASE.md](docs/SUPABASE.md); đây là lựa chọn thay thế, không cần cấu hình cho Google Sheets.

## Đưa demo lên GitHub Pages

GitHub Pages dùng cho **demo dữ liệu giả**, có thể kết nối một Google Sheet demo để thử đồng bộ. Workflow đặt `VITE_DEMO_ONLY=true` để tắt bộ kết nối Supabase và giao diện nhắc dùng dữ liệu giả. `VITE_COMPANY_ENDPOINT` bật màn hình đăng nhập và kết nối Sheet cố định; `VITE_COMPANY_NAME` đặt tên hiển thị trên màn hình đăng nhập. Đây đều là cấu hình công khai, không phải nơi lưu bí mật. Không thêm khóa hoặc mật khẩu vào GitHub repository. Chính sách Pages có giới hạn cho kinh doanh/giao dịch nhạy cảm; đọc [nghiên cứu](docs/RESEARCH.md) trước khi chọn hosting vận hành thật.

1. Tạo repository trên GitHub. Với GitHub Free, dùng repository public để có Pages miễn phí.
2. Đẩy toàn bộ mã nguồn (không đẩy `node_modules`, `.env`, `dist`) lên nhánh `main`:

   ```sh
   git init -b main
   git add .
   git commit -m "Build XuongViet workshop management demo"
   git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
   git push -u origin main
   ```

3. Mở repository → **Settings → Pages → Source: GitHub Actions**.
4. Vào **Actions → Deploy demo to GitHub Pages → Run workflow** nếu cần chạy lại sau khi bật Pages.
5. Link thường là `https://YOUR_ACCOUNT.github.io/YOUR_REPOSITORY/`; xem link chính xác trong job deploy.

Vite dùng `base: './'`; đường dẫn `#orders`, `#inventory`... không gây lỗi 404 khi tải lại. Quyền ghi Pages chỉ cấp cho job deploy. Không cần backend Node trên Pages.

Repository dự án là `TongDucDuy03/quanlycongty`, nguồn Pages là GitHub Actions. Xem trạng thái build/deploy tại tab Actions của repository.

## Kiểm tra

```sh
npm test
npm run build
npx playwright install chromium
npx playwright test
npm run verify:dist
```

Unit tests kiểm tra nghiệp vụ, lương, lưu trữ, bộ kết nối Sheets và Apps Script giả lập. Playwright kiểm tra desktop/điện thoại, gồm đăng nhập công ty, ghi nhớ phiên, đăng xuất, hết hạn phiên, tự lưu, mở lại trang, mất mạng, xung đột và bảo vệ biểu mẫu đang sửa; vẫn kiểm tra chế độ kết nối thủ công cũ trong bản phát triển. `verify:dist` kiểm tra bản build dưới đường dẫn repository và chụp ảnh sáng/tối. `verify:apps-script` kiểm tra mã triển khai khớp bộ kiểm tra nghiệp vụ. Bản kết nối Sheets trước đây đã xác nhận lưu/đọc với Google Apps Script thật; kết quả triển khai và xác minh phiên bản đăng nhập cố định được ghi riêng trong [biên bản kiểm tra](docs/VERIFICATION.md). Supabase thật chưa được kiểm thử.

## Tài liệu

- [Nghiên cứu và lựa chọn nền tảng](docs/RESEARCH.md)
- [Thiết lập Google Sheets và cách đồng bộ](docs/GOOGLE_SHEETS.md)
- [Kế hoạch triển khai và kịch bản demo](docs/IMPLEMENTATION_PLAN.md)
- [Cấu hình Supabase và kiểm tra quyền](docs/SUPABASE.md)
- [Nhân sự, công thức lương và quy trình chốt tháng](docs/PAYROLL.md)
- [Mô tả tính năng ngắn gọn](docs/FEATURES.md)
- [Schema Supabase](supabase/schema.sql)
- [Biên bản kiểm tra](docs/VERIFICATION.md)

Font Be Vietnam Pro tải từ Google Fonts, có font hệ thống thay thế khi mất mạng. Icon Lucide; không dùng ảnh/tài sản doanh nghiệp thật.
