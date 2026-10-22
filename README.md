# XưởngViệt

Demo quản lý doanh nghiệp gia công cơ khí nhỏ, bằng tiếng Việt. React 19 + TypeScript + Vite, chạy trên GitHub Pages dưới dạng trang tĩnh. Có đơn hàng, sản xuất, kho, công nợ, nhân sự, chấm công, tính lương, chế độ sáng/tối và giao diện điện thoại.

Repository: [TongDucDuy03/quanlycongty](https://github.com/TongDucDuy03/quanlycongty). Địa chỉ Pages: [tongducduy03.github.io/quanlycongty](https://tongducduy03.github.io/quanlycongty/). Xem [mô tả tính năng ngắn gọn](docs/FEATURES.md).

## Chạy ngay

Yêu cầu Node.js 22.12+ (hoặc bản LTS mới tương thích Vite).

```sh
npm ci
npm run dev
```

Mở địa chỉ Vite in ra, thường là `http://localhost:5173`. Trình duyệt hiện đại có hỗ trợ ES2022 và native dialog. Không cần Google/Supabase để demo.

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
- **Dữ liệu:** CSV để mở trong Sheets/Excel, sao lưu/khôi phục JSON được kiểm tra, đặt lại dữ liệu mẫu có xác nhận.
- **Supabase tùy chọn:** đăng nhập một chủ xưởng, tải/lưu snapshot thủ công, owner-only RLS và kiểm tra revision chống ghi đè cloud. Cần cấu hình và kiểm thử trên tài khoản thật.

Các nút thao tác cập nhật dữ liệu thực trong demo. Số phần trăm ở danh sách đơn phản ánh **mốc công đoạn**, còn số chi tiết hoàn thành theo dõi riêng ở chi tiết/bảng sản xuất. Kho chưa tự trừ theo định mức đơn hàng. Một đơn hiện có một dòng chi tiết. Tên, thông tin liên hệ và số liệu seed là giả lập.

Đây chưa phải ERP/kế toán hoàn chỉnh: chưa có phân quyền nhân viên, lịch máy hữu hạn, QC theo tiêu chí, xuất PDF báo giá, tệp bản vẽ, gia công ngoài, hóa đơn VAT, nhật ký phiếu thu, sổ chi, giá thành hoặc lợi nhuận. Responsive không đồng nghĩa app offline/PWA.

## Lưu dữ liệu: đề xuất

**Demo:** localStorage, không mất tiền/không cần tài khoản; không tự đồng bộ giữa điện thoại và máy tính. Nên xuất JSON trước khi xóa bộ nhớ trình duyệt. JSON khôi phục đầy đủ; CSV chỉ là danh sách đơn hàng.

**Thử dữ liệu thật:** đề xuất Supabase Free hơn Sheets vì có Auth, PostgreSQL và Row Level Security. Bản tích hợp hiện là kho riêng một tài khoản, dùng cùng tài khoản trên nhiều thiết bị; không phải hệ thống nhân viên phân quyền. Đồng bộ cần bấm tải/lưu, chưa realtime. Hướng dẫn tại [docs/SUPABASE.md](docs/SUPABASE.md).

Google Sheets quen thuộc nhưng frontend công khai không được chứa service-account/private key. Một kết nối ghi an toàn cần OAuth/quyền truy cập và xử lý ghi đồng thời; endpoint Apps Script công khai không phải giải pháp bảo mật. Nghiên cứu, so sánh và nguồn chính thức tại [docs/RESEARCH.md](docs/RESEARCH.md).

## Đưa demo lên GitHub Pages

GitHub Pages chỉ dùng cho **demo dữ liệu giả** trong cấu hình này. Workflow ép `VITE_DEMO_ONLY=true`, kể cả khi Pages dùng tên miền riêng. Không thêm khóa hoặc mật khẩu vào GitHub repository. Chính sách Pages có giới hạn cho kinh doanh/giao dịch nhạy cảm; đọc [nghiên cứu](docs/RESEARCH.md) trước khi chọn hosting vận hành thật.

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

Chưa có repository đích hoặc phiên đăng nhập GitHub trong môi trường bàn giao, nên chưa có URL Pages đã xuất bản. Workflow và mã nguồn đã chuẩn bị để đẩy lên.

## Kiểm tra

```sh
npm test
npm run build
npx playwright install chromium
npx playwright test
npm run verify:dist
```

19 unit tests kiểm tra tiền, hạn giao, dữ liệu nhập, kho, UUID qua HTTP LAN và lưu trữ. 16 Playwright cases kiểm tra luồng dùng thật trên desktop/điện thoại. `verify:dist` kiểm tra bản build dưới đường dẫn repository và chụp bốn ảnh preview. Các kiểm tra cloud/RLS trên Supabase thật cần tài khoản hạ tầng riêng, không được xem là đã chạy chỉ vì có schema SQL.

## Tài liệu

- [Nghiên cứu và lựa chọn nền tảng](docs/RESEARCH.md)
- [Kế hoạch triển khai và kịch bản demo](docs/IMPLEMENTATION_PLAN.md)
- [Cấu hình Supabase và kiểm tra quyền](docs/SUPABASE.md)
- [Nhân sự, công thức lương và quy trình chốt tháng](docs/PAYROLL.md)
- [Mô tả tính năng ngắn gọn](docs/FEATURES.md)
- [Schema Supabase](supabase/schema.sql)
- [Biên bản kiểm tra](docs/VERIFICATION.md)

Font Be Vietnam Pro tải từ Google Fonts, có font hệ thống thay thế khi mất mạng. Icon Lucide; không dùng ảnh/tài sản doanh nghiệp thật.
