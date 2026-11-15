# Student Frontend 11B — Bài kiểm tra

## Phạm vi

Triển khai Student Exam theo `FE/6.StudentExam.md`, tiếp nối Student Learning 11A. Gồm danh sách/chi tiết, bắt đầu hoặc tiếp tục một lượt thi, workspace 10 câu, đồng hồ máy chủ, lưu đáp án, nộp và xác minh khi mất phản hồi, kết quả/review snapshot, lịch sử và mục bài kiểm tra trên dashboard.

Không đổi schema v1.2, Domain Entities, migrations, số câu thi, cách chọn câu hoặc chấm điểm. Không thêm dependency. Không triển khai Part 12 E2E/deployment.

## Routes và cấu trúc

| Route | Component |
|---|---|
| `/student/exams` | StudentExamsPage |
| `/student/exams/:examId` | StudentExamDetail |
| `/student/exams/history` | StudentExamHistory |
| `/student/exam-attempts/:attemptId` | StudentExamWorkspace |
| `/student/exam-attempts/:attemptId/result` | StudentExamResult |

`features/student/exams/data.ts` chứa DTO, Axios API, TanStack Query hooks, format ngày có timezone và đồng bộ clock offset. `ExamPages.tsx` chứa list/detail/history/dashboard section. `ExamWorkspace.tsx` giữ hàng đợi lưu từng câu, trạng thái nộp và điều hướng. `ExamClock.tsx` xử lý đồng hồ và cảnh báo; `ExamResult.tsx` đọc kết quả chính thức.

Routes nằm trong STUDENT RoleRoute, giữ ProtectedRoute, refresh và forced-password-change. Sidebar bổ sung lịch sử thi. Alias `/student/results` vẫn dẫn tới lịch sử luyện tập để giữ tương thích 11A.

## APIs thực tế

Prefix `/api/student`. Mọi actor lấy từ JWT; frontend không gửi studentId.

| Method | Path | Contract |
|---|---|---|
| GET | `/exams?page&pageSize` | Mới: trang StudentExamResponse, gồm lịch sắp tới và bài đã đóng nếu còn quyền hoặc đã có lượt thi |
| GET | `/exams/{examId}` | Mới: chi tiết theo cùng scope |
| GET | `/exams/history?page&pageSize` | Mới: trang lịch sử của học sinh, mới nhất trước |
| GET | `/exams/available?page&pageSize` | API cũ giữ nguyên: chỉ các bài trong time window |
| POST | `/exams/{examId}/start` | API cũ: ExamAttemptResponse, một lượt mỗi học sinh/bài thi |
| GET | `/exams/{examId}/attempt` | API cũ: khám phá lượt đã tạo, có lazy auto-submit |
| GET | `/exam-attempts/{attemptId}` | API cũ: snapshot, đáp án đã lưu, deadline và trạng thái |
| PUT | `/exam-attempts/{attemptId}/questions/{attemptQuestionId}/answer` | `{selectedOptionId: UUID|null}` → 204 |
| POST | `/exam-attempts/{attemptId}/submit` | ExamResultResponse; lặp lại trả kết quả hiện có |
| GET | `/exam-attempts/{attemptId}/result` | Kết quả/review chỉ sau nộp hoặc hết hạn; đang làm trả 409 resultunavailable |

Page shape: `{items,page,pageSize,totalCount}`, page >= 1, pageSize 1–100. List frontend dùng 20, dashboard dùng 3 exams và 1 history. Không đếm tổng từ số dòng trang; dashboard không tạo thống kê completed/average giả.

StudentExamResponse: `id,name,description,chapterId,chapterName,subjectName,durationMinutes,startAt,endAt,status,canStart,attemptId,attemptStatus,serverNow`. Enum JSON: `Scheduled`, `Active`, `Closed`, `Cancelled`; attempt: `InProgress`, `Submitted`, `AutoSubmitted`.

ExamAttemptResponse giữ nguyên các trường `attemptId,examId,status,startedAt,expiresAt,remainingSeconds,answeredQuestions,questions`; bổ sung `serverNow`. Questions chỉ có `id,number,content,selectedOptionId,options`; options chỉ `id,label,content`, không correctness. `clockOffset` chỉ là trường frontend tính sau GET/POST, không phải API field.

ExamResultResponse gồm `attemptId,examId,status,startedAt,submittedAt,totalQuestions,answeredQuestions,correctAnswers,incorrectAnswers,unansweredAnswers,score,percentage,questions`. `startedAt` nay được điền cho student; các field identity teacher review không đổi. Review question có `id,number,content,selectedOptionId,isCorrect,options` với `isCorrect` trên option. Không có explanation trong backend hiện tại.

History item: `attemptId,examId,examName,chapterName,subjectName,status,startedAt,expiresAt,submittedAt,score`. Sắp xếp server `StartedAt DESC, Id`, phân trang server; chưa có bộ lọc trạng thái hoặc sorting tùy ý.

## Eligibility và bảo mật

