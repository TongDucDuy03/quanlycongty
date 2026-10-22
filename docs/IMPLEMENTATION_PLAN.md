# Kế hoạch triển khai XưởngViệt

Ngày lập: **22/10/2026**. Xem cơ sở lựa chọn ở [RESEARCH.md](RESEARCH.md). Tài liệu này là kế hoạch và tiêu chí nghiệm thu, không phải tuyên bố mọi hạng mục đã hoàn tất; trạng thái bàn giao thực tế nằm trong README và kết quả kiểm tra.

**Bổ sung Google Sheets theo lựa chọn người dùng:** frontend tĩnh gọi Apps Script bằng POST có khóa riêng trong body; Sheet để riêng tư. Thứ tự triển khai: (1) backend khóa đọc/ghi và kiểm tra revision, (2) bộ kiểm tra nghiệp vụ dùng chung và lưu hai vùng luân phiên, (3) màn hình kết nối/tải/lưu và hướng dẫn, (4) kiểm thử auth, dữ liệu lương, xung đột, mạng lỗi và nhiều thiết bị bằng mô phỏng, (5) xuất bản frontend, (6) chủ tài khoản Google triển khai script rồi nghiệm thu kết nối thật. Các bước mã nguồn và kiểm thử mô phỏng đã triển khai; bước tài khoản Google cần URL deployment của người dùng. Xem [GOOGLE_SHEETS.md](GOOGLE_SHEETS.md).

## 1. Mục tiêu và kiến trúc

Tạo bản demo tiếng Việt có thể trình diễn ngay: giao diện dễ đọc, ít thao tác, responsive trên desktop/điện thoại, hai chế độ sáng/tối. Dữ liệu mẫu đủ thể hiện đơn sắp trễ, công việc đang làm, vật tư dưới ngưỡng và khoản chưa thu.

```text
GitHub Pages / máy phát triển
           |
       React + TypeScript + Vite
           |
      Lớp truy cập dữ liệu
       /                \
Demo localStorage    Supabase Auth + API + RLS
Dữ liệu mẫu          Tùy chọn khi đã cấu hình trên host phù hợp
```

Frontend tĩnh không giữ khóa quản trị. Chọn dữ liệu qua một adapter để không trộn logic nghiệp vụ với giao diện. Không dùng server Node chạy lâu dài trên GitHub Pages. Đường dẫn asset phải hoạt động khi deploy dưới `/ten-repository/`; điều hướng dùng hash hoặc trạng thái nội bộ để tránh 404 khi tải lại.

**Đối chiếu với bản demo đang xây dựng:** dữ liệu nghiệp vụ gồm `orders`, `customers`, `materials`, `movements`. Supabase hiện là một snapshot riêng cho mỗi tài khoản, tải/lưu thủ công và kiểm tra `revision`; chưa phải không gian chung nhiều nhân viên. Công nợ được tính từ tổng tiền đã thu trên đơn, chưa có hóa đơn, hạn thanh toán riêng, lịch sử phiếu thu hay sổ chi. Phần mô hình chuẩn hóa bên dưới là mục tiêu production. Xem [SUPABASE.md](SUPABASE.md) để biết hợp đồng tích hợp hiện tại.

## 2. Thứ tự thực hiện và điều kiện hoàn thành

| Bước | Công việc | Nghiệm thu |
| --- | --- | --- |
| 1. Khảo sát và quyết định | Nhu cầu, phạm vi, so sánh lưu trữ, giới hạn Pages | Có nghiên cứu nguồn chính thức và giả định rõ ràng |
| 2. Nền ứng dụng | React/TS, layout, màu, icon, seed, local persistence | Chạy cục bộ, không cấu hình vẫn có demo |
| 3. Luồng demo | Tổng quan, đơn, sản xuất, vật tư, khách hàng, công nợ | Số liệu liên thông; thao tác thay đổi dữ liệu thật của demo |
| 4. Khôi phục và tích hợp | Sao lưu/khôi phục, adapter cloud, schema/RLS mẫu, tài liệu cấu hình | Nhận biết rõ local/cloud; lỗi không báo lưu thành công giả |
| 5. QA độc lập | Build, nghiệp vụ, lưu dữ liệu, desktop/mobile, sáng/tối | Có bằng chứng kiểm tra và sửa lỗi ảnh hưởng demo |
| 6. Đóng gói GitHub Pages | Workflow, hướng dẫn repo, cách demo | Build artifact sẵn; deploy thực tế khi có repo/quyền phù hợp |
| 7. Pilot với xưởng | Làm sạch dữ liệu, xác nhận quyền, nghiệm thu cloud | Kiểm thử bằng hai tài khoản và hai thiết bị trước dùng thật |

