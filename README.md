# XưởngViệt

Demo website giới thiệu và quản lý doanh nghiệp gia công cơ khí nhỏ, bằng tiếng Việt. React 19 + TypeScript + Vite, chạy trên GitHub Pages dưới dạng trang tĩnh. Khách truy cập xem giới thiệu, sản phẩm và dịch vụ; khu quản lý đăng nhập riêng có đơn hàng, sản xuất, kho, công nợ, chứng từ PDF, nhân sự, chấm công và tính lương. Giao diện hỗ trợ điện thoại, khu quản lý có chế độ sáng/tối.

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

## Trang công khai và khu quản lý

Trong bản có cấu hình công ty, đường link gốc mở website công khai. `#home`, `#products`, `#contact` dẫn tới giới thiệu, danh mục và liên hệ. Chọn **Đăng nhập quản lý** (`#admin`) để vào khu quản lý; các đường dẫn cũ như `#orders` và `#settings` vẫn yêu cầu đăng nhập. Bản phát triển không có endpoint giữ trang gốc là demo quản lý; mở `#home` để xem website mẫu.

Khi doanh nghiệp chưa xuất bản nội dung, website hiển thị mẫu có nhãn minh họa; không tự tạo địa chỉ, số điện thoại hay email doanh nghiệp. Thông tin nhân sự, lương, khách hàng, đơn hàng và ngân hàng không tự xuất hiện trên trang công khai.

Để cập nhật website: vào **Trang giới thiệu** (`#website`), điền hồ sơ công khai, thêm sản phẩm/dịch vụ và chọn các mục muốn hiển thị. Bấm **Lưu bản nháp website**, chờ trạng thái **Đã đồng bộ**, rồi bấm **Xuất bản website**. Xem trước bản nháp không làm thay đổi trang khách đang xem. Xuất bản chỉ lấy các trường công khai đã cho phép từ bản dữ liệu đã đồng bộ; chế độ demo cục bộ chỉ hỗ trợ xem trước.

Trình biên tập cho phép thay logo, màu thương hiệu, ảnh bìa, bài giới thiệu, năng lực, giờ làm việc và liên kết Zalo/bản đồ; bật/tắt sáu phần giới thiệu, năng lực, sản phẩm, hình ảnh công việc, quy trình và liên hệ. Có thể thêm, nhân bản, ẩn và sắp xếp tối đa 100 sản phẩm, mỗi sản phẩm tối đa 6 ảnh; ảnh đầu tiên là ảnh bìa. Phần hình ảnh công việc có tối đa 12 mục kèm tiêu đề và mô tả. Sau khi triển khai phiên bản hỗ trợ trình biên tập, các cập nhật nội dung này thực hiện trong ứng dụng, không phải sửa code hay triển khai lại GitHub Pages.

Tải ảnh trực tiếp từ máy tính/điện thoại hoặc chọn lại trong thư viện. Đầu vào JPG/PNG/WebP tối đa 10 MiB và 40 triệu điểm ảnh; ứng dụng chuyển thành JPEG tối đa 160 KiB, cạnh dài tối đa 1600 px, nền trong suốt thành trắng. Thư viện công ty lưu riêng trong Sheet, tối đa 80 ảnh hoặc 12 MiB; ảnh chưa xuất bản cần phiên quản lý để đọc. **Bỏ ảnh** chỉ gỡ khỏi vị trí đang sửa. Muốn xóa hẳn, bỏ các chỗ dùng ảnh, lưu và đồng bộ, xuất bản lại nếu cần, rồi xóa trong thư viện. Máy chủ chặn xóa ảnh còn được bản nháp đã lưu hoặc bản công khai tham chiếu.

Biểu mẫu **Soạn email báo giá** mở ứng dụng email của khách. Khách kiểm tra nội dung, đính kèm bản vẽ và tự gửi; website chưa lưu yêu cầu vào hộp thư quản lý và không tự gửi email. Nút này cần email doanh nghiệp đã được cấu hình, xuất bản.

## Các luồng đã xây

