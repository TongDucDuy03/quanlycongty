# Nhân sự, chấm công và bảng lương

Phân hệ phục vụ bản demo xưởng nhỏ. Số liệu mẫu là giả định. Các hệ số được chủ xưởng cấu hình; phần mềm không tự quyết định nghĩa vụ bảo hiểm, thuế hay tính tuân thủ pháp luật.

## Quy trình sử dụng

1. Khai báo nhân viên, mã riêng, bộ phận, ngày bắt đầu/kết thúc làm việc, hình thức lương tháng/ngày/giờ, mức lương và cơ sở tính bảo hiểm.
2. Tạo loại phụ cấp theo tháng hoặc theo ngày thực làm; gán số tiền cụ thể cho từng nhân viên. Mức mặc định chỉ giúp điền ban đầu, không tự ghi đè thỏa thuận từng người.
3. Chọn ngày công chuẩn, giờ chuẩn/ngày, hệ số tăng ca theo ngày thường/ngày nghỉ/ngày lễ và tỷ lệ bảo hiểm phía nhân viên. Mặc định demo: 26 ngày, 8 giờ, hệ số 1,5 / 2 / 3 và bảo hiểm 0% để người dùng tự thiết lập.
4. Ghi công theo người/ngày: giờ làm thường, giờ nghỉ phép hưởng lương và các nhóm giờ tăng ca. Nhập lại cùng người/ngày sẽ cập nhật dòng cũ.
5. Ghi thưởng, tạm ứng, khấu trừ và thuế nhập thủ công theo người/tháng. Xem bảng tính, xuất CSV, rồi khóa tháng sau khi đối chiếu.

## Công thức

| Khoản | Cách tính |
|---|---|
| Ngày hưởng lương | (Giờ làm thường + giờ phép hưởng lương) / giờ chuẩn mỗi ngày |
| Ngày thực làm | Giờ làm thường / giờ chuẩn mỗi ngày; không gồm phép và tăng ca |
| Đơn giá giờ lương tháng | Lương tháng / ngày chuẩn / giờ chuẩn |
| Đơn giá giờ lương ngày | Lương ngày / giờ chuẩn |
| Đơn giá giờ lương giờ | Mức lương giờ đã khai báo |
| Lương công | Đơn giá giờ × (giờ làm thường + giờ phép hưởng lương) |
| Tăng ca | Đơn giá giờ × tổng (giờ từng nhóm tăng ca × hệ số nhóm) |
| Phụ cấp theo ngày | Mức phụ cấp của người đó × ngày thực làm |
| Phụ cấp cố định tháng | Toàn bộ mức khai báo nếu có ngày hưởng lương; 0 khi không có |
| Bảo hiểm nhân viên | Cơ sở bảo hiểm × tỷ lệ / 100, nếu có ngày hưởng lương |
| Tổng thu nhập | Lương công + tăng ca + phụ cấp + thưởng |
| Thực lĩnh | Tổng thu nhập − bảo hiểm − thuế − khấu trừ − tạm ứng |

Các khoản tiền thành phần được làm tròn đồng trước khi cộng; tổng phụ cấp là tổng từng loại đã làm tròn. Bảng lương không tự giới hạn số ngày hưởng lương bằng số ngày chuẩn. Ví dụ khai báo 27 ngày thực làm với ngày chuẩn 26 thì lương công bằng 27/26 lương tháng. Mức thực lĩnh âm vẫn hiển thị để đối chiếu, không tự chuyển thành 0 hoặc chuyển dư nợ sang tháng khác.

Giờ thường cộng giờ phép không vượt giờ chuẩn/ngày. Tổng tất cả nhóm giờ không quá 24 giờ/ngày. Chấm công phải nằm trong thời gian làm việc của nhân viên. Người đã nghỉ vẫn được tính ở tháng lịch sử trong thời gian làm việc.

## Khóa tháng và lịch sử

Khóa tháng lưu bản chụp tên/mã nhân viên, hình thức và mức lương, kết quả các khoản, giờ/ngày công và cấu hình áp dụng. Thay đổi hồ sơ, phụ cấp hoặc cấu hình sau đó không làm đổi kết quả đã khóa. Đọc kết quả trả về bản sao để tránh sửa nhầm bản chụp. Chấm công và điều chỉnh tiền của tháng đã khóa bị chặn; muốn chỉnh phải mở khóa và tính lại. Việc mở khóa dùng các mức lương/cấu hình hiện tại, do đó cần đối chiếu trước khi khóa lại.

Giảm giờ chuẩn không được làm sai dữ liệu chấm công của tháng còn mở; hệ thống báo lỗi để người dùng kiểm tra dữ liệu. Giờ công tháng đã khóa được kiểm tra theo cấu hình trong bản chụp tháng đó. Không thể mở khóa nếu cấu hình mới không tương thích với dữ liệu công cũ.

CSV có dấu BOM cho tiếng Việt và bảo vệ trường văn bản khỏi công thức bảng tính. File xuất gồm dữ liệu lương cá nhân; chỉ chia sẻ với người được phép xem. Sao lưu/khôi phục JSON bao gồm hồ sơ, công, phụ cấp, điều chỉnh và tháng đã khóa. Bản sao lưu cũ chưa có phân hệ lương vẫn đọc được; không tự chèn nhân viên mẫu vào dữ liệu cũ.

## Giới hạn demo

Chưa có máy chấm công, ca qua đêm, lịch ngày lễ tự động, công thức thuế lũy tiến, bảo hiểm phía doanh nghiệp, quản lý phép tích lũy, truy thu/truy lĩnh nhiều kỳ, phiếu lương riêng hay phê duyệt nhiều cấp. Phụ cấp cố định và cơ sở bảo hiểm áp dụng quy tắc đơn giản nêu trên, chưa xử lý mọi trường hợp làm nửa tháng/nghỉ dài ngày. Không có phân quyền riêng cho nhân sự hoặc nhật ký kiểm toán bất biến; người dùng chung dữ liệu có thể xem bảng lương. Cần bổ sung phân quyền trước khi dùng cho lương thực tế có nhiều tài khoản.