Các bước 1–6 phục vụ lần bàn giao demo này. Bước 7 và các nghiệp vụ nâng cao là giai đoạn tiếp theo, cần tài khoản hạ tầng và quy tắc thực tế của doanh nghiệp.

## 3. Trải nghiệm giao diện

- Thanh điều hướng rõ: Tổng quan, Đơn hàng, Sản xuất, Vật tư, Khách hàng, Công nợ, Thiết lập.
- Desktop có sidebar, thẻ chỉ số, bảng và bộ lọc. Điện thoại có menu gọn, thẻ hoặc bảng cuộn trong vùng riêng, không tràn toàn trang.
- Màu trạng thái thống nhất: trung tính/chờ, xanh/đang làm, xanh lá/hoàn thành, cam/cảnh báo, đỏ/quá hạn. Luôn kèm nhãn chữ để không chỉ dựa vào màu.
- Nút thao tác đủ lớn để chạm; biểu mẫu có label, lỗi cạnh trường, đóng bằng Escape, thao tác bàn phím được.
- Ngày theo định dạng Việt Nam; tiền VND; phân biệt hạn giao và hạn thanh toán. Lưu lựa chọn giao diện qua lần tải lại.
- Hiển thị rõ “Dữ liệu demo trên thiết bị này” hoặc trạng thái cloud thực tế. Không hiển thị “đã đồng bộ” chỉ vì localStorage ghi thành công.

## 4. Mô hình nghiệp vụ

Đối tượng MVP: khách hàng, đơn hàng, công việc sản xuất, vật tư, khoản phải thu và lịch sử hoạt động. Bản demo có thể dùng mô hình gọn; mô hình production cần chuẩn hóa như sau:

| Bảng | Dữ liệu chính | Ràng buộc cần có |
| --- | --- | --- |
| organizations, memberships | Doanh nghiệp, người dùng, vai trò | Mỗi truy cập kiểm tra membership |
| customers | Mã, tên, liên hệ, địa chỉ | Mã duy nhất trong doanh nghiệp |
| orders, order_items | Khách, mã đơn, chi tiết, SL, giá, hạn giao | ID liên kết hợp lệ, SL > 0, giá >= 0 |
| operations | Đơn/chi tiết, công đoạn, máy, số đạt, trạng thái | Số đạt không vượt SL; kiểm tra bước trước |
| materials, stock_movements | Mã, đơn vị, tồn, mức tối thiểu, nhập/xuất | Xuất kho nguyên tử; không âm tồn ngoài quy tắc |
| invoices, payments | Khoản phải thu, hạn, số tiền và ngày thu | Chống ghi lặp; không thu vượt nếu chưa hỗ trợ dư tiền |
| audit_logs | Người sửa, thao tác, thời điểm, đối tượng | Người dùng không tự sửa lịch sử |

Mọi bảng nghiệp vụ cần `organization_id`, ID ổn định, thời điểm cập nhật; dữ liệu có tranh chấp cần version. Phân quyền production đề xuất: chủ xưởng toàn quyền, điều phối quản lý đơn/sản xuất, kho quản lý vật tư, kế toán công nợ, thợ chỉ cập nhật công việc được giao. Đây là mục tiêu production, không phải tính năng đã xác nhận của demo.

Các quy tắc cần thống nhất:

1. **Đang thực hiện** không bao gồm đơn đã giao hoặc hủy.
2. **Quá hạn giao** là hạn giao trước ngày hiện tại và đơn chưa hoàn tất giao; múi giờ doanh nghiệp là Asia/Ho_Chi_Minh.
3. **Còn phải thu** = giá trị phải thu − tổng thu hợp lệ. Không gọi giá trị đơn chưa giao là doanh thu đã ghi nhận.
4. **Thiếu vật tư** ở MVP = tồn dưới mức tối thiểu; chưa phải tính đủ/thiếu theo BOM của từng đơn.
5. Hoàn thành một công đoạn không tự đánh dấu đơn đã giao hoặc đã thanh toán.

## 5. Kịch bản demo 5–7 phút

