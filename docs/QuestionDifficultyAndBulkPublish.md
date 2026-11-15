# Question Difficulty, Bulk Publish và Exam Blueprint

Triển khai theo `FC/2.UpdateQuestion.md`, ngày 08/11/2026. Giữ .NET 10, provider PostgreSQL và các package hiện có. Không đổi quy tắc Chapter Publish, deadline/chấm điểm Exam hoặc Practice 200 câu.

## Độ khó và dữ liệu cũ

| Mã lưu DB/API | Nhãn | Số câu mỗi Exam mới |
|---|---|---:|
| RECOGNITION | Nhận biết | 3 |
| COMPREHENSION | Thông hiểu | 3 |
| LOW_APPLICATION | Vận dụng thấp | 2 |
| HIGH_APPLICATION | Vận dụng cao | 2 |

Schema v1.2 thực tế đã có `difficulty` với EASY/MEDIUM/HARD. Không có phép ánh xạ nghiệp vụ được duyệt sang bốn mức mới. Migration giữ nguyên cột cũ dưới tên `legacy_difficulty`, thêm `difficulty varchar(32)` nullable, không default; CHECK chỉ cho phép null hoặc bốn mã mới. Không phân loại ngầm, xóa hay archive câu cũ. Chưa áp dụng NOT NULL vì còn legacy. Không thêm index: truy vấn giới hạn theo chapter/status hiện có, chưa có bằng chứng cần index riêng.

Create/Update bắt buộc difficulty hợp lệ; Publish cũng kiểm tra. Danh sách, chi tiết, bộ lọc và thống kê hiển thị bốn nhãn cùng “Chưa phân loại”. Thống kê lấy backend, gồm tổng số và số Published hợp lệ mỗi mức. Legacy Published chưa phân loại bị loại khỏi chọn câu Exam mới, vẫn dùng được theo quy tắc Practice cũ.

PATCH classification chỉ sửa metadata độ khó và UpdatedAt; không đổi content/options/snapshot. Cho phép Draft hoặc Published chưa phân loại, đúng teacher, chapter chưa Archived. Không mở quyền sửa nội dung Published; Published đã phân loại không được đổi mức bằng endpoint này.

## Migration và rollback

Repo dùng SQL schema thủ công, không có chuỗi EF migration trước đó. Hai script versioned:

- `database/001_question_difficulty_up.sql`
- `database/001_question_difficulty_down.sql`

Đối với môi trường mới: tạo schema từ SQL v1.2 rồi chạy up. Với môi trường cũ: dừng API ghi dữ liệu, backup bằng `pg_dump -Fc`, xác nhận đúng database rồi chạy:

```sh
psql -v ON_ERROR_STOP=1 -d sles_db -f database/001_question_difficulty_up.sql
```

Script chạy transaction và khóa questions, không dựng lại bảng; up chạy lặp không thay dữ liệu. Chỉ khởi động binary mới sau up, không chạy binary cũ với schema mới.

Rollback: dừng API, backup, chạy down rồi dùng binary cũ. Down giữ phân loại mới trong `difficulty_v13_archive` để lần up tiếp theo khôi phục. Nếu đã có câu mới không có `legacy_difficulty`, down chủ động từ chối toàn transaction: operator cần gán EASY/MEDIUM/HARD cho các câu đó theo quyết định nghiệp vụ trước. Không tự quy đổi và không xóa câu để rollback. Không restore backup lên dữ liệu mới nếu chưa đánh giá mất thay đổi phát sinh.

Database local `sles_db` đã chạy up: 200 câu được giữ nguyên, 10 Published; 200 câu còn Chưa phân loại, 200 giá trị legacy được bảo toàn. Đối chiếu số lượng/status và checksum IDs/content trước sau không đổi. Backup riêng tư trước migration: `/private/tmp/sles_before_question_difficulty_20261108.dump` (quyền 0600). Backup ở thư mục tạm, cần chuyển sang nơi lưu bền vững nếu cần giữ lâu.

## Bulk publish

UI có checkbox Draft, chọn tất cả Draft trên trang hiện tại, bỏ chọn và số đã chọn. Đổi trang/lọc xóa lựa chọn. Hai hành động xác nhận riêng:

