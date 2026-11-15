# Phase 12A — End-to-end Testing & Bug Fixing

Ngày thực hiện: **10/11/2026**, Asia/Ho_Chi_Minh.

## Kết quả cuối

| Hạng mục | Passed | Failed | Blocked / skipped |
|---|---:|---:|---:|
| E2E browser + API thật | **15** | **0** | **0** |
| Frontend unit/component (Vitest) | **184** | **0** | **0** |
| Backend unit/integration | **113** | **0** | **0** |

Trong 15 kịch bản E2E: **11 kịch bản có Chromium thao tác UI thật**, bốn kịch bản API-only (09, 10, 11, 13). Một số kịch bản browser kết hợp API/SQL để chuẩn bị và đối chiếu. Không gọi cả 15 là thao tác UI thuần túy.

Frontend production build, TypeScript (bao gồm test E2E), ESLint và backend build đều đạt; backend 0 warnings/errors. `npm audit`: 0 vulnerabilities. NuGet vulnerability scan gồm transitive: không phát hiện vulnerable packages ở cả năm projects. Đây là kiểm tra dependency, không phải penetration test.

Lần chạy cuối Playwright: 15 passed, 0 skipped, 0 unexpected, 0 flaky, **35,9 giây**, không retry test. Các lần tái hiện trước sửa có lỗi được ghi ở phần bugs; không tính những lần đó là pass.

## Môi trường thực thi

- macOS ARM64, Node 22.13.1, .NET SDK 10.0.403 / target net10.0.
- PostgreSQL 18.6 local qua Unix socket.
- Playwright Test **1.65.0**, Chromium headless shell **158.0.8127.18**.
- React/Vite thật, ASP.NET Core API thật, JWT/cookies thật, HTTP qua Vite proxy và Kestrel; không mock HTTP response nghiệp vụ trong E2E.
- API/frontend dùng port động riêng; runner không tái sử dụng process localhost:5169/5173.
- Chỉ fault injection tại transport: nộp bài đã tới server rồi làm mất response; request answer đang truyền được tiếp tục sau khi đổi deadline của test attempt.
- Không thay đồng hồ hệ điều hành hoặc đồng hồ database.

## Cách chạy lại

Yêu cầu có Python 3, psql/createdb/dropdb, PostgreSQL local và role có quyền CREATEDB; database schema dùng extension pgcrypto. Mặc định socket `/tmp`, role lấy từ USER. Có thể đặt `SLES_E2E_PGHOST` / `SLES_E2E_PGUSER` phù hợp môi trường PostgreSQL local.

```sh
# Project root
dotnet restore SLES.slnx
cd frontend
npm ci
npx playwright install chromium --only-shell
npm run test:e2e
```

