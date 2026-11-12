# Đưa lịch công tác lên Netlify

Thư mục này đã gồm: `public` (giao diện), `netlify/functions/api.mjs` (xử lý đăng nhập, phân quyền, lưu lịch), `netlify.toml`, `package.json`.
Dữ liệu lịch và tài khoản được lưu bằng Netlify Blobs (mặc định đặt ở vùng Singapore).

## 1. Chuẩn bị
1. Máy tính đã cài Node.js (bản LTS).
2. Mở Command Prompt, đi vào thư mục này: `cd /d "D:\duong-dan\lich-cong-tac-netlify"`
3. Tạo chuỗi bí mật để ký phiên đăng nhập, chạy lệnh sau rồi **chép lại kết quả** (64 ký tự):
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 2. Khai báo biến môi trường trên Netlify
Vào site trên Netlify, mục cấu hình (Site configuration), phần **Environment variables**, thêm:

| Tên biến | Giá trị |
|---|---|
| `SESSION_SECRET` | chuỗi 64 ký tự vừa tạo (đánh dấu là bí mật) |
| `ADMIN_PASSWORD` | mật khẩu ban đầu của tài khoản `admin` (từ 8 ký tự, có chữ và số) |
| `PUBLIC_VIEW` | `0` (phải đăng nhập mới xem được). Đặt `1` nếu muốn ai có link cũng xem |

Tùy chọn: `BLOBS_REGION` (mặc định `ap-southeast-1` Singapore). Không đổi vùng sau khi đã có dữ liệu, vì dữ liệu cũ sẽ không tự chuyển sang vùng mới.

## 3. Đưa lên Netlify bằng dòng lệnh
Hàm xử lý (functions) **không** triển khai được bằng cách kéo thả thư mục, phải dùng dòng lệnh hoặc Git.
```
npm install
npm install -g netlify-cli
netlify login
netlify link
netlify deploy --prod
```
- `netlify login`: đăng nhập tài khoản Netlify của bạn trên trình duyệt.
- `netlify link`: chọn site có sẵn (hoặc tạo site mới) để gắn thư mục này vào.
- Sau mỗi lần sửa biến môi trường, hãy chạy lại `netlify deploy --prod`.

## 4. Đăng nhập lần đầu
Mở địa chỉ site, đăng nhập `admin` với mật khẩu trong `ADMIN_PASSWORD`. Hệ thống bắt đổi mật khẩu ngay. Sau đó:
1. Vào "Đơn vị và lãnh đạo" để đổi tiêu đề và danh sách chức danh.
2. Vào "Tài khoản" để tạo tài khoản cho cán bộ: vai trò **Nhập lịch** (thêm, sửa, xóa lịch) hoặc **Chỉ xem**.
3. Xóa biến `ADMIN_PASSWORD` trên Netlify rồi deploy lại (không bắt buộc, nhưng nên làm).

## 5. Gắn tên miền .gov.vn
1. Trên Netlify: Domain management, **Add a domain**, nhập `lich.tenmiencuaban.gov.vn`.
2. Nhờ đơn vị quản lý DNS của tên miền tạo bản ghi **CNAME**: tên `lich`, giá trị `<tên-site>.netlify.app`.
3. Khi DNS có hiệu lực, Netlify tự cấp HTTPS cho tên miền này.

## 6. Cập nhật về sau
Sửa file, rồi chạy lại `netlify deploy --prod`. Lịch và tài khoản trong Blobs không bị mất khi deploy lại.

## 7. Bảo mật đã có
- Mật khẩu được băm (scrypt, có muối). Mật khẩu mới từ 8 ký tự, có chữ và số, tài khoản mới phải đổi mật khẩu khi đăng nhập lần đầu.
- Phiên đăng nhập bằng cookie HttpOnly có chữ ký, hết hạn sau 30 phút không thao tác hoặc 12 giờ. Đổi mật khẩu, khóa, đổi vai trò hay đặt lại mật khẩu sẽ làm các phiên cũ của tài khoản đó mất hiệu lực.
- Khóa 5 phút sau 5 lần nhập sai (theo địa chỉ và theo tên đăng nhập).
- Mọi quyền được kiểm tra ở máy chủ. Có chống giả mạo yêu cầu chéo trang và các tiêu đề bảo mật.
- Nhật ký hoạt động (nút "Nhật ký hoạt động" của quản trị): giữ 500 dòng gần nhất.
- Mỗi lần có thay đổi, hệ thống ghi thêm một bản sao theo ngày (`backup-<ngày>`) trong Blobs. Chủ site xem và tải được ở mục Blobs trên Netlify.

## 8. Hạn chế cần biết
- Đăng xuất chỉ xóa cookie trên máy đang dùng, không thu hồi phiên ở thiết bị khác. Muốn thu hồi ngay, quản trị khóa hoặc đặt lại mật khẩu tài khoản đó.
- Chưa có xác thực hai bước.
- Dữ liệu nằm trên hạ tầng của Netlify ở nước ngoài. Hãy xin ý kiến cấp trên trước khi dùng cho lịch công tác của lãnh đạo.
- Gói miễn phí có giới hạn lượt dùng. Hãy kiểm tra giới hạn hiện hành trong tài khoản Netlify của bạn.
