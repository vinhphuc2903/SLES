# Teacher Frontend 10B — Question Bank & Exam Management

## Phạm vi

Hoàn thành ngân hàng câu hỏi theo chương, tiến độ xuất bản chương, quản lý bài kiểm tra, quyền tham gia, kết quả và xem snapshot lịch sử. Tái sử dụng Teacher layout, TEACHER RoleRoute, ProtectedRoute, AuthProvider, Axios refresh interceptor, TanStack Query và các UI components hiện có.

Không triển khai giao diện học tập, luyện tập hoặc làm bài của STUDENT. Không đổi schema, Domain Entities, migrations, quy tắc chấm điểm hay snapshot.

## Routes và tổ chức

| Route | Nội dung |
|---|---|
| `/teacher/questions` | Chọn chương thuộc giáo viên, tìm/lọc/phân trang server |
| `/teacher/chapters/:chapterId/questions` | Danh sách câu hỏi, tìm/lọc trạng thái, tiến độ |
| `/teacher/chapters/:chapterId/questions/new` | Tạo câu hỏi trong chương Draft |
| `/teacher/questions/:questionId` | Chi tiết/sửa và vòng đời câu hỏi |
| `/teacher/exams` | Danh sách bài kiểm tra |
| `/teacher/exams/new` | Tạo bài kiểm tra |
| `/teacher/exams/:examId` | Chi tiết/sửa Draft, xuất bản/đóng |
| `/teacher/exams/:examId/permissions` | Cấp/thu hồi quyền |
| `/teacher/exams/:examId/results` | Danh sách kết quả, tìm học sinh và phân trang |
| `/teacher/exams/:examId/attempts/:attemptId` | Xem snapshot lịch sử |

`/teacher/results` chuyển tới danh sách bài kiểm tra để chọn kết quả theo đề. Sidebar và dashboard đã bỏ placeholder câu hỏi/bài kiểm tra. Chi tiết chương có liên kết Quản lý câu hỏi và QuestionProgress.

Các file mới dưới `frontend/src/features/teacher`:

- `management/`: contracts.ts, api.ts, queries.ts, utils.ts, ui.tsx — DTO, request, cache, lỗi, toolbar, nhãn và xác nhận dùng chung.
- `questions/`: QuestionPages.tsx, QuestionForm.tsx, QuestionProgress.tsx.
- `exams/`: ExamPages.tsx, ExamForm.tsx, ExamPermissions.tsx, ExamResults.tsx.
- `test/`: managementFixture.ts và management.test.tsx; cập nhật teacherFixture.ts cho API tiến độ mới.

Các file tích hợp được sửa: AppRouter.tsx, navigation.ts, TeacherDashboard.tsx, ChapterDetailPage.tsx, README. Không thêm dependency frontend.

## Câu hỏi

API:

- GET/POST `/api/teacher/chapters/{chapterId}/questions`
- GET `/api/teacher/chapters/{chapterId}/questions/progress` (mới)
- GET/PUT/DELETE `/api/teacher/questions/{id}`
- POST `/api/teacher/questions/{id}/publish`
- POST `/api/teacher/questions/{id}/archive`

List nhận `page,pageSize,status,keyword`; trả `{items,page,pageSize,totalCount}`. Không tải tất cả câu hỏi để giả lập phân trang hoặc tìm toàn hệ thống. Detail trả `{question,options}`; summary có id, chapterId, content, status, difficulty, createdAt, updatedAt. JSON enum là Draft/Published/Archived.

QuestionForm dùng RHF/Zod: nội dung không rỗng, đúng bốn phương án không rỗng, một radio đúng. Request create/update chỉ gồm `{content,options:[{content,isCorrect}]}`. Labels A–D do vị trí hiển thị; không gửi option IDs. Khi sửa, form sắp theo DisplayOrder, chọn đáp án theo IsCorrect; backend thay các option trong transaction và chặn câu hỏi có lịch sử. Nội dung câu hỏi là plain text; không suy diễn Markdown/HTML từ cột TEXT.

Tạo mới chỉ được phép trong chương Draft. Chỉ câu hỏi Draft được sửa/publish/delete; Draft/Published được archive. Publish/archive/delete có xác nhận; delete là soft delete, không bỏ qua history guard. Backend quyết định quyền sở hữu và lifecycle. Form giữ input khi lỗi và hiển thị lỗi nghiệp vụ tiếng Việt.

## Tiến độ xuất bản chương

API progress chỉ dành cho TEACHER, kiểm tra chapter thuộc JWT teacher và chưa bị xóa trước khi thống kê. Response `{draft,published,archived,validPublished}` bỏ qua câu đã soft-delete. ValidPublished yêu cầu Published, nội dung không trắng, đúng bốn option không trắng và đúng một option đúng, dùng cùng hàm validation của QuestionBankService.

