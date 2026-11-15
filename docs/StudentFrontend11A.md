# Student Frontend 11A — Learning & Practice

## Phạm vi

Dashboard học sinh, danh mục môn học theo quyền, chương đã xuất bản, đọc lý thuyết Markdown, bắt đầu/tiếp tục luyện tập 200 câu, lưu đáp án, nộp bài, kết quả, review và lịch sử. Dùng hạ tầng AuthProvider, STUDENT RoleRoute, Axios, TanStack Query và các UI components hiện có. Không triển khai Student Exam-taking.

## Routes

| Route | Chức năng |
|---|---|
| `/student` | Dashboard từ dữ liệu thật |
| `/student/dashboard` | Alias về `/student` |
| `/student/subjects` | Môn học khả dụng, tìm kiếm và phân trang |
| `/student/subjects/:subjectId` | Danh sách chương Published của môn |
| `/student/chapters/:chapterId` | Lý thuyết chỉ đọc |
| `/student/chapters/:chapterId/practice` | Giới thiệu và bắt đầu bài mới |
| `/student/practice/:attemptId?q=N` | Workspace; q giữ vị trí câu khi reload |
| `/student/practice/:attemptId/result` | Kết quả chính thức và review |
| `/student/practice/history?chapterId=...` | Lịch sử, lọc theo chương |

Các link cũ `/student/learning`, `/student/practice`, `/student/results` được chuyển tới môn học/lịch sử phù hợp. `/student/exams` vẫn là placeholder.

## Dashboard và học tập

Dashboard lấy `totalCount` từ list môn, list chương và history, không đếm từ một trang để suy ra tổng. Chỉ tải một mục cho các list tổng và 5 history gần nhất. Có tên học sinh, số môn, số chương, số lượt luyện tập và liên kết tiếp tục/xem kết quả. Không dựng điểm trung bình, tổng hoàn thành hoặc thống kê mà API chưa cung cấp.

Danh mục môn chỉ gồm môn active có chương Published thuộc giáo viên tạo học sinh và khớp khối lớp active của học sinh. UI hiển thị tên, mô tả, khối và số chương được phép đọc. Subject detail dùng danh sách chapter phân trang server, có tìm kiếm và thứ tự hiển thị của backend. Không có lựa chọn khối lớp tùy ý vì quyền được xác định từ tài khoản.

Theory reader dùng react-markdown/remark-gfm có sẵn, `skipHtml`, không rehype-raw hoặc dangerouslySetInnerHTML; giữ URL transform mặc định để bỏ protocol nguy hiểm. Hiển thị version hiện tại. Với format khác Markdown, nội dung chỉ được hiển thị như text. Có liên kết về môn và luyện tập; không có editor.

## API contracts

| Method | Endpoint | Contract chính |
|---|---|---|
| GET | `/api/student/subjects` | `page,pageSize,search` → `{items,page,pageSize,totalCount}` |
| GET | `/api/student/subjects/{subjectId}` | `{id,name,description,gradeName,chapterCount}` |
| GET | `/api/chapters` | `page,pageSize,subjectId,search`; backend tự scope theo JWT |
| GET | `/api/chapters/{chapterId}` | `{chapter,content,contentFormat,version}` |
| POST | `/api/student/chapters/{chapterId}/practice` | Attempt mới; không gửi studentId/question IDs |
| GET | `/api/student/practice/{attemptId}` | Khôi phục attempt và lựa chọn đã lưu |
| PUT | `/api/student/practice/{attemptId}/questions/{questionId}/answer` | `{selectedOptionId}` (GUID hoặc null) → 204 |
| POST | `/api/student/practice/{attemptId}/submit` | Result chính thức |
| GET | `/api/student/practice/{attemptId}/result` | Review sau khi đã nộp |
| GET | `/api/student/practice/history` | `page,pageSize,chapterId` → trang history |

Attempt có `attemptId,chapterId,totalQuestions,answeredQuestions,isSubmitted,questions`. Mỗi question có `id,number,content,selectedOptionId,options`; option chỉ có `id,label,content`. Không có correctness trước khi nộp.

Result có `score,percentage,correctAnswers,incorrectAnswers,unansweredQuestions,completedAt` và questions/options chứa lựa chọn, correctness. Bổ sung metadata `chapterId,chapterName,subjectName,startedAt` để hiển thị kết quả lịch sử mà không cần đọc lại một chương có thể đã bị archived. History chỉ có tên chương, thời điểm bắt đầu/nộp và điểm nullable; không tự tính percentage hoặc hiển thị môn không có trong response.