- **Tổng quan:** đơn đang mở, giá trị đơn, tiền còn phải thu, đơn trễ, phân bố công đoạn và vật tư cần bổ sung.
- **Đơn hàng:** thêm, chỉnh sửa, chi tiết, tìm kiếm không dấu, lọc công đoạn/trễ hạn. Ghi mã bản vẽ/phiên bản, vật liệu, máy và người phụ trách.
- **Sản xuất:** bảng công đoạn chờ → gia công → QC → sẵn sàng giao → đã giao; cập nhật số chi tiết hoàn thành.
- **Kho:** tồn, ngưỡng tối thiểu, nhập/xuất có ghi chú và lịch sử; chặn xuất quá tồn.
- **Khách hàng:** danh bạ, thêm khách, xem các đơn liên quan.
- **Công nợ & phiếu thu:** giá trị đơn, tổng đã thu, số còn phải thu; mỗi lần thu tạo phiếu có ngày, phương thức, mã giao dịch và ghi chú. Chặn thu quá số còn lại; hủy phiếu có lý do sẽ hoàn lại công nợ tương ứng. Tiền đã thu trước khi nâng cấp được giữ là số dư đầu kỳ, không dựng phiếu lịch sử giả.
- **Bán hàng & chứng từ:** lập báo giá, đề nghị thanh toán, phiếu giao hàng và phiếu thu từ một đơn có sẵn. Lưu hồ sơ đơn vị, thông tin ngân hàng; xem/lọc lịch sử, tải PDF tiếng Việt, in A4 hoặc tải bản HTML độc lập. Chứng từ giữ bản thông tin tại lúc lập, không tự đổi theo hồ sơ/đơn hàng được sửa sau đó.
- **Website công khai:** logo/màu thương hiệu, giới thiệu doanh nghiệp, năng lực, danh mục nhiều ảnh, bộ lọc nhóm, hình ảnh công việc và liên hệ báo giá. Tự sửa nội dung, tải ảnh, chọn bố cục và xem trước trong `#website`; lưu nháp riêng trước khi xuất bản.
- **Nhân sự:** thêm/sửa hồ sơ, bộ phận, ngày vào/nghỉ, lương tháng/ngày/giờ, cơ sở bảo hiểm và phụ cấp từng người.
- **Chấm công:** theo người/ngày, giờ thường, phép hưởng lương và tăng ca theo ba nhóm ngày; tổng hợp tháng, không tính trùng một người/ngày.
- **Cấu hình lương:** ngày công chuẩn, giờ/ngày, hệ số tăng ca, tỷ lệ bảo hiểm, danh mục phụ cấp và mức mặc định.
- **Bảng lương:** công thức thu nhập/thực lĩnh rõ ràng; thưởng, tạm ứng, khấu trừ, thuế nhập tay; chi tiết lương, CSV, chốt tháng giữ nguyên lịch sử và mở lại có xác nhận.
- **Dữ liệu:** CSV để mở trong Sheets/Excel, sao lưu/khôi phục JSON được kiểm tra. Bản khôi phục không được xóa/sửa lịch sử chứng từ hoặc số dư đầu kỳ đã có; điều chỉnh phiếu bằng thao tác hủy có lý do. Chế độ cục bộ chỉ hiện nút đặt lại dữ liệu mẫu trước khi bắt đầu lưu phần bán hàng/chứng từ. Khi xử lý xung đột đồng bộ, người dùng vẫn có thể sao lưu rồi nhận bản chính thức từ Google.
- **Google Sheets công ty:** cấu hình Sheet một lần cho hệ thống. Máy tính và điện thoại mở cùng đường link, đăng nhập tài khoản quản lý để nhận cùng dữ liệu; không nhập URL hoặc khóa kết nối trên từng thiết bị. Tự lưu sau thay đổi, kiểm tra dữ liệu mới khi quay lại ứng dụng và chống ghi đè giữa các thiết bị. Giữ đầy đủ chấm công, kỳ lương đã chốt và các tab báo cáo để xem. Người triển khai thiết lập theo [hướng dẫn](docs/GOOGLE_SHEETS.md).
- **Supabase tùy chọn:** giữ bộ kết nối cũ cho môi trường đã cấu hình; không cần dùng khi chọn Google Sheets.

