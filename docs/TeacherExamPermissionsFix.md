# Sửa Teacher Exam Permissions

## Nguyên nhân

`ExamManagementService.ListPermissionsAsync` dựng positional record `ExamPermissionResponse` rồi gọi `OrderBy(x => x.FullName)`. EF Core/Npgsql không dịch được truy cập property của constructor projection trong OrderBy sang SQL, ném `InvalidOperationException: ... could not be translated`. Lỗi xảy ra ngay cả khi danh sách rỗng.

Đã tái hiện trước sửa bằng HTTP authenticated Teacher và database PostgreSQL riêng nạp schema v1.2: GET `/api/teacher/exams/{examId}/permissions` trả **500**. Stack trace chỉ đúng projection/OrderBy tại ListPermissionsAsync. Đây không phải lỗi route, HTTP method hay thiếu role.

Trang gọi cùng endpoint hai lần:

- `GET .../permissions?page=1&pageSize=20`: bảng quyền.
- `GET .../permissions?page=1&pageSize=100&status=Granted`: useGranted đánh dấu học sinh đã cấp quyền (có thể phân trang tiếp).

Cả hai đi qua truy vấn lỗi. Vùng chọn học sinh chờ cả useStudents và useGranted, nên request permissions lỗi làm cả vùng hiển thị lỗi dù GET `/api/teacher/students?isActive=true&gradeId=...&search=...` vẫn **200** trong lần tái hiện. Không dùng tài khoản thực để thao tác trên exam được nêu trong đặc tả; bằng chứng tái hiện dùng exam/teacher riêng.

## Thay đổi

Backend sắp xếp theo cột student.FullName, thêm student.Id để phân trang ổn định, rồi Skip/Take trước khi dựng DTO. Toàn bộ lọc/sắp xếp/phân trang vẫn thực hiện tại PostgreSQL, không tải toàn bộ danh sách về xử lý trong memory.

`ExamPermissionResponse` giữ trường cũ, thêm nullable `gradeId`, `gradeName`, `attemptStatus` cho list và response cấp quyền đơn. Không thêm endpoint, không thay schema/Domain Entities, không thay package.

Frontend hiển thị khối lớp, trạng thái bài làm nếu có (fallback hasAttempt), giữ tên/username/ngày cấp/status và khóa thu hồi nếu đã có attempt. Có thông báo riêng cho danh sách học sinh rỗng và danh sách quyền rỗng. Phân biệt 403, 404, 500; 401 vẫn theo interceptor refresh/session-expiry hiện có, chuyển về đăng nhập khi refresh thất bại. Có retry cho lỗi server/network.

Giữ backend làm nguồn quyết định: active Student thuộc teacher và cùng grade với chapter của exam. Học sinh đã Granted hiển thị rõ và không chọn lại; Revoked có thể được cấp lại. Cấp đơn/bulk, xác nhận, feedback và invalidate/refetch quyền sau mutation giữ nguyên. Không thay quy tắc partial success của bulk hoặc quy tắc không thu hồi khi đã có attempt.

## Files

- `src/SLES.Infrastructure/ExamManagement/ExamManagementService.cs`
- `src/SLES.Application/ExamManagement/ExamManagementContracts.cs`
- `frontend/src/features/teacher/management/contracts.ts`
- `frontend/src/features/teacher/exams/ExamPermissions.tsx`
- `frontend/src/features/teacher/test/management.test.tsx`
- `tests/SLES.UnitTests/Integration/ExamPermissionsPostgresTests.cs`
- `tests/SLES.UnitTests/Integration/QuestionUpgradePostgresTests.cs`

## Kiểm chứng

Đã chạy:

```sh
SLES_TEST_POSTGRES_ADMIN='Host=/tmp;Database=postgres;Username=<local-postgres-role>' dotnet test SLES.slnx
cd frontend
npm run build
npm run lint
npm run test -- --run
```

**113/113 backend tests đạt, 0 skipped; 184/184 frontend tests đạt; frontend build/lint đạt.** dotnet test đã restore/build các projects thành công.

Integration test mới tạo database `sles_permissions_test_<UUID>`, nạp schema v1.2, seed teacher/student/exam riêng; đăng nhập bằng username/password qua AuthController thật, lấy JWT và gọi API qua **Kestrel HTTP local** trên port ngẫu nhiên. Database test được xóa sau kiểm thử. Không dùng mocked authentication hoặc EF InMemory cho kiểm thử này.

Các kết quả sau sửa:

| Hành động | Kết quả |
|---|---|
| GET students active/cùng grade + search | 200, đúng 2/1/0 học sinh theo dữ liệu/lọc |
| GET permissions rỗng/có dữ liệu + status Granted/Revoked + pagination | 200, đúng total/items và DTO |
| POST permission đơn/cấp lại | 200, không nhân đôi row |
| POST permissions/bulk | 200, báo từng học sinh hợp lệ/không hợp lệ |
| DELETE permission chưa có attempt | 204, giữ row ở Revoked |
| Không token / role Student | 401 / 403 |
| Teacher khác xem/cấp/thu hồi | 404 |
| Grant inactive/sai grade/sai teacher | 400 |
| Page không hợp lệ | 400 |

PostgreSQL integration hiện có được bổ sung kiểm tra list trả `hasAttempt=true`, `attemptStatus=InProgress`, và revoke service trả Conflict khi đã tạo attempt thật. Frontend regression bổ sung empty/search/clear-selection/grade/status/403/404/500/401-session-expiry, cùng các test single grant, bulk partial success, revoke, disabled revoke có sẵn.

## Giới hạn

Chưa chạy browser E2E trên URL exam cụ thể trong đặc tả. Frontend dùng HTTP adapters giả; kiểm thử HTTP backend + JWT + PostgreSQL thật xác nhận API và grant/revoke, không được gọi là browser E2E. Local API đã khởi động lại với bản sửa, không sửa quyền hoặc tài khoản thật của người dùng.
