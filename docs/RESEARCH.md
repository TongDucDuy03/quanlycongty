# Nghiên cứu: quản lý xưởng gia công cơ khí nhỏ

Ngày đối chiếu tài liệu: **22/10/2026**. Đây là nghiên cứu tài liệu và đề xuất sản phẩm, chưa phải kết quả phỏng vấn doanh nghiệp cụ thể. Chính sách và hạn mức dịch vụ có thể thay đổi.

**Cập nhật lựa chọn triển khai:** người dùng chọn Google Sheets trước. Đã bổ sung kết nối Apps Script dùng khóa riêng, ghi nhớ kết nối trên thiết bị và tự đồng bộ có kiểm tra phiên bản; xem [hướng dẫn hiện tại](GOOGLE_SHEETS.md). Phần so sánh và đề xuất Supabase bên dưới là nghiên cứu ban đầu, không phải yêu cầu phải dùng Supabase.

## 1. Kết luận triển khai

**Nên triển khai một web app gọn để demo và thử quy trình.** Trọng tâm là biết đơn nào sắp trễ, đang ở công đoạn nào, vật tư nào thiếu và khoản nào chưa thu. Không nên bắt đầu bằng một hệ thống ERP đầy đủ.

- **Demo:** giao diện React/TypeScript trên GitHub Pages, dữ liệu giả lập lưu ở trình duyệt, sáng/tối, dùng được trên điện thoại. Không cần tài khoản để người xem thử nhanh.
- **Dữ liệu dùng chung:** đề xuất **Supabase Free** để thử nghiệm có đăng nhập và phân quyền; Google Sheets phù hợp nhập/xuất và báo cáo phụ trợ.
- **Vận hành thật:** cần tài khoản dịch vụ do doanh nghiệp sở hữu, sao lưu, kiểm thử phân quyền và nền tảng hosting có điều khoản phù hợp. Không cam kết miễn phí vĩnh viễn hay luôn sẵn sàng.

