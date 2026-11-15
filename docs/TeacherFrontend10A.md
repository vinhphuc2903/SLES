# Teacher Frontend — phần 10A

## Phạm vi

Triển khai dashboard, quản lý học sinh, quản lý chương học và soạn lý thuyết Markdown trong `frontend/src/features/teacher`. Dùng API thật, Axios/AuthProvider/role guards/TanStack Query và bộ UI hiện có. Giao diện tiếng Việt, lưới responsive và bảng cuộn ngang trên màn hình nhỏ.

Không triển khai ngân hàng câu hỏi, bài kiểm tra hoặc kết quả học tập trong phần này. Các liên kết tương ứng vẫn dẫn tới placeholder.

## Routes

| Route | Chức năng |
|---|---|
| `/teacher` | Dashboard giáo viên |
| `/teacher/students` | Danh sách học sinh |
| `/teacher/students/new` | Tạo học sinh |
| `/teacher/students/:id` | Hồ sơ, sửa, trạng thái và reset mật khẩu |
| `/teacher/chapters` | Danh sách chương |
| `/teacher/chapters/new` | Tạo chương nháp |
| `/teacher/chapters/:id` | Chi tiết và vòng đời chương |
| `/teacher/chapters/:id/content` | Soạn/xem lý thuyết |

Tất cả nằm dưới RoleRoute TEACHER hiện có. ProtectedRoute chờ khởi tạo phiên, chuyển người chưa đăng nhập tới login và giữ quy tắc bắt buộc đổi mật khẩu. ADMIN/STUDENT không được mở các trang này.

## API và contracts thực tế

| Method | Endpoint | Request / response |
|---|---|---|
| GET | `/api/teacher/students` | `page,pageSize,search,isActive,gradeId` → `{items,page,pageSize,totalCount}` |
| POST | `/api/teacher/students` | `{username,fullName,gradeId,email,phone}` → `{user,temporaryPassword}` |
| GET | `/api/teacher/students/{id}` | ManagedUserResponse |
| PUT | `/api/teacher/students/{id}` | `{fullName,email,phone,gradeId}` → ManagedUserResponse |
| PATCH | `/api/teacher/students/{id}/status` | `{isActive}` → 204 |
| POST | `/api/teacher/students/{id}/reset-password` | `{temporaryPassword}` |
| GET | `/api/teacher/grades` | Mảng `{id,code,name,displayOrder}`; chỉ khối đang hoạt động |
| GET | `/api/subjects` | Các môn đang hoạt động, phân trang |
| GET | `/api/chapters` | `page,pageSize,search,gradeId,subjectId,status` → trang chương |
| GET | `/api/chapters/{id}` | `{chapter,content,contentFormat,version}` |
| POST | `/api/teacher/chapters` | `{name,description,gradeId,subjectId,displayOrder}` → chương |
| PUT | `/api/teacher/chapters/{id}/content` | `{content}` → chi tiết chương và version |
| POST | `/api/teacher/chapters/{id}/publish` | 204 hoặc lỗi nghiệp vụ |
| POST | `/api/teacher/chapters/{id}/archive` | 204 hoặc lỗi nghiệp vụ |
| DELETE | `/api/teacher/chapters/{id}` | Xóa mềm; 204 hoặc lỗi nghiệp vụ |

ManagedUserResponse có `id,username,fullName,role,gradeId,email,phone,isActive,mustChangePassword,createdAt`. Backend không trả tên khối trong DTO này; frontend tra cứu tên qua grades API.

ChapterResponse có tên, mô tả, `gradeId,gradeName,subjectId,subjectName,teacherId,teacherName,displayOrder,status,publishedAt,createdAt,updatedAt,hasContent`. JSON enum thực tế dùng `Draft`, `Published`, `Archived`, `Markdown` (không phải chữ in hoa); UI hiển thị nhãn tiếng Việt.

## Dashboard và cache