## Vòng đời luyện tập

Mỗi POST start tạo một attempt độc lập; không có giới hạn số lần, không tự resume hoặc thay thế bài cũ. Trang giới thiệu nói rõ hành vi này và cung cấp liên kết tới history cùng các bài chưa nộp trong 5 lượt gần nhất. GET attempt cho phép tiếp tục bài theo ID.

Start dùng mutation không retry và khóa đồng bộ để tránh double click. Lỗi validation rõ ràng cho phép thử lại; lỗi mạng/5xx được xem là chưa xác định kết quả, khóa start tại trang hiện tại và hướng dẫn kiểm tra history trước khi tạo thêm bài. Không tự động POST lần nữa.

Question set và thứ tự do backend quyết định, frontend không sinh ID hay shuffle. Workspace kiểm tra đúng 200 questions, mỗi câu 4 options; giữ nguyên mảng và labels backend. Chỉ render một question panel cùng 200 nút điều hướng, có trước/sau, chọn trực tiếp, accessible radios và navigator có thể thu gọn. Query parameter q giữ câu hiện tại sau reload, không lưu đáp án vào localStorage/sessionStorage.

## Lưu đáp án và concurrency

Mỗi câu có state riêng gồm lựa chọn hiện tại, lựa chọn đã được máy chủ xác nhận, pending và lỗi. Tối đa một PUT đang chạy cho mỗi câu. Nếu người dùng đổi nhanh trong khi PUT chưa về, state giữ lựa chọn cuối; worker gửi tiếp lựa chọn cuối sau khi request trước hoàn tất. Phản hồi cũ chỉ cập nhật giá trị confirmed, không ghi đè lựa chọn hiện tại.

Tiến độ và số đã trả lời chỉ tính confirmed selection. Nút điều hướng đánh dấu riêng câu đang/chưa lưu. Chuyển câu không bỏ state hoặc hủy queue. Lỗi giữ nguyên lựa chọn, báo chưa lưu, có retry và khóa nộp bài. Bỏ chọn gửi null theo contract. Lưu thành công cập nhật query cache của attempt tại câu tương ứng; không GET lại toàn bộ 200 câu sau mỗi PUT.

Reload đọc lại attempt từ API; cache stale khi remount. Không tự refetch do window focus/reconnect giữa lúc làm bài để tránh thay đổi state cục bộ. Rời route khi có đáp án chưa lưu cần xác nhận; lúc đang lưu/nộp thì chờ hoàn tất. Browser beforeunload cảnh báo reload/đóng trang khi còn thao tác chưa xác nhận. Lựa chọn chưa lưu chỉ nằm trong bộ nhớ và có thể mất khi người dùng ép đóng trang; UI không tuyên bố đã lưu trước phản hồi máy chủ.

Queue này bảo vệ trong một workspace. Backend chưa có optimistic version hoặc khóa nhiều tab; không cam kết điều phối việc sửa cùng attempt từ nhiều thiết bị/tab. Khi network request bị mất phản hồi, không thể bảo đảm thứ tự commit của các writer ngoài workspace nếu thiếu backend concurrency contract.

## Nộp bài, lỗi mạng và review

Nút nộp bị khóa khi còn pending/failed/dirty answer. Confirmation dùng số confirmed, cảnh báo câu bỏ trống; backend cho phép nộp chưa đủ câu. Khóa đồng bộ tránh gửi POST submit trùng. Không tính điểm ở frontend.

Nếu POST submit lỗi/timeout hoặc backend báo already submitted, frontend GET lại attempt trước khi cho phép thử POST lần nữa. Nếu đã submitted, chuyển result; nếu xác nhận chưa submitted, cho thử lại; nếu GET cũng lỗi, khóa nộp và hiển thị nút kiểm tra trạng thái. Không coi mất phản hồi là bằng chứng request thất bại.

Trang result chỉ dùng API result được phân quyền. Attempt chưa nộp bị backend trả resultunavailable, không lộ đáp án. Hiển thị score trên 10, percentage, số đúng/sai/chưa trả lời, ngày bắt đầu/nộp và metadata chương/môn. Review dùng đúng thứ tự/IDs/options từ result; đánh dấu lựa chọn, đúng/sai và câu bỏ trống. Review phân trang hiển thị cục bộ 20 câu từ response đầy đủ; không giả lập server history pagination. Có Làm lại về trang giới thiệu để bắt đầu độc lập.