1. Xuất bản các IDs đã chọn trên trang.
2. Xuất bản tất cả Draft hợp lệ trong chương, không phụ thuộc trang hoặc bộ lọc hiện tại.

Server kiểm tra TEACHER, ownership, chapter Draft, câu chưa xóa trong đúng chương, trạng thái Draft, content không rỗng, đúng bốn options không rỗng/một đáp án đúng và difficulty hợp lệ.

Selected mode: 1–1000 IDs duy nhất; bất kỳ câu sai/khác chương thì không câu nào được publish, trả requestedCount, publishedCount=0, skippedCount=requestedCount và errors. All mode: chỉ xét Draft, bỏ qua câu không hợp lệ và trả lỗi rõ ràng; Published/Archived không nằm trong requestedCount. Không tự publish Chapter.

Transaction Serializable cập nhật tất cả status cùng receipt trong bảng `audit_logs` hiện có, Action QUESTION_BULK_PUBLISH. RequestId là khóa duy nhất; receipt gắn teacher/chapter và hash của mode+IDs đã chuẩn hóa. Retry cùng ID/nội dung trả kết quả đã commit; ID dùng lại với nội dung khác trả 409. UpdatedAt/Status dùng concurrency token. Xung đột đồng thời trả 409 để retry cùng ID. Receipt không hết hạn trong ứng dụng; chính sách dọn audit_logs cần bảo toàn chúng nếu còn hỗ trợ replay.

UI khóa double click; khi mất phản hồi giữ requestId/body để thử lại, không tự gửi mutation lặp. Nếu đóng/reload trang thì state retry của UI mất; phải đối chiếu ngân hàng trước thao tác mới. Backend receipt vẫn tồn tại qua restart. Response replay là thống kê tại thời điểm commit; UI invalidate/refetch ngân hàng và progress để lấy hiện trạng.

## API

Các endpoint mới đều yêu cầu TEACHER:

| Method/path | Request/response |
|---|---|
| PATCH `/api/teacher/questions/{questionId}/difficulty` | `{difficulty:"RECOGNITION"}` → question detail |
| POST `/api/teacher/chapters/{chapterId}/questions/bulk-publish` | `{requestId:"UUID",allEligible:false,questionIds:["UUID"]}` hoặc `{requestId:"UUID",allEligible:true}` |
| GET `/api/teacher/chapters/{chapterId}/exam-blueprint` | `{ready,validPublished,levels:[{difficulty,required,available}]}` |

Bulk response: `{requestedCount,publishedCount,skippedCount,errors:[{questionId,code}],difficulties:[{difficulty,total,eligiblePublished}]}`. Selected validation trả HTTP 200 với publishedCount=0 và errors, không coi là thành công xuất bản; request sai cấu trúc 400, ownership 404, lifecycle/concurrency/requestId conflict 409. Auth dùng 401/403 hiện có.

Create/Update question bổ sung `difficulty`; list bổ sung `difficulty=CODE` hoặc `unclassified=true`. Summary/detail dùng difficulty nullable cho legacy. Progress bổ sung `difficulties` và giữ trường cũ.

## Excel

Mẫu tải xuống embedded đã đổi thành tám cột: QuestionText, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Difficulty, Explanation. Có dropdown bốn mã tại G2:G1001 và hướng dẫn tiếng Việt. Mẫu tham chiếu cũ trong FC giữ nguyên; mẫu bảy cột bị từ chối, phải tải mẫu mới từ UI/API. Preview hiển thị Difficulty; thiếu/sai mã là lỗi dòng, không tạo token hợp lệ. Confirm kiểm tra lại và lưu mã trên từng câu Draft.

Giữ 4 MiB, 1000 rows, preview 15 phút, kiểm tra ZIP/XML/formula/external relationship, transaction nguyên tử và idempotent confirm. Store import vẫn ở bộ nhớ một process, không phải receipt bền vững của bulk publish. Chi tiết: [QuestionExcelImport.md](QuestionExcelImport.md).

## Exam và Practice