Các nút thao tác cập nhật dữ liệu thực trong demo. Số phần trăm ở danh sách đơn phản ánh **mốc công đoạn**, còn số chi tiết hoàn thành theo dõi riêng ở chi tiết/bảng sản xuất. Kho chưa tự trừ theo định mức đơn hàng. Một đơn hiện có một dòng chi tiết. Tên, thông tin liên hệ và số liệu seed là giả lập.

Đây chưa phải ERP/kế toán hoàn chỉnh: chưa có phân quyền nhân viên, lịch máy hữu hạn, QC theo tiêu chí, tải/lưu tệp bản vẽ, gia công ngoài, hóa đơn VAT, sổ chi, giá thành hoặc lợi nhuận. Chứng từ là bản thương mại nội bộ, **không phải hóa đơn giá trị gia tăng**. Chưa có giỏ hàng, thanh toán trực tuyến hoặc hộp thư nhận yêu cầu báo giá phía máy chủ. Responsive không đồng nghĩa app offline/PWA.

## Lập và tải chứng từ

1. Vào **Bán hàng & chứng từ → Thông tin xuất chứng từ**, lưu tên doanh nghiệp và thông tin pháp lý/ngân hàng cần đưa lên bản in. Bộ hồ sơ này tách riêng thông tin website công khai.
2. Chọn **Lập chứng từ**, chọn đơn hàng, loại phiếu và ngày lập. Có thể mở nhanh báo giá, phiếu giao hàng hoặc đề nghị thanh toán ngay từ chi tiết đơn; nút thu tiền hiện hữu cũng tạo phiếu thu.
3. Nhập số tiền hoặc số lượng giao phù hợp, điều kiện và ghi chú cần gửi cho khách. **Phiếu thu** ghi nhận tiền thực nhận và giảm công nợ. **Đề nghị thanh toán** và **báo giá** không ghi nhận thu tiền. **Phiếu giao hàng** giới hạn tổng lượng giao theo các phiếu còn hiệu lực nhưng không tự cập nhật sản xuất hoặc xuất kho.
4. Chọn chứng từ đã lưu để **Tải PDF**, **In / Lưu PDF** hoặc **Tải bản HTML**. PDF dùng chữ tiếng Việt có thể chọn/copy, phông Noto Sans được nhúng; font chỉ tải khi tạo PDF. HTML độc lập là định dạng riêng, không phải PDF.

Mỗi chứng từ hiện gắn với một đơn và một dòng chi tiết. Khách hàng, hồ sơ doanh nghiệp, hàng hóa và số tiền trên chứng từ được chụp lại khi lập. Phiếu sai được đánh dấu hủy có lý do, giữ trong lịch sử; không xóa hoặc sửa nội dung phiếu đã phát hành. Phiếu thu ghi rõ tiền đã thu trước phiếu, tiền thu lần này và số còn lại theo thời điểm lập.

## Lưu dữ liệu bằng Google Sheets

**Demo cục bộ khi không cấu hình endpoint công ty:** dữ liệu nghiệp vụ trong localStorage, ảnh tải lên trong IndexedDB của trình duyệt; không mất tiền/không cần tài khoản và không tự đồng bộ giữa điện thoại và máy tính. Nên xuất JSON trước khi xóa bộ nhớ trình duyệt. JSON chứa dữ liệu và tham chiếu ảnh, không chứa tệp ảnh; giữ ảnh gốc riêng vì xóa dữ liệu trình duyệt cũng xóa thư viện ảnh demo. CSV xuất riêng danh sách đơn hàng hoặc bảng lương của tháng được chọn.

**Lựa chọn hiện tại: Google Sheets + Apps Script với cấu hình công ty cố định.** Người triển khai chuẩn bị Sheet, Apps Script, tài khoản quản lý và đặt URL `/exec` công khai trong `VITE_COMPANY_ENDPOINT` khi build. Mật khẩu và khóa quản trị không đưa vào mã nguồn hay cấu hình build. Không cần Supabase hoặc thẻ thanh toán. Người dùng mở cùng đường link trên máy tính/điện thoại rồi đăng nhập; không cần thiết lập Google Sheet riêng cho từng thiết bị.