Discovery kiểm tra user active, chưa deleted, role STUDENT. Exam chưa làm chỉ hiển thị khi permission Granted, đúng teacher sở hữu student, cùng grade, chapter Published/chưa deleted, exam không Draft. Detail cho phép xem metadata exam đã có lượt thuộc chính student ngay cả khi chapter/grade/lifecycle đã thay đổi, nhằm giữ lịch sử. Không trả câu hỏi của ngân hàng qua các endpoint này.

`canStart` tính trên server, false nếu đã có attempt hoặc ngoài schedule/không Active hay Scheduled. Start API cũ vẫn kiểm tra lại điều kiện, permission và pool 200 câu hợp lệ. Unique `(exam_id,student_id)` cùng xử lý conflict backend giữ một lượt. Không mở rộng hay thay đổi rule Teacher. Existing attempt được đọc qua ownership, kể cả khi exam Closed: đóng exam chỉ chặn lượt mới, không tự kết thúc lượt đang làm trước deadline.

Query keys có user ID: `['student',user.id,'exams',...]`; logout vẫn xóa cache/token. Không localStorage, không teacher-only API, không raw HTML, không chấm điểm hoặc tạo snapshot ở frontend. Snapshot pre-submit không có đáp án đúng; tests kiểm tra DTO backend và UI.

## Bắt đầu, tiếp tục và lỗi mạng

Detail hiển thị giờ địa phương bằng Intl với timezone, không thêm `Z` vào chuỗi. Nút bắt đầu dựa trên canStart của server, có khóa đồng bộ chống double click và không tự retry POST. Có nút cập nhật điều kiện khi lịch bắt đầu thay đổi.

Start thành công dùng attempt ID thật để mở workspace và đọc lại snapshot. Khi Start lỗi/timeout/conflict, gọi GET current attempt trước khi cho thử lại. Nếu tìm được lượt, mở lượt đó; nếu GET thất bại không xác định, khóa start và cung cấp kiểm tra lại. Chỉ GET 404 mới cho cập nhật điều kiện và thử lại. Hạn chế request timeout còn đang chạy trên server được bảo vệ cuối cùng bằng unique constraint/idempotent Start.

## Workspace và lưu đáp án

Hiển thị đúng 10 câu/4 options từ DTO; báo lỗi nếu sai cấu trúc hoặc thiếu timestamp hợp lệ. Giữ nguyên thứ tự và ID snapshot, không shuffle. URL `?q=N` giữ vị trí; có previous/next, 10 nút và navigator có thể thu gọn. Metadata được đọc từ student detail; câu/options luôn từ attempt snapshot.

Mỗi câu có `selected`, `saved`, `pending`, `error`; chỉ một PUT mỗi câu đang chạy. Lựa chọn nhanh được gộp về lựa chọn mới nhất sau khi request trước xác nhận. Phản hồi cũ cập nhật saved chứ không ghi đè selected mới hơn. Tiến độ chỉ đếm saved khác null, còn pending/lỗi màu khác. Không nộp khi còn pending/dirty/error. Lỗi lưu giữ lựa chọn để retry trước deadline. Đổi câu không mất worker; có cảnh báo unload/điều hướng khi còn dữ liệu chưa xác nhận. Worker không ghi lại query cache sau unmount/logout.

Mở lại workspace đợi GET attempt mới để phục hồi persisted answers và deadline, không khởi tạo workspace bằng cache cũ đang refetch. Reconcile lúc focus giữ local dirty selections, không ghi đè worker đang lưu. Đồng bộ nhiều tab vẫn theo backend hiện có, không có optimistic version/ETag; tránh dùng nhiều tab để sửa cùng lượt.

## Đồng hồ và deadline

Backend lưu `expiresAt = min(startedAt + durationMinutes, exam.endAt)` khi tạo attempt. Frontend dùng đúng expiresAt, không tính lại từ duration hoặc thêm thời gian cho đáp án chưa lưu.

API bổ sung ServerNow tại lúc tạo DTO. Client ghi thời điểm gửi/nhận và tính `offset = serverNow - (sent + received)/2`. Mỗi tick tính lại `ceil((expiresAt - Date.now() - offset)/1000)`, chặn dưới ở 0, format MM:SS hoặc HH:MM:SS; không trừ dần một counter. Tick 250ms chỉ phục vụ render. Focus/visibility/online gọi GET trạng thái để cập nhật offset và nhận kết quả nếu đã nộp. Browser ngủ hoặc throttling không làm khởi động lại đồng hồ.

Cảnh báo 5 phút/1 phút/30 giây một lần mỗi threshold trong workspace; bỏ threshold dài hơn thời gian thực tế từ startedAt tới expiresAt. Nếu nhảy qua nhiều threshold chỉ báo threshold khẩn cấp nhất, đánh dấu các ngưỡng đã qua.

Clock offset là ước lượng: độ trễ mạng không đối xứng và đổi giờ thiết bị có thể làm lệch hiển thị cho tới lần đồng bộ tiếp theo. Browser timer chỉ cung cấp thông tin; backend quyết định chấp nhận đáp án và hạn nộp.

## Nộp và hết hạn

