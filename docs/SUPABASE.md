# Dữ liệu đám mây với Supabase

Ứng dụng chạy ngay bằng dữ liệu mẫu lưu trong trình duyệt. Chế độ này phục vụ demo, không chia sẻ dữ liệu giữa điện thoại và máy tính. Xóa dữ liệu trình duyệt sẽ xóa bản lưu cục bộ; nên xuất JSON để sao lưu trước khi đổi thiết bị.

Supabase là lựa chọn đám mây được đề xuất vì có PostgreSQL, đăng nhập và quyền truy cập ở cơ sở dữ liệu. Bản tích hợp này lưu **một không gian riêng cho mỗi tài khoản**. Cùng tài khoản có thể tải/lưu dữ liệu từ nhiều thiết bị, nhưng chưa có không gian chung cho nhiều nhân viên, phân quyền theo chức vụ, nhật ký kiểm toán hay đồng bộ thời gian thực. Không chia sẻ mật khẩu để thay thế tính năng cộng tác.

## Chọn nơi chạy

- **GitHub Pages:** dùng demo với dữ liệu giả và lưu cục bộ. Tài liệu GitHub không cho dùng Pages làm dịch vụ hosting miễn phí để vận hành online business/commercial SaaS và khuyến cáo không dùng giao dịch nhạy cảm như gửi mật khẩu. Vì vậy không dùng bản Pages để đăng nhập hay vận hành dữ liệu doanh nghiệp thật.
- **Máy phát triển hoặc hosting phù hợp:** có thể cấu hình Supabase để thử kết nối. Khi đưa vào vận hành, chọn hosting có điều khoản phù hợp, HTTPS và cấu hình tên miền/đăng nhập; ví dụ đánh giá Cloudflare Pages cho frontend static trước khi triển khai chính thức.

## Thiết lập