Đổi mật khẩu tại **Cài đặt & dữ liệu → Tài khoản công ty → Đổi mật khẩu**, bằng mật khẩu hiện tại và mật khẩu mới xác nhận hai lần. Sau khi đổi, đăng nhập lại trên các thiết bị; dữ liệu đang chờ đồng bộ vẫn được giữ.

Phiên đăng nhập có thời hạn 30 ngày. Chọn ghi nhớ trên thiết bị cá nhân để tự kết nối khi mở lại; bỏ chọn để chỉ lưu phiên trong tab hiện tại. Khi hết hạn, đăng nhập lại và tiếp tục đồng bộ các thay đổi còn giữ trên máy. Ứng dụng xác thực với máy chủ trước khi hiển thị dữ liệu khi mở lại, nên bước này cần có mạng. Đăng xuất xóa phiên và bản lưu công ty trên thiết bị; nếu có thay đổi chưa đồng bộ, ứng dụng hỏi xác nhận và tải bản sao JSON trước khi xóa. Mật khẩu/phiên không nằm trong bản sao JSON. Tài khoản quản lý dùng chung có quyền đọc/ghi toàn bộ dữ liệu, gồm lương; chưa có tài khoản hoặc phân quyền riêng từng nhân viên.

Đồng bộ tự động sau thay đổi, có khóa phía máy chủ và kiểm tra revision. Thay đổi lưu cục bộ trước; chờ trạng thái đã đồng bộ trước khi đóng trang. Khi mất mạng, ứng dụng đối chiếu lại bản Google trước khi gửi tiếp. Khi hai thiết bị cùng sửa, tự lưu tạm dừng để người dùng xử lý xung đột; không tự gộp dữ liệu. Giới hạn pilot 2 MiB JSON mỗi snapshot; không lưu ảnh/bản vẽ trong snapshot. Sửa dữ liệu trong ứng dụng, không sửa trực tiếp tab báo cáo để nhập ngược. Hướng dẫn: [docs/GOOGLE_SHEETS.md](docs/GOOGLE_SHEETS.md).

Bản công khai giới hạn 256 KiB; ảnh JPEG được lưu trong vùng riêng của Sheet với hạn mức thư viện nêu trên. Bản sao JSON chỉ chứa tham chiếu đến ảnh, nên cần giữ ảnh gốc và sao lưu cả Sheet nếu muốn bảo toàn thư viện khi chuyển hệ thống. PDF được tạo để tải về; bản vẽ chưa có chức năng tải/lưu trong ứng dụng.

Bộ kết nối Supabase trước đây vẫn có trong mã nguồn, xem [docs/SUPABASE.md](docs/SUPABASE.md); đây là lựa chọn thay thế, không cần cấu hình cho Google Sheets.

## Đưa demo lên GitHub Pages

GitHub Pages dùng cho **demo dữ liệu giả và trình diễn website**, có thể kết nối một Google Sheet demo để thử đồng bộ. Đây không phải cấu hình vận hành thương mại điện tử, nhận thanh toán hoặc giao dịch nhạy cảm. Workflow đặt `VITE_DEMO_ONLY=true` để tắt bộ kết nối Supabase và giao diện nhắc dùng dữ liệu giả. `VITE_COMPANY_ENDPOINT` bật khu quản lý đăng nhập và kết nối Sheet cố định; `VITE_COMPANY_NAME` đặt tên hiển thị trên màn hình đăng nhập. Đây đều là cấu hình công khai, không phải nơi lưu bí mật. Không thêm khóa hoặc mật khẩu vào GitHub repository. Chính sách Pages có giới hạn cho kinh doanh/giao dịch nhạy cảm; đọc [nghiên cứu](docs/RESEARCH.md) trước khi chọn hosting vận hành thật.

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

Font giao diện Be Vietnam Pro tải từ Google Fonts, có font hệ thống thay thế khi mất mạng. PDF dùng Noto Sans Regular/Bold trong `public/fonts`, kèm giấy phép OFL. Icon Lucide; nội dung và hình minh họa mẫu không đại diện cho doanh nghiệp thật. Khi nhập ảnh riêng lên website, chỉ dùng nội dung được phép công khai.