Practice v1.2 không có snapshot riêng. Backend cố định membership bằng practice_answers và thứ tự xác định từ attempt GUID; QuestionBank chặn sửa/xóa câu và thay options khi đã có practice history. Result do PracticeService tạo từ các câu được bảo vệ này. Frontend không gọi teacher API hoặc tự dựng review từ ngân hàng hiện tại. Không thêm schema để giả lập snapshot.

## Backend thay đổi

API `/api/subjects` cũ là danh mục global, không đủ thông tin student eligibility hoặc chapterCount. Bổ sung hai GET `/api/student/subjects` qua StudentLearningContracts/StudentLearningService/StudentSubjectsController và đăng ký DI. Query giữ lọc/count/pagination tại database, trả 404 cho subject ngoài scope. Không nhận studentId từ client.

Khi rà soát phát hiện student chapter read/list, practice start và student question read chưa kiểm tra Subject.IsActive/Grade.IsActive. Bổ sung điều kiện cho riêng luồng student, không thay quyền Admin/Teacher. Attempt cũ và kết quả vẫn dựa trên ownership, giữ quyền đọc lịch sử kể cả chương đã archived.

Bổ sung metadata result theo cách additive, không thay request, điểm hoặc quyền review. Không đổi Domain Entities, schema, migrations, thuật toán thứ tự, câu hỏi đúng hoặc quy tắc đúng 200 câu.

## File và components

Frontend mới dưới `src/features/student`:

- `data/contracts.ts`, `api.ts`, `queries.ts`, `errors.ts`.
- `learning/LearningPages.tsx`: SubjectsPage, SubjectPage, ChapterReader.
- `practice/PracticeStart.tsx`, `PracticeWorkspace.tsx`, `PracticeResult.tsx`, `HistoryPage.tsx`.
- `test/studentFixture.ts`, `studentLearning.test.tsx`.
- Thay dashboard placeholder tại `pages/StudentDashboard.tsx`; cập nhật AppRouter và navigation.

Dùng lại Card, PageHeader, DataTable, Pagination, Button, ConfirmationDialog, QueryFeedback, EmptyState/ErrorState và toolbar hiện có. Query keys bắt đầu bằng `['student',user.id,...]`, được xóa qua AuthProvider logout. Mutation submit invalidate history để dashboard và history cập nhật; đáp án không làm phát sinh refetch cả bài.

Backend: StudentLearningContracts.cs, StudentLearningService.cs, StudentSubjectsController.cs, Program.cs; cập nhật ChapterManagementService, QuestionBankService, PracticeContracts/PracticeService. Tests bổ sung trong PracticeServiceTests và AdminSubjectEndpointsTests.

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

- **111/111 frontend tests**, gồm 30 tests Student mới và 81 tests hồi quy Auth/Admin/Teacher.
- **61/61 backend tests**, gồm 7 tests mới: student subject scope, inactive subject/grade, post-submit metadata/history, 401/403 và endpoint authorization.
- Build/lint không warning/error. npm audit: **0 vulnerabilities**; NuGet scan gồm transitive không phát hiện vulnerable packages.
- Tests frontend kiểm tra 200 navigation controls, thứ tự, bốn options, không correctness trước nộp, serialize rapid changes, pending navigation, failed save/retry, restore, submit double click/timeout/already submitted, review và quyền.
- Backend tests từng phát hiện projection EF không dịch được; đã sửa lọc/paging trước projection DTO, sau đó toàn bộ tests đạt.

## Giới hạn xác minh và phần tiếp theo

Chưa xác minh E2E với tài khoản học sinh kiểm thử riêng/PostgreSQL thật hoặc kiểm tra trực quan trên browser. Tests dùng HTTP adapters giả và EF InMemory/TestServer; không coi đây là live integration. Không sửa dữ liệu hoặc tài khoản thật chưa xác định.

History API không hỗ trợ lọc status hoặc đổi thứ tự; UI giữ thứ tự mới nhất và bộ lọc chapterId thực tế. Dashboard bỏ average score/completed aggregate thay vì suy ra từ một trang. Không tạo resume endpoint mới. Cảnh báo unload phụ thuộc trình duyệt; browser ép đóng có thể làm mất state chưa lưu.

Phần tiếp theo: Student Exam-taking, permission/time window, deadline, snapshot và kết quả thi; không dùng lại practice rules để thay thế exam rules.