Runner tự build backend, tạo database và processes, chờ readiness có điều kiện, chạy Playwright rồi cleanup. Không dùng sleep cố định trong kịch bản nghiệp vụ. Cài browser theo [hướng dẫn Playwright](https://playwright.dev/docs/browsers).

Các kiểm tra bổ sung đã chạy:

```sh
# Frontend
npm run build
npm run lint
npm run test -- --run
npm audit
# Root
dotnet build SLES.slnx --no-restore
SLES_TEST_POSTGRES_ADMIN='Host=/tmp;Database=postgres;Username=<local-postgres-role>' dotnet test SLES.slnx --no-build --no-restore
dotnet list SLES.slnx package --vulnerable --include-transitive
```

Role trong chuỗi kết nối integration là role máy dev đã dùng để kiểm thử, cần thay theo máy chạy. Nếu không đặt SLES_TEST_POSTGRES_ADMIN, hai PostgreSQL integration tests sẽ skip rõ ràng; không được coi đó là bằng chứng PostgreSQL pass.

Kết quả máy đọc được: `frontend/test-results/e2e-results.json` (gitignored, được thay thế ở lần chạy sau). Khi thất bại, runner lưu log lỗi server không bật EF sensitive values. Không lưu auth storage state, HAR, trace, screenshot/video chứa credential. Trang được chuyển về about:blank sau mỗi test để error-context không chụp dialog mật khẩu tạm thời.

## Cô lập dữ liệu và cleanup

Mỗi lần chạy tạo database **sles_e2e_<UUID>**, nạp schema v1.2 và migration difficulty đã có. Không tạo migration mới, không đổi Domain Entities. `sles_db` không bị reset, xóa, seed hoặc dùng cho các bài kiểm thử. API local hiện có không bị dừng/redeploy trong Phase 12A.

Mật khẩu Admin bootstrap và JWT signing key sinh ngẫu nhiên trong process; password tạm thời từ API chỉ dùng trong bộ nhớ để đổi mật khẩu. Không ghi credential vào source hoặc log. Username/dữ liệu nghiệp vụ cố định, ID do API cấp; phân bố câu hỏi cố định.

Dữ liệu nền:

- Một Admin, một Teacher, ba Student thuộc **GRADE_10**.
- Môn riêng Hóa học 10, hai chương với theory.
- Mỗi chương 200 câu, 60 RECOGNITION / 60 COMPREHENSION / 40 LOW_APPLICATION / 40 HIGH_APPLICATION.
- Chương 1 được import/publish qua API trong setup; chương 2 được import/bulk publish qua browser ở scenario 03 để kiểm tra đúng workflow thay vì chèn thẳng questions vào DB.
- Một Exam published, hai Student Granted, Student thứ ba không được cấp lúc đầu.
- Các ca quản trị, concurrency và deadline tạo thêm teacher/student/chapter/exam riêng trong cùng database test. Schema nền có sẵn danh mục chuẩn; môn test là record riêng.

SQL trực tiếp chỉ dùng cho: nạp schema/migration, đối chiếu persistence/snapshot/counts, tạo tình huống thiếu difficulty, hạn exam/attempt và refresh token. Deadline/expiry chỉ đổi các ID test vừa tạo. Câu hỏi/options/thành viên/quyền chủ yếu được tạo qua API thật.

Cleanup trong finally: dừng process groups do runner tạo, drop đúng database UUID do runner sở hữu. Helper SQL từ chối database không có prefix sles_e2e_. Runner tự sinh tên DB; không nhận tên `sles_db` từ tham số. Các database integration .NET cũng tạo/xóa UUID riêng.

## Phạm vi nghiệp vụ đã đối chiếu

[API inventory](E2EEndpointInventory12A.md) liệt kê controller/method/route/authorization để phân biệt inventory với coverage thực thi.

- Admin quản lý teacher/subject; Teacher quản lý student/chapter/question/exam thuộc mình; Student chỉ xem nội dung Published trong teacher/grade của mình, thi khi Granted và đúng lịch.
- Quan hệ ownership teacher/student/chapter/exam/permission được giữ, cùng unique constraint một Exam attempt/student và một answer/attempt-question.
- Difficulty nullable cho legacy, câu mới bắt buộc bốn mã ổn định. Không tự ánh xạ legacy; import thiếu/sai mã bị từ chối.
- Bulk publish selected atomic, all chỉ Draft hợp lệ; receipt requestId durable trong audit_logs. E2E kiểm tra all qua UI; selected/invalid/receipt replay/rollback được full regression hiện có kiểm tra.
- Chapter cần đúng 200 Published hợp lệ; Exam mới đúng 3/3/2/2; Practice 200 câu và không giới hạn lượt.
- Exam có snapshot bất biến và server deadline; repeat start/submit không tạo bài mới/chấm điểm mới tùy tiện. Đáp án đúng không có trong paper response trước nộp.

## Ma trận 15 kịch bản

| # | Hình thức | Nội dung và bằng chứng | Kết quả |
|---|---|---|---|
| 01 | Browser + HTTP | Admin login, tạo Teacher trên UI; edit, deactivate/activate, login inactive 401; update Subject; Student gọi Admin 403; Teacher khác đọc permissions 404 | Passed |
| 02 | Browser | Teacher login, tạo Student, login password tạm, redirect change-password, đổi password và trở về login | Passed |
| 03 | Browser + SQL/HTTP | Excel sai difficulty có lỗi preview/khóa confirm; Excel đúng 200 rows, confirm import, PostgreSQL đúng 200 rows; bulk publish qua UI, counts 60/60/40/40; publish Chapter qua API | Passed |
| 04 | Browser | Teacher đọc blueprint 3/3/2/2 và pool60/60/40/40, cấp rồi thu hồi quyền Student3, UI refetch | Passed |
| 05 | Browser | Student thấy Subject Published, mở Chapter, đọc theory | Passed |
| 06 | Browser + HTTP | Start Practice đủ200; chọn đúng một câu, lưu, reload giữ lựa chọn; submit/review/history; score0.05; attempt tiếp theo có ID khác | Passed |
| 07 | Browser + SQL/HTTP | Exam đủ10, snapshot đúng3/3/2/2, 10sourceIDs khác nhau; paper không có isCorrect/snapshot/difficulty; save/reload giữ đáp án và expiresAt; server nhận submit nhưng response timeout, UI reconcile về result; score1; duplicate submit/start không đổi kết quả/attemptID | Passed |
| 08 | Browser | Teacher Results hiển thị1/10, mở bài làm snapshot | Passed |
| 09 | HTTP + SQL | Hai Start đồng thời cùng attemptID; first answer INSERT cạnh tranh chỉ204/409, ít nhất một thành công; hai update tiếp theo204; đáp án lưu là một lựa chọn được gửi; hết hạn save409 và AutoSubmitted | Passed |
| 10 | HTTP + SQL | Revoked Student không thấy exam; start bị từ chối; future/expired start404; thiếu HIGH_APPLICATION chặn Publish409 insufficientblueprint | Passed |
| 11 | HTTP + SQL | Hai confirm Excel cùng token; ít nhất một Completed, DB đúng200 câu, không nhân đôi | Passed |
| 12 | Browser + SQL | Làm refresh token test hết hạn rồi reload: session hết và về login | Passed |
| 13 | HTTP | GET /student/exams/available trả200, có exam được cấp quyền | Passed |
| 14 | Browser | Teacher tạo Chapter, sửa theory, lưu rồi reload giữ nội dung | Passed |
| 15 | Browser + SQL/HTTP | UI bắt đầu lưu đáp án, request bị giữ tại transport; đổi test deadline sang quá hạn rồi cho request đi tiếp:409, UI reconcile sang result AutoSubmitted,0đáp án/0điểm | Passed |

Scenario15 kiểm tra deadline vượt qua khi request đang truyền trước khi tới handler; không khẳng định đã mô phỏng mọi interleaving trong lúc database commit. Các assertion dựa trên response/locator/persistence, không dựa thời gian chờ tùy ý.

## Bugs tìm thấy và sửa

### 1. Concurrent Exam Start trả 500

Tái hiện bằng hai HTTP POST Start đồng thời và regression service với hai DbContexts PostgreSQL thật. PostgreSQL Serializable báo SQLSTATE40001; Npgsql execution strategy bọc trong InvalidOperationException, nên catch DbUpdateException/DbException cũ không xử lý.

Sửa `ExamBlueprint.cs`: nhận diện SQLSTATE40001/40P01 trong exception chain, rollback/dispose transaction, clear tracker rồi tìm attempt đã commit; trả paper hiện có hoặc Conflict theo nhánh phục hồi sẵn có. Không catch mọi InvalidOperationException và không tự retry INSERT. Regression xác minh cùng attemptID, đúng10snapshot.

### 2. GET /student/exams/available trả 500

EF không dịch được OrderBy trên constructor projection StudentAvailableExamResponse. Tái hiện bằng API thật sau khi Student đã được cấp quyền.

Sửa `ExamManagementService.GetAvailableAsync`: giữ query exam/chapter, OrderBy StartAt + Id, Skip/Take trước Select DTO. Không client-side full-table evaluation. E2E13 và PostgreSQL regression kiểm tra endpoint/service hoạt động.

### 3. Concurrent first answer save trả 500

Hai request cùng đọc Answer=null rồi cùng INSERT; request sau vi phạm `exam_answers_exam_attempt_question_id_key`, SQLSTATE23505.

Sửa `SaveAnswerAsync`: chỉ bắt unique violation của constraint này, clear tracker và trả409 Conflict. Không ghi đè đáp án thắng, không che lỗi DB khác, không đổi quy tắc điểm/deadline. Client hiện có xử lý409 bằng kiểm tra lại trạng thái và cho retry. E2E09 và PostgreSQL regression xác minh không500, đúng một answer row.

Các mismatch của test ban đầu (HTTP tạo tài khoản200, inactive login401, nhãn nút xác nhận) đã được sửa trong harness theo contract thực tế; không tính chúng là bugs nghiệp vụ.

## Regression và PostgreSQL

113 backend tests bao gồm hai PostgreSQL test cases thực thi (0 skipped):

- QuestionUpgradePostgresTests: schema up/down, constraint, bulk publish concurrency/rollback, blueprint/start/scoring, permissions/revoke; mở rộng kiểm tra available, concurrent start và first-answer race.
- ExamPermissionsPostgresTests: Kestrel + JWT login thật, users/filter/permissions/grant/bulk/revoke/ownership/grade/inactive.

Các tests còn lại gồm unit/EF InMemory/SQLite/TestServer theo hạ tầng cũ; không gọi toàn bộ113 là PostgreSQL tests. E2E15 dùng API process thật và database PostgreSQL riêng, độc lập với hai test cases .NET trên.

184 frontend tests vẫn chạy Vitest/HTTP adapters giả. Playwright testDir tách khỏi Vitest và được type-check trong build, tránh lẫn kết quả mocked với E2E. Dependency mới chỉ @playwright/test và packages Playwright liên quan ở devDependencies.

## File thay đổi

- Infrastructure: `ExamManagement/ExamBlueprint.cs`, `ExamManagement/ExamManagementService.cs`.
- Regression: `tests/SLES.UnitTests/Integration/QuestionUpgradePostgresTests.cs`.
- Frontend tooling: package.json/package-lock.json, playwright.config.ts, vite.config.ts (exclude E2E khỏi Vitest), tsconfig.node.json, .gitignore, README.
- E2E: `frontend/e2e/run.py`, `helpers.ts`, `workbook.py`, `system.spec.ts`.
- Tài liệu này và `E2EEndpointInventory12A.md`.

Không thêm feature nghiệp vụ, không đổi .NET target, schema hay Domain Entities.

## Giới hạn và readiness

**Có thể đưa sang staging/UAT** cho các luồng đã kiểm chứng. Chưa đủ bằng chứng để xác nhận production-ready toàn hệ thống chỉ từ Phase12A này.

Chưa thực thi: Firefox/WebKit/mobile browser; load/soak test; đa instance; triển khai HTTPS/reverse proxy; production backup/restore và observability; pentest. Không khẳng định mọi endpoint trong inventory đã được browser kiểm tra. Suite serial có phụ thuộc giữa các workflow; nếu một ca fail, các ca sau được báo not run và cần chạy lại sau sửa.

E2E dùng môi trường Development cô lập để bootstrap; cấu hình production cần được kiểm tra riêng. Preview Excel vẫn ở bộ nhớ một process theo thiết kế hiện có; Phase12A không bổ sung distributed store. Interleaving đồng thời giữa save và submit/deadline ở mức database chưa được stress-test toàn diện.

Các scan không phát hiện vulnerable dependency và các ca role/ownership/no-answer-leak đã đạt trong phạm vi trên. Không có kết luận kiểm toán bảo mật toàn diện. Bản sửa nằm trong source/build; API local phục vụ sles_db không bị restart/redeploy bởi test runner.