1. Tạo project tại [Supabase](https://supabase.com/), chọn khu vực phù hợp và lưu mật khẩu database trong trình quản lý mật khẩu riêng.
2. Mở **SQL Editor**, chạy toàn bộ [`supabase/schema.sql`](../supabase/schema.sql). Script tạo bảng `public.workshop_snapshots`, bật Row Level Security (RLS), chỉ cấp quyền đọc/thêm/cập nhật cho tài khoản đã đăng nhập và chỉ trên dòng của chính tài khoản đó. Người chưa đăng nhập không được truy cập bảng.
3. Trong **Authentication → Users**, tạo tài khoản thử nghiệm có email/mật khẩu. Bản demo không cung cấp đăng ký công khai. Nếu dùng chức năng xác nhận email hoặc đặt lại mật khẩu của Supabase sau này, cấu hình Site URL và Redirect URLs đúng hostname của ứng dụng. Có thể tắt cho phép người dùng tự đăng ký nếu chỉ quản trị viên tạo tài khoản.
4. Trong **Connect** hoặc phần API Keys, lấy Project URL và **publishable key** (`sb_publishable_...`). Legacy `anon` key cũng dùng được với Supabase JS hiện tại, nhưng tài liệu Supabase khuyến nghị publishable key cho ứng dụng mới. Không lấy `service_role`, `sb_secret_...` hoặc mật khẩu database.
5. Sao chép `.env.example` thành `.env.local`, điền:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_YOUR_PUBLIC_KEY
   ```

   Tên biến `ANON_KEY` là tên cấu hình của ứng dụng; giá trị có thể là publishable key mới. Các biến có tiền tố `VITE_` xuất hiện trong JavaScript gửi đến trình duyệt. Publishable key được thiết kế cho trường hợp này; bảo vệ dữ liệu dựa vào đăng nhập, grants và RLS, không dựa vào việc giấu key.
6. Khởi động lại dev server (`npm run dev`) hoặc build lại (`npm run build`). Mở phần dữ liệu/cài đặt, đăng nhập bằng tài khoản thử nghiệm. Chỉ khởi tạo dữ liệu trên cloud khi bạn chủ động chọn lưu. Trước khi chuyển nguồn dữ liệu, xuất JSON nếu cần giữ bản đang có.

Không commit `.env.local`. Không đặt dữ liệu khách hàng thật vào thư mục `public`, mã nguồn, GitHub repo hoặc file seed.

Ứng dụng tách cache demo và cache từng tài khoản. Khi đăng nhập, kho cá nhân mở riêng; dữ liệu bạn đã thử trong demo không tự chuyển sang tài khoản. Muốn chuyển, xuất JSON ở demo rồi khôi phục khi đã đăng nhập. Mọi thay đổi vẫn cần bấm **Lưu lên đám mây**; lưu cục bộ không có nghĩa đã đồng bộ. Khi đăng xuất có xác nhận, cache tài khoản trên thiết bị bị xóa và giao diện trở về demo riêng. Hãy lưu cloud hoặc xuất JSON trước nếu muốn giữ thay đổi chưa gửi. Các file JSON đã tải xuống thuộc quyền quản lý của bạn.

## Hợp đồng dữ liệu và xử lý xung đột

| Cột | Ý nghĩa |
| --- | --- |
| `owner_id` | UUID của Supabase Auth, khóa chính; một dòng cho mỗi tài khoản |
| `data` | Snapshot JSON object của ứng dụng |
| `revision` | Bắt đầu bằng 1; mỗi lần cập nhật tăng đúng 1 |
| `updated_at` | Thời gian máy chủ; trigger tự cập nhật |

Đọc bằng `select(...).eq('owner_id', user.id).maybeSingle()`. Dòng chưa tồn tại khác với lỗi mạng hoặc lỗi quyền: chỉ trường hợp chưa có dòng mới được mời khởi tạo. Chèn dòng mới với `owner_id = user.id`, `revision = 1`. Không tự chèn hay ghi đè ngay khi đăng nhập.

Khi lưu, lọc cả chủ sở hữu và phiên bản đã tải:

```ts
const { data: saved, error } = await supabase
  .from('workshop_snapshots')
  .update({ data: snapshot, revision: loadedRevision + 1 })
  .eq('owner_id', user.id)
  .eq('revision', loadedRevision)
  .select('revision, updated_at')
  .maybeSingle()
```

Nếu có `error`, phải hiển thị lỗi và không báo lưu thành công. Nếu không có dòng trả về, một thiết bị khác có thể đã lưu trước; giữ bản đang sửa, xuất bản sao nếu cần, tải bản cloud mới rồi áp dụng lại thay đổi. Không tự thử lại bằng phiên bản mới vì sẽ ghi đè công việc trên thiết bị khác. Khởi tạo trùng dòng trả lỗi khóa chính; tải dòng đã có thay vì upsert. Đây là cơ chế chống mất cập nhật, không phải chỉnh sửa cộng tác tự động.

## Kiểm tra trước khi sử dụng thật

Trên project thử nghiệm, tạo hai tài khoản A/B và kiểm tra:

1. Khi chưa đăng nhập, API không đọc/ghi được bảng.
2. A chỉ đọc/ghi dòng có `owner_id = A`; cố chèn dòng thuộc B phải bị từ chối. Truy vấn dòng B bằng A không trả dữ liệu.
3. Mở hai trình duyệt với A, cùng tải phiên bản N. Lưu từ trình duyệt thứ nhất thành N+1. Lưu từ trình duyệt thứ hai với N phải báo xung đột và không làm mất dữ liệu mới.
4. Mất mạng khi lưu phải báo lỗi; đăng xuất không để người dùng tiếp theo thấy snapshot riêng đã tải.
5. Xuất JSON và kiểm tra khả năng khôi phục trong demo trước khi cần dùng bản sao lưu thật.

Schema không có quyền DELETE cho frontend. Xóa tài khoản Auth sẽ xóa dòng liên quan qua khóa ngoại `on delete cascade`; quản trị viên cần sao lưu trước khi xóa tài khoản. RLS không bảo vệ khỏi quản trị viên database hoặc secret/service-role key: tuyệt đối không đưa những key đó vào frontend.

Chưa có project Supabase và tài khoản thật trong workspace nên việc chạy SQL, kiểm tra RLS và luồng đăng nhập trên cloud cần được kiểm chứng trên project do chủ sở hữu cấu hình. Không coi kiểm tra build frontend là kiểm tra tích hợp cloud đã thành công.

## Hạn mức và bước phát triển tiếp

Tại thời điểm tra cứu 22/10/2026, trang giá Supabase Free công bố 500 MB database/project, 50.000 người dùng hoạt động/tháng, 5 GB egress, 1 GB lưu trữ tệp, tối đa hai project hoạt động; project miễn phí có thể tạm dừng sau một tuần không hoạt động. Hạn mức và điều khoản có thể thay đổi. Snapshot phù hợp demo và số lượng bản ghi nhỏ; mỗi lần lưu gửi lại toàn bộ dữ liệu, không nên dùng cho khối lượng lớn hoặc nhiều nhân viên sửa đồng thời.

Trước vận hành thực tế nên chuyển sang bảng chuẩn hóa `organizations`, `memberships`, `customers`, `orders`, `order_items`, `operations`, `stock_movements`, `payments`; RLS theo tổ chức, vai trò quản trị/kế hoạch/kho/kế toán, nhật ký thay đổi và quy trình sao lưu. Bản vẽ CAD/PDF cần kho tệp riêng và quyền tải có kiểm soát; không nhét file vào snapshot JSON.

Google Sheets có thể dùng để xuất báo cáo hoặc mô hình dữ liệu ban đầu. Cho ứng dụng ghi dữ liệu nhiều người, cần API có xác thực phía máy chủ hoặc Apps Script được bảo vệ; không đặt spreadsheet public-write hay service-account key trong GitHub Pages. Một endpoint Apps Script công khai cho ghi dữ liệu không thay thế được hệ thống phân quyền.

## Tài liệu đối chiếu

- [GitHub Pages: giới hạn và mục đích sử dụng](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: API keys và publishable key](https://supabase.com/docs/guides/api/api-keys)
- [Supabase: gói miễn phí và hạn mức](https://supabase.com/pricing)