GitHub Pages phục vụ website tĩnh. Tài liệu GitHub hạn chế việc dùng Pages để vận hành kinh doanh trực tuyến, hỗ trợ giao dịch thương mại hoặc SaaS thương mại, đồng thời khuyến cáo không dùng cho giao dịch nhạy cảm như gửi mật khẩu. Vì vậy bản Pages nên là **bản trình diễn bằng dữ liệu mẫu**; không mặc định dùng nó làm hệ thống nghiệp vụ chính thức. Đây là đánh giá thận trọng dựa trên điều khoản, không phải kết luận rằng mọi công cụ nội bộ đều bị cấm. [Giới hạn GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## 2. Nhu cầu và quy trình thực tế cần hỗ trợ

Giả định thiết kế ban đầu: xưởng 5–30 người, 2–8 người cập nhật đồng thời, gia công theo đơn, có tiện/phay/CNC/hàn hoặc gia công ngoài. Các con số này dùng để chọn độ phức tạp, chưa được xác nhận với khách hàng.

Luồng nghiệp vụ đề xuất:

**Yêu cầu + bản vẽ → báo giá → xác nhận đơn → chuẩn bị vật tư → gia công → kiểm tra → giao hàng → thu tiền.**

Các hệ thống sản xuất phổ biến tách lệnh sản xuất khỏi công việc tại từng máy/công đoạn, theo dõi thời gian và số lượng, có kiểm tra chất lượng và gia công ngoài. Điều này phù hợp để suy ra cấu trúc cho xưởng cơ khí; không phải bằng chứng khảo sát riêng doanh nghiệp Việt Nam. [ERPNext Manufacturing](https://docs.frappe.io/erpnext/manufacturing), [Job Card](https://docs.frappe.io/erpnext/job-card), [Odoo Work centers](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/advanced_configuration/using_work_centers.html)

| Người dùng | Câu hỏi thường ngày | Màn hình ưu tiên |
| --- | --- | --- |
| Chủ xưởng | Đơn nào trễ? Khách còn nợ bao nhiêu? | Tổng quan, công nợ |
| Điều phối / tổ trưởng | Hôm nay máy làm gì? Việc nào đang chờ? | Sản xuất, đơn hàng |
| Nhân viên bán hàng | Đã chốt giá chưa? Khi nào giao? | Đơn hàng, khách hàng |
| Kho | Thép, nhôm, inox nào sắp hết? | Vật tư |
| Thợ / QC | Gia công bản vẽ nào? Đạt bao nhiêu? | Chi tiết công việc, cập nhật tiến độ |

Những đặc thù cần đưa vào thiết kế dữ liệu thật:

1. **Bản vẽ có phiên bản:** mã chi tiết, vật liệu, kích thước, dung sai, phiên bản và ngày nhận. Tránh sản xuất theo file cũ.
2. **Nhiều công đoạn:** cắt phôi → tiện → phay → xử lý bề mặt → QC. Phân biệt chờ vật tư, chờ máy và đang làm.
3. **Đơn vị khác nhau:** vật tư kg/thanh/tấm, thành phẩm chiếc/bộ; quy đổi phải có quy tắc được duyệt.
4. **Hao hụt và hàng lỗi:** theo dõi số đạt, số hỏng, làm lại; không coi số đã gia công là số đủ điều kiện giao.
5. **Gia công ngoài:** mạ, nhiệt luyện, cắt laser; theo dõi nhà cung cấp, số lượng gửi/nhận và hạn trả. [ERPNext Subcontracting](https://docs.frappe.io/erpnext/subcontracting)
6. **Giao và thu nhiều lần:** tiền cọc, giao một phần, công nợ theo hạn. Bản demo chỉ mô phỏng quản trị, không thay kế toán hoặc hóa đơn điện tử.

Kiểm tra chất lượng có thể đặt ở đầu vào, công đoạn hoặc đầu ra; bản thật cần tiêu chí đo và người xác nhận. [ERPNext Quality Inspection](https://docs.frappe.io/erpnext/user/manual/en/quality-inspection)

## 3. Phạm vi MVP

| Phân hệ | Giá trị demo cần thấy | Phần để giai đoạn sau |
| --- | --- | --- |
| Tổng quan | Đơn đang chạy, đơn sắp giao, công nợ, cảnh báo vật tư | Lợi nhuận chính xác theo giá thành |
| Đơn hàng | Tìm/lọc, tạo đơn, trạng thái, số lượng, hạn giao, giá trị | Nhiều dòng chi tiết, duyệt báo giá, phiên bản bản vẽ |
| Sản xuất | Bảng công việc theo trạng thái, cập nhật tiến độ | Lịch năng lực máy, định mức, giờ máy, QC nhiều bước |
| Vật tư | Tồn hiện tại, mức tối thiểu, nhập/xuất cơ bản | Lô/heat number, giữ chỗ vật tư, giá vốn, kiểm kê |
| Khách hàng | Danh bạ và tổng hợp đơn | Hạn mức tín dụng, lịch sử chăm sóc |
| Công nợ | Giá trị đơn, đã thu, còn phải thu | Sổ thu nhiều lần, chứng từ, đối soát kế toán |
| Thiết lập | Sáng/tối, sao lưu/khôi phục, trạng thái lưu dữ liệu | Quản trị thành viên và quyền theo vai trò |

## 4. So sánh nơi lưu dữ liệu

| Tiêu chí | Google Sheets + API / Apps Script | Supabase Free | Dữ liệu trình duyệt |
| --- | --- | --- | --- |
| Khởi động | Quen thuộc, cần cấu hình Google/OAuth hoặc Apps Script | Cần tạo project, bảng, Auth, RLS | Mở app là dùng |
| Dùng nhiều thiết bị | Có, nếu làm lớp truy cập và xác thực đúng | Có, qua API với Auth/RLS | Không tự đồng bộ |
| Liên kết dữ liệu | Tự quản lý ID, kiểm tra và công thức | Quan hệ, ràng buộc, giao dịch PostgreSQL | Tự kiểm tra trong ứng dụng |
| Phân quyền | Quyền file; phân quyền nghiệp vụ cần tự xây | Chính sách theo dòng ở cơ sở dữ liệu | Không có bảo vệ nhiều người dùng |
| Ghi đồng thời | Cần xử lý khóa/xung đột ở lớp ứng dụng | Có công cụ database; vẫn cần version/transaction đúng | Dễ ghi đè giữa nhiều tab nếu không xử lý |
| Phù hợp | Quy trình rất nhỏ, báo cáo, nhập/xuất | Thử nghiệm hệ thống nghiệp vụ dùng chung | Trình diễn, thử giao diện |

**Hạn mức đối chiếu:** Sheets API mặc định 300 yêu cầu đọc và 300 ghi/phút/project; mỗi người dùng là 60 đọc và 60 ghi/phút/project. Cần gom yêu cầu và retry có backoff khi gặp 429. Một batch có tính nguyên tử, nhưng điều đó không tự giải quyết tranh chấp toàn bộ quy trình nhiều bước. [Google Sheets API limits](https://developers.google.com/workspace/sheets/api/limits)

Apps Script có hạn mức thời gian chạy và số lần chạy đồng thời; tài liệu hiện nêu 6 phút/lần và 30 lần đồng thời/người dùng. Chế độ “execute as me” chạy với quyền chủ script. Không coi URL khó đoán là xác thực, không đặt token bí mật trong frontend, và không công khai Sheet chứa công nợ. [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [Web apps](https://developers.google.com/apps-script/guides/web)

Supabase Free hiện công bố **500 MB database, 1 GB lưu file, 5 GB egress, 50.000 MAU, tối đa 2 project hoạt động**. Project ít hoạt động có thể bị tạm dừng sau khoảng một tuần; gói miễn phí không bao gồm automatic backups. Các mức này đủ để bắt đầu thử dữ liệu bảng nhỏ, nhưng bản vẽ/CAD và ảnh có thể dùng hết dung lượng nhanh. Tự sao lưu và thử khôi phục là bắt buộc khi dùng dữ liệu thật. [Supabase pricing](https://supabase.com/pricing), [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)

**Quyết định đề xuất:** demo dùng dữ liệu mẫu cục bộ; Supabase là hướng dùng chung; Sheets làm nơi xuất báo cáo. Nếu khách bắt buộc dùng Sheets, triển khai riêng adapter Google có OAuth và kiểm thử quyền, không dựng endpoint ghi công khai.

Bản tích hợp demo hiện giới hạn Supabase ở snapshot riêng của một tài khoản, tải/lưu thủ công có kiểm tra phiên bản. “Dùng chung” trong đề xuất là đích phát triển tiếp; hiện chưa có workspace nhiều nhân viên, vai trò hay đồng bộ thời gian thực. Không chia sẻ mật khẩu để thay cho phân quyền.

## 5. Bảo vệ và độ tin cậy của bản dùng thật

- Browser chỉ nhận URL project và **publishable key**. Không đưa secret key hoặc `service_role` vào mã, biến build công khai hay GitHub.
- Bật RLS trên toàn bộ bảng được expose. Mỗi bản ghi gắn doanh nghiệp/workspace; chính sách kiểm tra người dùng là thành viên hợp lệ. Đăng nhập thành công không đồng nghĩa được xem mọi dữ liệu. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Ghi nhận thu tiền và xuất kho bằng transaction phía database; chống nhấn lặp; không cho âm tồn hoặc thu vượt số còn phải thu nếu chưa có quy tắc nghiệp vụ.
- Ghi lịch sử sửa, người sửa, thời gian và phiên bản; báo xung đột khi hai người cùng cập nhật.
- Sao lưu định kỳ ngoài project, kiểm tra khôi phục, theo dõi dung lượng và lỗi. Không tự chuyển sang lưu cục bộ rồi báo “đã đồng bộ” khi cloud thất bại.

## 6. Những việc cần xác nhận tại buổi demo

1. Xưởng gia công chi tiết chính xác, kết cấu hàn hay cả hai? Có sản xuất lặp lại không?
2. Đang quản lý đơn, kho, công nợ ở đâu? Có thể cung cấp mẫu đã ẩn thông tin riêng để chuẩn hóa trường dữ liệu không?
3. Ai nhập tiến độ: thợ, tổ trưởng hay văn phòng? Có Internet ổn định tại xưởng không?
4. Một đơn gồm bao nhiêu chi tiết; giao nhiều lần; thu cọc; vật tư khách cấp hay xưởng mua?
5. Ai được xem giá bán, giá vốn và công nợ? Ai được sửa/xóa dữ liệu?
6. Chỉ số quyết định thành công: giảm quên đơn, giảm trễ, cập nhật nhanh hay thu nợ đúng hạn?

Các câu trả lời dùng để ưu tiên bản pilot; không cản trở xây dựng bản demo bằng giả định đã nêu.