Frontend hiển thị cả số Published và số Published hợp lệ, thanh tiến độ tới 200; 199 chưa đủ, 201 vượt quá, 200 chỉ đủ điều kiện về số câu. Máy chủ vẫn kiểm tra lý thuyết, khối/môn và trạng thái chương khi publish. Không thay đổi ChapterPublicationValidator.

Backend bổ sung QuestionProgressResponse/ProgressAsync trong Application, implementation trong QuestionBankService và GET action trong TeacherQuestionsController. Tính aggregate ở server; không truyền ngân hàng đầy đủ tới trình duyệt. Hiện implementation đọc câu hỏi/options của chương ở server để áp dụng chính xác validation chuỗi; chương rất lớn có thể cần tối ưu truy vấn sau này.

## Bài kiểm tra

API sử dụng GET/POST `/api/teacher/exams`, GET/PUT `/{examId}`, POST `/{examId}/publish`, POST `/{examId}/close`.

List nhận `page,pageSize,keyword,status` (backend cũng hỗ trợ chapterId). DTO ExamResponse dùng `name`, không phải title, cùng chapterId, description, questionCount, durationMinutes, startAt/endAt, status, openedAt/closedAt, createdAt/updatedAt, permissionCount, attemptCount. Tên chương/môn/khối được tra từ chapter detail có cache; không tự thêm các trường không tồn tại vào ExamResponse.

Form tạo chọn chương Published từ list phân trang, có tìm kiếm và kiểm tra số câu hợp lệ của chương đã chọn. Máy chủ kiểm tra chính xác 200 câu khi create/publish. Update chỉ gửi name, description, durationMinutes, startAt, endAt; không thay chapter. Tên tối đa 255 ký tự, duration là số nguyên dương trong miền Int32; lịch bắt đầu/kết thúc tùy chọn theo DTO thật, nếu cùng có thì kết thúc phải sau bắt đầu.

Datetime-local hiển thị múi giờ trình duyệt, chuyển bằng `new Date(localValue).toISOString()` khi gửi. Không nối Z vào chuỗi giờ địa phương. Các thời điểm trả về hiển thị bằng Intl theo local timezone. Không dùng đồng hồ frontend để quyết định quyền thi.

Lifecycle thật: Draft sửa/publish; publish thành Scheduled nếu startAt ở tương lai, ngược lại Active. Closed/Cancelled không được cấp thêm quyền. Close áp dụng các trạng thái chưa Closed/Cancelled, chặn bắt đầu mới nhưng **không tự nộp mọi bài đang làm**. Không tạo transition Cancel trên frontend vì không có endpoint. Máy chủ chọn/snapshot 10 câu khi từng học sinh bắt đầu; frontend không chọn câu hoặc chấm điểm.

`permissionCount` tính tất cả bản ghi quyền, gồm đã revoked; `attemptCount` gồm bài đang làm, không phải số bài đã nộp. UI ghi đúng ý nghĩa này.

## Quyền tham gia

API GET/POST `/{examId}/permissions`, POST `/{examId}/permissions/bulk`, DELETE `/{examId}/permissions/{studentId}`.

PermissionResponse có studentId, username, fullName, status Granted/Revoked, grantedAt/revokedAt, hasAttempt. Không có grade hoặc attempt status chi tiết; danh sách không tự dựng các trường này.

Selector lấy học sinh do giáo viên quản lý qua API student list với `isActive=true` và gradeId của chương. Phân trang server 20 dòng, tìm kiếm, checkbox, chọn tất cả **trang hiện tại**, bỏ chọn và xác nhận bulk. Chuyển trang/tìm kiếm xóa selection. Một học sinh có thể được cấp riêng qua endpoint đơn.

Để ngăn chọn trùng người đã có quyền ở trang permission khác, frontend đọc các trang Granted với pageSize=100 tới hết để xây membership set; danh sách hiển thị vẫn phân trang server. Đây không phải việc tải toàn bộ học sinh hoặc giả lập pagination. Cache dùng chung và invalidate sau grant/revoke; với kỳ thi rất lớn có thể cần API eligibility theo trang trong tương lai.

Bulk trả `[{studentId,granted,detail}]`, có **partial success**, không phải atomic all-or-nothing. UI hiển thị kết quả từng học sinh, giữ thông báo thất bại. Grant lại quyền Granted là idempotent ở backend; UI ngăn chọn trùng khi biết trạng thái. Revoke cần xác nhận, disabled nếu hasAttempt; backend tiếp tục chặn nếu attempt xuất hiện sau lúc tải trang. Không xóa bài làm hoặc tuyên bố thu hồi làm vô hiệu bài đang làm.

