# Admin Frontend

## Phạm vi và routes

Module `frontend/src/features/admin` triển khai dashboard, quản lý giáo viên và môn học bằng API thật. Các routes `/admin`, `/admin/teachers`, `/admin/teachers/new`, `/admin/teachers/:id`, `/admin/subjects`, `/admin/subjects/new`, `/admin/subjects/:id` dùng RoleRoute hiện có, chỉ dành cho ADMIN. Backend vẫn chịu trách nhiệm phân quyền. Giao diện dùng tiếng Việt, shell và bộ UI hiện có.

## Dashboard

Hiển thị tên Admin và sáu số liệu: tổng, đang hoạt động và ngừng hoạt động cho giáo viên/môn học. Mỗi số liệu lấy `totalCount` từ list API với `page=1&pageSize=1` và bộ lọc `isActive` tương ứng; không đếm `items` của một trang. Các truy vấn độc lập nên số liệu không phải snapshot giao dịch khi dữ liệu thay đổi đồng thời. Có loading, lỗi/retry, trạng thái rỗng và liên kết quản lý/tạo mới.

## API contracts

Các đường dẫn dưới đây có tiền tố `/api/admin`. List trả `{items,page,pageSize,totalCount}` và nhận `page`, `pageSize`, `search`, `isActive`.

| Method | Path | Request / response chính |
|---|---|---|
| GET | `/teachers` | Danh sách giáo viên phân trang |
| GET | `/teachers/{id}` | Hồ sơ giáo viên |
| POST | `/teachers` | `{username,fullName,email,phone}` → `{user,temporaryPassword}` |
| PUT | `/teachers/{id}` | `{fullName,email,phone}` → hồ sơ |
| PATCH | `/teachers/{id}/status` | `{isActive}` → 204 |
| POST | `/teachers/{id}/reset-password` | Không có body → `{temporaryPassword}` |
| GET | `/subjects` | Danh sách môn học, bao gồm môn ngừng hoạt động |
| GET | `/subjects/{id}` | Chi tiết môn học |
| POST | `/subjects` | `{code,name,description}` → môn học |
| PUT | `/subjects/{id}` | `{name,description}` → môn học |
| PATCH | `/subjects/{id}/status` | `{isActive}` → 204 |

Teacher dùng `id`, `username`, `fullName`, `email`, `phone`, `isActive`, `createdAt`; trang chi tiết còn dùng `mustChangePassword`. Subject dùng `id`, `code`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`. Không cho sửa role, password, username hoặc mã môn học qua form cập nhật.

API công khai `/api/subjects` chỉ trả môn đang hoạt động, không đáp ứng danh sách Admin và thống kê đầy đủ. Vì vậy bổ sung tối thiểu hai GET `/api/admin/subjects` và `/api/admin/subjects/{id}`, bảo vệ bằng ADMIN. List hỗ trợ tìm mã/tên, trạng thái tùy chọn, phân trang và đếm trước phân trang. Hành vi public endpoint không đổi. Không đổi schema, entities hay thêm migrations.

## Thành phần và luồng

- `TeacherForm`, `SubjectForm`: React Hook Form + Zod, dùng lại giữa tạo/sửa; validation và lỗi backend theo trường; ngăn gửi lặp khi pending.
- `TeacherTable`, `SubjectTable`, `ListToolbar`: tìm kiếm, lọc trạng thái và phân trang phía server; lưu điều kiện vào URL.
- `QueryFeedback`: skeleton, lỗi/retry và thông báo 403/404; danh sách có trạng thái rỗng.
- `Dialog`, `ConfirmationDialog`: portal, focus trap/restore, nhãn truy cập, Escape/backdrop và khóa đóng khi đang gửi.
- `TeacherOperations`, `SubjectStatusDialog`: xác nhận tên đối tượng trước đổi trạng thái/reset password, gọi API và cập nhật cache. Không có xóa cứng.
- `TemporaryPasswordDialog`: hiển thị mật khẩu tạm, copy clipboard, nhắc chia sẻ an toàn và xóa clipboard sau khi dùng.

Tạo giáo viên thành công mở mật khẩu tạm rồi chuyển tới chi tiết sau khi đóng. Sửa chỉ gửi trường DTO cho phép. Reset mật khẩu cần xác nhận và cảnh báo thu hồi phiên refresh. Tạo môn học chuyển tới chi tiết; sửa và đổi trạng thái phản ánh dữ liệu trả từ backend.

## Cache, mật khẩu và lỗi

Dùng Axios client và refresh interceptor chung. Query keys bắt đầu bằng `['admin','teachers']` hoặc `['admin','subjects']`. Mutation thành công invalidate toàn bộ nhóm tương ứng, gồm list, detail và số liệu dashboard. Logout tiếp tục xóa query cache theo AuthProvider hiện có.

Mật khẩu tạm chỉ nằm trong state của component đang hiển thị. Mutation tạo giáo viên trả về phần `user` đã bỏ mật khẩu; reset trả void. Mật khẩu không nằm trong query/mutation data, localStorage, sessionStorage, toast hay log; đóng dialog hoặc unmount sẽ bỏ state. Mutation có `gcTime: 0` và không retry tự động.

Lỗi dùng bộ chuẩn hóa chung, thêm thông báo tiếng Việt cho validation 400, phiên 401, quyền 403, không tìm thấy 404, xung đột 409, server 500 và lỗi mạng. Lỗi trường được ánh xạ vào form khi có thể; không hiển thị stack trace.

## Kiểm thử và kết quả

Frontend thêm 18 tests dùng router/AuthProvider thật và HTTP adapter giả lập đúng DTO backend: số liệu từ totalCount, list/phân trang/tìm kiếm/lọc, tạo/sửa, validation/conflict, xác nhận và pending, reset/xóa mật khẩu tạm, cache, lỗi/retry, quyền, đăng nhập/khôi phục phiên/đăng xuất. Cùng tests foundation: **30/30 pass**.

Backend thêm 5 tests với TestServer và EF InMemory cho hai GET Admin: 401/403, phân trang, tìm kiếm, lọc inactive, chi tiết/404, validation và public list chỉ active. Tổng backend: **42/42 pass**.

Đã chạy thành công:

```bash
cd frontend
npm run build
npm run lint
npm run test -- --run
npm audit

# Từ project root
dotnet build SLES.slnx -v minimal
dotnet test SLES.slnx --no-build --no-restore -v minimal
```

Backend build không có warning/error; npm audit báo 0 vulnerabilities. Không thêm hoặc nâng cấp dependency cho module này.

## Giới hạn xác minh

API local tại port 5169 phản hồi 401 cho `/api/auth/me` không có token. Chưa xác minh luồng đăng nhập và CRUD đầy đủ với tài khoản kiểm thử riêng/PostgreSQL; tests tự động dùng dữ liệu giả lập và EF InMemory. Không sửa tài khoản hoặc dữ liệu thật để kiểm thử. Chưa xác minh trực quan trên trình duyệt thực.