Dashboard hiển thị tên giáo viên, 3 số liệu học sinh (tổng/active/inactive), 4 số liệu chương (tổng/nháp/xuất bản/lưu trữ) và các thao tác nhanh. Mỗi số liệu lấy `totalCount` của list API với `pageSize=1` và bộ lọc tương ứng. Không tính tổng từ độ dài trang dữ liệu. Các request độc lập nên không tạo một snapshot giao dịch khi dữ liệu thay đổi đồng thời.

Query keys bắt đầu bằng `['teacher', user.id, 'students' | 'chapters' | 'lookups']`. Mutation thành công invalidate nhóm học sinh hoặc chương, cập nhật list/detail/dashboard. Đăng xuất tiếp tục xóa cache và token theo foundation. Query nhận AbortSignal; mutation không tự retry.

## Học sinh

Danh sách có phân trang server (20 dòng), tìm username/họ tên, lọc khối và trạng thái; điều kiện được lưu trên URL. Tạo/sửa dùng React Hook Form + Zod, giới hạn tên đăng nhập, họ tên, email và điện thoại theo các form quản lý hiện có. Khối lớp lấy từ backend, không hardcode ID và không gửi teacherId hay role.

Đổi trạng thái và reset yêu cầu xác nhận tên học sinh, khóa thao tác khi pending và cảnh báo thu hồi phiên refresh. Mật khẩu tạm dùng lại TemporaryPasswordDialog của Admin; chỉ lưu trong component state, có nút copy và hướng dẫn chia sẻ an toàn. Mutation tạo chỉ trả `user` vào cache; reset trả void. Đóng dialog/unmount bỏ state, không ghi mật khẩu vào toast, log, query/mutation data hoặc persistent storage.

## Chương và lý thuyết

Danh sách có tìm kiếm, lọc môn/khối/trạng thái, phân trang, ngày xuất bản và các thao tác vòng đời. Tạo chương dùng khối/môn đang hoạt động; subject lookup đọc các trang tới hết, không chỉ trang đầu. Backend lấy chủ sở hữu từ JWT. Chưa có API sửa metadata chương, vì vậy không hiển thị form sửa metadata.

Publish chỉ hiện trên bản nháp và cần xác nhận. Backend kiểm tra nội dung không rỗng, khối/môn active và **đúng 200 câu hỏi PUBLISHED hợp lệ**. Thông báo số câu hợp lệ khi publish thất bại được dịch từ thông báo thật của backend; không tự dựng số đếm. Archive/xóa mềm có xác nhận và tôn trọng mọi ràng buộc lịch sử. Không có hard delete.

Editor dùng `react-markdown@^10.1.0` và `remark-gfm@^4.0.1`: headings, bold/italic, lists, tables, links, code và blockquotes. `skipHtml` bỏ raw HTML; không dùng dangerouslySetInnerHTML hay rehype-raw. Bộ URL transform mặc định của react-markdown loại bỏ protocol nguy hiểm.

Nội dung tối đa 200.000 UTF-16 code units, chỉ sửa khi Draft; Published/Archived chỉ đọc. Lưu bằng DTO `{content}` và dùng version trả từ server. Không tăng version giả lập; lưu nguyên nội dung không làm tăng version backend. Lỗi lưu giữ nguyên nội dung chưa lưu. Có Edit/Preview, trạng thái dirty, nút bỏ thay đổi có xác nhận, chặn điều hướng SPA qua `useBlocker`, cảnh báo đóng/reload bằng beforeunload. Router chuyển sang data router của React Router để hỗ trợ blocker, vẫn dùng AuthProvider và guards cũ.

## Backend bổ sung và sai khác tài liệu

Chỉ bổ sung GET `/api/teacher/grades`, do chưa có API lookup khối lớp. Interface/DTO đặt trong Application, EF query trong Infrastructure, controller TEACHER trong API; đăng ký DI tại Program.cs. Đây là danh mục dùng chung, chỉ trả khối active theo DisplayOrder/Id, không chứa dữ liệu riêng của giáo viên khác.