1. Mở Tổng quan, chỉ ra đơn cần chú ý và vật tư dưới ngưỡng.
2. Tạo một đơn thử với khách, sản phẩm, số lượng, giá và hạn giao.
3. Tìm lại đơn, xem hoặc cập nhật trạng thái/tiến độ tại Sản xuất.
4. Nhập bổ sung vật tư đang thiếu và quan sát cảnh báo thay đổi.
5. Xem công nợ, ghi nhận một khoản thu thử và kiểm tra số còn lại.
6. Chuyển sáng/tối; mở cùng giao diện kích thước điện thoại.
7. Tải lại trang để chứng minh dữ liệu vẫn được lưu; xuất bản sao rồi giải thích demo cục bộ không tự đồng bộ giữa máy.

Tên khách, số điện thoại và nghiệp vụ mẫu phải là dữ liệu giả. Không nhập dữ liệu tài chính hoặc bản vẽ bí mật vào demo công khai.

## 6. Kiểm tra trước bàn giao

- Build TypeScript và Vite thành công; kiểm tra asset dưới đường dẫn project Pages.
- Tạo đơn, lọc/tìm kiếm, tiến độ, nhập/xuất kho và ghi nhận thu hoạt động với dữ liệu hợp lệ; dữ liệu âm/vượt giới hạn bị chặn.
- Sau reload, thao tác demo còn tồn tại; reset cần xác nhận rõ; restore không làm mất dữ liệu khi file hỏng.
- Đối chiếu KPI với dữ liệu danh sách, công nợ với số tiền còn lại; trạng thái hoàn tất không bị tính trễ.
- Kiểm tra desktop và điện thoại ở cả hai theme; không cắt nội dung chính; modal và menu dùng được.
- Kiểm thử cloud thật chỉ khi có project: anon bị từ chối, tài khoản ngoài doanh nghiệp bị từ chối, người được cấp quyền đọc/ghi đúng phạm vi. Có schema không thay cho bằng chứng kiểm thử này.

## 7. Sau demo: lộ trình pilot

**Đợt A — chuẩn hóa:** chọn 10–20 đơn đã ẩn dữ liệu nhạy cảm để đối chiếu trường và quy trình; chốt người chịu trách nhiệm nhập liệu và chỉ số thành công.

**Đợt B — dùng chung:** doanh nghiệp tạo Supabase, kiểm thử RLS, sao lưu/khôi phục, cấu hình host phù hợp điều khoản. Nếu vẫn chọn Sheets, thay adapter bằng Google OAuth/API với quyền và xử lý xung đột được kiểm thử.

**Đợt C — sát xưởng:** bổ sung phiên bản bản vẽ, nhiều chi tiết/đơn, QC, lịch máy, gia công ngoài, giao/thu nhiều lần, tồn theo lô và nhật ký sửa. Ưu tiên theo dữ liệu pilot.

**Đợt D — vận hành:** đào tạo ngắn theo vai trò, chuyển dữ liệu có kiểm tra tổng, thống nhất lịch sao lưu, người hỗ trợ và ngân sách nếu vượt quota. Chỉ thêm offline/PWA khi đã có thiết kế hàng đợi và giải quyết xung đột; responsive không đồng nghĩa đồng bộ offline.


## 8. Mở rộng nhân sự và lương (22/10/2026)

Yêu cầu bổ sung: hồ sơ công nhân, lương riêng từng người, danh mục phụ cấp, cấu hình chỉ số tính lương, chấm công và bảng lương tháng. Phân hệ nằm trong mục **Nhân sự & tiền lương**, gồm bốn tab: nhân sự, chấm công, bảng lương và cấu hình.

- Giữ tương thích dữ liệu v1: trường `payroll` là tùy chọn; bản sao cũ giữ nguyên đơn/kho/khách và bắt đầu với nhân sự trống.
- Tách tính lương thành hàm thuần có kiểm thử; hỗ trợ lương tháng/ngày/giờ, phép hưởng lương, ba nhóm tăng ca, phụ cấp cố định/ngày thực làm, khoản cộng/trừ tháng.
- Chốt kỳ lưu snapshot; mở lại phải xác nhận, không tự sửa tháng cũ khi mức lương/cấu hình mới thay đổi.
- Kiểm thử các lỗi phần trăm, công trùng, dữ liệu nhập, ngày làm việc, khóa kỳ, lịch sử và thực lĩnh âm.
- Đặt bản bàn giao ở `D:\quản lý công ty`, đẩy toàn bộ nguồn lên `TongDucDuy03/quanlycongty`, dùng workflow Pages cho demo.

Công thức và giới hạn chi tiết: [PAYROLL.md](PAYROLL.md). Mô tả tính năng để gửi người xem demo: [FEATURES.md](FEATURES.md). Dữ liệu lương thật cần lưu trữ có xác thực và phân quyền trước khi đưa vào sử dụng nhiều người.