## Kết quả và snapshot

GET `/{examId}/results` nhận page/pageSize/studentKeyword và trả trang TeacherExamResultItem, gồm học sinh, trạng thái quyền, attemptId/status, điểm nullable, phần trăm nullable, thời điểm nộp. UI phân biệt điểm 0 với chưa có điểm; chỉ hiển thị điểm/percentage do server trả, không tính lại.

GET `/{examId}/attempts/{attemptId}` trả ExamResultResponse, các câu/options từ snapshot và selectedOptionId. UI giữ nguyên thứ tự response, dùng snapshot option ID để đánh dấu lựa chọn, đáp án đúng, câu sai hoặc chưa trả lời; không gọi current Question Bank để dựng lịch sử. Attempt InProgress chưa hết hạn trả ResultUnavailable. Theo behavior backend hiện có, đọc attempt hết hạn có thể lazy auto-submit.

Response cũ thiếu học sinh/thời điểm bắt đầu cho trang review trực tiếp. Bổ sung tương thích bốn nullable properties vào ExamResultResponse: studentId, studentUsername, studentFullName, startedAt. Chỉ GetTeacherAttemptAsync điền các trường sau khi kiểm tra ownership exam và attempt. Các API student cũ giữ nội dung cũ, trường mới null. Không thay đổi snapshot, scoring hoặc request contract. Tên học sinh là thông tin tài khoản hiện tại; nội dung câu/options mới là snapshot lịch sử.

## Quyền, cache và lỗi

Toàn bộ routes nằm dưới TEACHER guard hiện có, vẫn tôn trọng forced password change và khởi tạo phiên. Backend là nơi quyết định ownership; không gửi teacherId tùy chọn, không đổi token storage hay refresh logic.

Query keys `['teacher',user.id,'questions',...]` / `['teacher',user.id,'exams',...]`. Question mutation invalidate toàn bộ questions (list/detail/progress) và chapters. Exam/permission mutation invalidate exams, bao gồm permissions/granted membership/results/details. Results/attempt queries dùng staleTime=0 để refetch khi quay lại; logout xóa cache theo foundation.

Dùng normalizeApiError và thông báo tiếng Việt cho lỗi validation, quyền, 404, conflict/history, lifecycle, schedule, eligibility và result unavailable; lỗi mạng/timeout/server dùng thông báo an toàn. Form khóa khi submitting; action dialog khóa khi pending. Không render unsafe HTML, không log mật khẩu/token hoặc dựng điểm ở frontend.

## Kiểm thử và kết quả

Frontend thêm **25 tests** bằng router/AuthProvider thật và HTTP adapter giả đúng contracts: chapter selector, server paging/filter, bốn options/radio, create/edit, xác nhận lifecycle/history conflict, progress 199/200/201 và invalidation, exam create/edit/local-to-UTC, publish/close, single/bulk/revoke, chọn trên trang, partial failure, hasAttempt guard, score 0/null, snapshot review, lỗi API và role guard. Cùng 56 tests hồi quy: **81/81 pass**.

Backend thêm **8 tests**: progress 199/200/201 (loại invalid/deleted, counts theo status, ownership), endpoint auth 401/403/404 và teacher attempt identity/start time cùng ownership/result unavailable. Tổng **54/54 pass**.

Đã chạy:

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

Build/lint không warning/error. npm audit: 0 vulnerabilities. NuGet scan gồm transitive: không phát hiện vulnerable packages trong các project.

## Giới hạn và bước tiếp theo

Chưa thực hiện E2E với tài khoản giáo viên kiểm thử riêng và PostgreSQL thật hoặc kiểm tra trực quan trên trình duyệt; frontend tests giả lập HTTP, backend tests dùng TestServer/EF InMemory. Không sửa dữ liệu hoặc tài khoản thật chưa xác định.

Không có tìm kiếm câu hỏi toàn hệ thống hoặc endpoint báo cáo tất cả bài kiểm tra; các màn hình dùng chapter/exam scope. API chỉ cho tạo câu hỏi trong chương Draft; frontend giữ nguyên giới hạn đó kể cả khi ngân hàng của chương Published thay đổi sau archival. Không có edit metadata chương hay hủy bài kiểm tra mới ngoài API hiện có.

Phần tiếp theo: Student Learning, Practice và Exam-taking UI, kết nối quyền tham gia, deadline/auto-submit và kết quả theo API student; giữ đáp án đúng chỉ ở response được phép.