Nộp thủ công xác nhận số câu saved/chưa trả lời, cho phép bỏ trống theo backend. Khóa đồng bộ chống gửi lặp, không retry tự động. Bất kỳ lỗi Submit nào đều kiểm tra GET attempt: đã hoàn tất → kết quả, đang làm/còn hạn → cho thử lại, chưa xác định → khóa thay đổi/nộp và hiển thị nút kiểm tra.

Khi timer về 0: khóa chọn/bỏ chọn/retry lưu/nộp thủ công; gọi GET attempt một lần cho lần hết hạn đó. GET cũ đã hỗ trợ lazy auto-submit nên không cần POST tự động lặp. Nếu chưa kết nối được, giữ trạng thái chưa xác nhận và cho kiểm tra lại hoặc tự kiểm tra khi online/focus. Không hứa lưu được lựa chọn sau hạn. Save trả 409 hoặc lỗi xảy ra khi hết giờ cũng chuyển sang kiểm tra trạng thái; backend quyết định đáp án đó có được tính không. Modal xác nhận đóng khỏi giao diện khi hết hạn/trạng thái chưa rõ để người dùng có thể kiểm tra.

Lazy auto-submit chạy khi GET attempt/current/result hoặc save; history mới cũng dùng chính helper này cho các attempt quá hạn trên trang đang đọc. Không có background worker và không coi browser mở là điều kiện chấm bài. Discovery list không chạy scoring: attemptStatus ở list có thể còn InProgress trước lần đọc attempt/history tiếp theo.

## Kết quả và lịch sử

Chỉ dùng score/percentage/count/status/time từ backend. Review hiển thị 10 snapshot theo thứ tự backend với lựa chọn đã chọn, đáp án đúng, đúng/sai/chưa trả lời. Không gọi question bank hiện tại, không có nút thi lại cùng exam. Tên môn/chương lấy metadata hiện tại; nội dung câu/options lấy immutable snapshot lịch sử. Lỗi result trước nộp/ownership không hiển thị key.

History mới phân trang theo owner, finalize các lượt quá hạn trên trang bằng helper chấm điểm sẵn có. Có loading, empty, error/retry và resume/result link. Việc đọc một trang có nhiều lượt quá hạn cần thêm graph queries cho các lượt đó (tối đa pageSize); chưa tối ưu batch hoặc background worker.

## File thay đổi

Mới:
- `frontend/src/features/student/exams/{data.ts,ExamPages.tsx,ExamWorkspace.tsx,ExamClock.tsx,ExamResult.tsx}`.
- `frontend/src/features/student/test/{examFixture.ts,studentExam.test.tsx,examClock.test.tsx}`.
- `src/SLES.Infrastructure/ExamManagement/StudentExamQueries.cs`.
- Tài liệu này.

Cập nhật:
- AppRouter, navigation, StudentDashboard; fixture Student 11A nhận hai GET dashboard mới.
- ExamManagementContracts, StudentExamsController, ExamManagementService (partial, startedAt result); không đổi service scoring.
- ExamManagementServiceTests và AdminSubjectEndpointsTests.
- Frontend README, `BE/ExamManagement.md`.

## Kiểm tra và giới hạn xác minh

Lệnh kiểm tra:

```sh
cd frontend
npm run build
npm run lint
npm run test -- --run
npm audit
# Tại SLES
dotnet restore
dotnet build
dotnet test
dotnet list package --vulnerable --include-transitive
```

Kết quả cuối: frontend build/lint thành công; backend build 0 warnings/errors. npm audit: 0 vulnerabilities; NuGet scan gồm transitive: không có vulnerable packages.

Frontend: 152 tests đạt, gồm 41 tests mới (35 route/workflow, 6 clock) và 111 hồi quy. Backend: 69 tests đạt, gồm 8 cases mới về discovery, scope, paging, deadline, lazy history, snapshots, endpoint role và PostgreSQL query translation. Test SQL translation từng phát hiện lọc trên DTO không dịch được ở relational provider; đã đưa bộ lọc examId về entity trước projection. Kiểm tra ToQueryString không kết nối DB, không được coi là integration PostgreSQL.

Frontend tests dùng Axios adapter giả hợp đồng backend; backend dùng EF InMemory/TestServer và Npgsql query translation. Chưa chạy E2E đăng nhập/làm bài bằng tài khoản kiểm thử riêng trên PostgreSQL thật hoặc kiểm tra trực quan trong browser. Không dùng hoặc sửa tài khoản/dữ liệu thật chưa xác định. Cần dedicated teacher/student cùng grade, published chapter với 200 câu hợp lệ, exam có schedule và permission để xác minh live. Kiểm thử concurrency thực tế giữa nhiều tab/requests với PostgreSQL vẫn là giới hạn của suite hiện tại.

Phần tiếp theo: Part 12 E2E Testing & Deployment (không thực hiện trong phase này), gồm cookie/refresh trên browser thật, viewport mobile, mất mạng/sleep, quyền/schedule và concurrent requests trên dữ liệu kiểm thử cô lập.