Không đổi schema, entities hoặc thêm migration. Không thay đổi ownership, authentication hoặc validator xuất bản. `ChapterManagement.md` cũ ghi publication validator chưa triển khai; source hiện đã có ChapterPublicationValidator hoàn chỉnh từ Question Bank. Tài liệu đó được cập nhật theo source.

## Thành phần và file thay đổi

- `features/teacher/types/contracts.ts`, `api/teacherApi.ts`, `hooks/queries.ts`, `hooks/useFilters.ts`: DTO, API, teacher-scoped cache và URL filters.
- `features/teacher/components/`: Filters, StudentForm, StudentOperations, ChapterActions/ChapterStatusBadge.
- `features/teacher/pages/`: TeacherDashboard, StudentsPage, StudentCreatePage, StudentDetailPage, ChaptersPage, ChapterCreatePage, ChapterDetailPage, ChapterContentPage.
- Dùng lại DataTable, Pagination, Card, Field, PageHeader, Button, QueryFeedback, Dialog/ConfirmationDialog và TemporaryPasswordDialog. Nội dung hướng dẫn mật khẩu đổi từ “giáo viên” sang “người dùng” để dùng chung.
- `app/router/AppRouter.tsx`, `styles/index.css`, package.json/package-lock.json, README và tài liệu module.
- Backend: GradeLookup.cs, GradeLookupService.cs, TeacherGradesController.cs, Program.cs và tests trong AdminSubjectEndpointsTests.cs.

## Verification

Đã chạy thành công:

```bash
cd frontend
npm run build
npm run lint
npm run test -- --run
npm audit

# Từ project root
dotnet restore SLES.slnx
dotnet build SLES.slnx --no-restore
dotnet test SLES.slnx --no-build --no-restore
dotnet list SLES.slnx package --vulnerable --include-transitive
```

- Frontend: **56/56 tests pass**, gồm 26 tests mới cho Teacher và 30 tests hồi quy Auth/Admin. Build/lint không lỗi hoặc warning.
- Backend: **46/46 tests pass**, gồm 4 tests mới cho grade lookup (401, ADMIN/STUDENT 403, active-only và sắp xếp). Build không warning/error.
- `npm audit`: **0 vulnerabilities**. NuGet scan gồm transitive: không phát hiện vulnerable packages ở các project.
- Tests dùng router/AuthProvider thật với HTTP adapter giả lập đúng contracts; backend lookup tests dùng TestServer/EF InMemory. Bao phủ phân trang/lọc, form, mật khẩu tạm, quyền, 403/404, vòng đời chương, validation 199 câu hỏi, Markdown/HTML/protocol, giới hạn nội dung, version, read-only và unsaved navigation.

## Giới hạn và phần 10B

Chưa xác minh end-to-end với tài khoản giáo viên kiểm thử riêng và PostgreSQL thật, hoặc kiểm tra trực quan trong trình duyệt. Không sửa tài khoản/dữ liệu thật chưa xác định để kiểm thử.

Lookup chỉ có khối/môn active: bộ lọc không liệt kê lựa chọn inactive; chương cũ vẫn hiển thị tên môn/khối từ ChapterResponse. Học sinh có khối không còn active hiển thị “Không khả dụng” trong danh sách và cần chọn khối active khi cập nhật.

API lưu nội dung không có expectedVersion/ETag, nên chưa hỗ trợ phát hiện ghi đè giữa nhiều tab/người dùng. Không thêm autosave. Cảnh báo đóng/reload phụ thuộc hỗ trợ trình duyệt. Phần 10B cần triển khai quản lý câu hỏi và bài kiểm tra; không được thay đổi điều kiện đúng 200 câu hỏi khi nối luồng xuất bản.