Readiness tính ở backend: đúng 200 Published hợp lệ theo quy tắc cũ và ít nhất 3/3/2/2 mỗi mức. Publish và Start đều kiểm tra; không tự bù nhóm thiếu. Lỗi HTTP 409 có `error.code=insufficientblueprint`, message và `error.blueprint` chi tiết required/available. Không tạo attempt khi thiếu ma trận. Teacher form/detail hiển thị số cần/có, nhóm thiếu và nút cập nhật; readiness pool không thay cho kiểm tra quyền/lifecycle/schedule.

Start giữ kiểm tra eligibility, schedule và một attempt/student. Trong transaction Serializable, tải IDs+Difficulty trong chapter đã kiểm tra, chia nhóm, `RandomNumberGenerator.Shuffle` mỗi nhóm, lấy 3/3/2/2 rồi shuffle thứ tự cuối. Tải content/options chỉ cho 10 IDs được chọn, không lặp câu và không tải toàn bộ ngân hàng ngoài chapter. Snapshot mới có difficulty; lịch sử cũ không có trường này vẫn đọc/chấm được. Không tái tạo historical snapshots hoặc sửa điểm. Student DTO không hiển thị difficulty hay đáp án đúng trước nộp.

Practice vẫn dùng 200 câu, cho phép nhiều lượt, không yêu cầu ma trận 3/3/2/2. Hai lỗi mapping được kiểm thử PostgreSQL phát hiện và sửa kèm: AuditLog IP map về inet của schema; enum trạng thái map sang IN_PROGRESS/AUTO_SUBMITTED thay vì ghép chữ không dấu gạch dưới.

## File triển khai chính

- Domain: QuestionDifficulty, Question.Difficulty nullable.
- Application: QuestionBankContracts/IQuestionBankService, ExamContracts/IExamManagementService, import contracts.
- Infrastructure: SlesDbContext; QuestionBankService/QuestionBulkPublishing; ExcelQuestionReader/QuestionImportService/Template.xlsx; ExamManagementService/ExamBlueprint.
- API: TeacherQuestionsController, TeacherExamsController, StudentExamsController.
- Frontend: teacher management contracts/api/queries/errors; questions difficulty, QuestionForm/QuestionTable/QuestionClassification/QuestionProgress/QuestionPages/QuestionImport; exams ExamBlueprint và form/detail.
- Tests: QuestionUpgradeTests, QuestionUpgradePostgresTests, ExamManagementServiceTests, QuestionImportTests, endpoint role tests; frontend questionUpgrade và regression fixtures.

## Kiểm chứng

Đã chạy ngày 08/11/2026:

- `dotnet restore`, `dotnet build --no-restore`: thành công, 0 warnings/errors.
- `SLES_TEST_POSTGRES_ADMIN='Host=/tmp;Database=postgres;Username=<local-postgres-role>' dotnet test SLES.slnx --no-build --no-restore`: **112/112 đạt, 0 skipped**.
- `dotnet list SLES.slnx package --vulnerable --include-transitive`: không phát hiện vulnerable package ở cả năm projects.
- Frontend `npm run build`, `npm run lint`: đạt; `npm run test -- --run`: **177/177 đạt**; `npm audit`: 0 vulnerabilities.

PostgreSQL integration tạo database test UUID riêng rồi xóa, nạp schema v1.2 thực: up/up/down/up bảo toàn legacy và phân loại, CHECK invalid code, bulk concurrent cùng requestId chỉ một receipt, replay bền vững, lỗi deferred trigger tại COMMIT rollback status/receipt, Exam start đủ 3/3/2/2 và nộp điểm thật. Test tự skip rõ ràng nếu không đặt SLES_TEST_POSTGRES_ADMIN; không coi lần skip là PostgreSQL verification.

Unit/relational tests bổ sung bốn mã, thiếu/sai mức, classification metadata, bulk selected atomic/all skip/owner/rollback, từng nhóm thiếu, publish/start revalidation. Frontend kiểm tra dropdown/filter/legacy, chọn trang, hai mode/confirmation, double click/error/retry cùng ID, blueprint readiness/refetch; toàn bộ Student Exam/Practice regression chạy lại.

Chưa chạy browser E2E với tài khoản teacher/student thật. Frontend tests dùng HTTP adapter giả; endpoint tests dùng TestServer; PostgreSQL test xác minh service và schema thật. Không khẳng định E2E từ các kết quả này.
