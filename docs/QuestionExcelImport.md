# Import hàng loạt câu hỏi từ Excel

## Phạm vi và cách dùng

Trong **Teacher → Ngân hàng câu hỏi**, dùng **Tải mẫu Excel**, chọn chương bản nháp rồi bấm **Import Excel**. Chọn file → **Kiểm tra file** → xem tổng/hợp lệ/không hợp lệ và lỗi theo số hàng Excel → **Xác nhận import** → **Nhập tất cả**. Thành công cập nhật danh sách câu hỏi, progress và query chương. Tất cả câu được tạo DRAFT với Difficulty đã chọn hợp lệ; không xuất bản câu hỏi/chương.

Bản nâng cấp Difficulty dùng migration được mô tả trong [QuestionDifficultyAndBulkPublish.md](QuestionDifficultyAndBulkPublish.md). Explanation dùng trường hiện có trên Question. API create thông thường chưa có Explanation; import lưu trường này và hiển thị ở preview, không tự mở rộng DTO review Practice/Exam.

## File mẫu

Bản tải về được nâng cấp từ workbook tham chiếu `FC/SLES_Question_Import_Template.xlsx`, được đóng gói dưới dạng embedded resource `SLES.Infrastructure/QuestionImport/Template.xlsx` để chạy được sau publish và không phụ thuộc đường dẫn tài liệu trên máy dev. Mẫu có sheet Questions, HuongDan, năm câu ví dụ, định dạng, dropdown CorrectAnswer và Difficulty. File tham chiếu cũ trong FC được giữ nguyên; tải mẫu mới từ API/UI để import. Mẫu bảy cột cũ bị từ chối, không tự gán độ khó.

Hàng 1 của Questions phải giữ đúng thứ tự:

| Cột | Header | Quy tắc |
|---|---|---|
| A | QuestionText | Không rỗng |
| B–E | OptionA, OptionB, OptionC, OptionD | Đủ bốn lựa chọn, không rỗng |
| F | CorrectAnswer | Chính xác một ký tự A/B/C/D viết hoa |
| G | Difficulty | RECOGNITION, COMPREHENSION, LOW_APPLICATION hoặc HIGH_APPLICATION |
| H | Explanation | Có thể để trống |

Xóa/thay các câu ví dụ trước khi nhập thực tế. Không đặt ChapterId trong file; chapterId lấy từ route của chương đang chọn. Không dùng công thức hoặc liên kết ngoài. Nội dung chỉ hiển thị dạng văn bản, không chạy HTML/script. Đọc giá trị text/number, không áp dụng số hiển thị theo style hoặc tính công thức; nhập ngày/mã cần giữ nguyên dưới dạng text.

## API contracts

Tất cả endpoint dưới `/api/teacher`, yêu cầu TEACHER. Actor lấy từ JWT.

| Method | Path | Nội dung |
|---|---|---|
| GET | `/questions/import/template` | XLSX attachment `SLES_Question_Import_Template.xlsx` |
| POST | `/chapters/{chapterId}/questions/import/preview` | multipart/form-data, field `file` |
| POST | `/chapters/{chapterId}/questions/import/confirm` | JSON `{ "token": "opaque-token" }`; không nhận rows/validation từ client |
| GET | `/chapters/{chapterId}/questions/import/status?token=...` | Trạng thái cùng token, owner và chapter |

Preview response:

```json
{
  "token": "opaque-token-or-null",
  "expiresAt": "UTC timestamp or null",
  "totalRows": 5,
  "validRows": 5,
  "invalidRows": 0,
  "rows": [
    {
      "rowNumber": 2,
      "questionText": "Câu hỏi",
      "optionA": "A", "optionB": "B", "optionC": "C", "optionD": "D",
      "correctAnswer": "B", "difficulty": "RECOGNITION", "explanation": "Giải thích",
      "errors": []
    }
  ]
}
```

Nếu có bất kỳ dòng lỗi: trả đầy đủ các dòng đã đọc và lỗi của từng dòng, token/expiresAt null, không ghi DB. Workbook không hợp lệ về cấu trúc/header/bảo mật trả 400 thay vì preview một phần. UI phân trang preview 20 dòng ở client, không cắt bỏ các lỗi của trang sau.

Confirm/status response: `{state, importedCount, message}` với state `Ready`, `Processing`, `Completed`, `Failed`, `Unknown`. Completed trả số đã nhập. Failed là lỗi trước commit, transaction đã hủy. Unknown là lỗi xảy ra trong lúc commit: không khẳng định thành công/thất bại và không thực thi lại token. Processing cung cấp nút kiểm tra, không tự gửi lại confirm trong vòng lặp.

HTTP 401/403 theo authentication/role; 404 cho chapter/preview ngoài owner hoặc không tồn tại/hết hạn; 409 cho chapter không Draft hoặc hết dung lượng preview; 400 cho file/validation; request vượt multipart limit có thể bị framework trả 413/400 trước controller. Failure nghiệp vụ dùng `{error:{code,message}}`; terminal status Failed/Unknown trả 200 với trạng thái rõ ràng, UI không coi là thành công.

## Validation và giới hạn tài nguyên

- Chỉ `.xlsx`; kiểm tra package ZIP/Open XML thực tế, không dựa vào tên file/MIME.
- Upload tối đa **4 MiB**, request multipart tối đa 4 MiB + 64 KiB overhead.
- Tối đa **1000 hàng dữ liệu**, vị trí hàng không vượt 1001 gồm header. Hàng hoàn toàn trống bỏ qua nhưng vẫn chịu giới hạn vị trí/row resource. Không có giới hạn import 200 câu.
- Giới hạn ZIP 128 entries, tổng khai báo giải nén 20 MiB, mỗi part 8 MiB; chặn compression ratio >200 đối với part trên 1 MiB.
- XML cấm DTD, XmlResolver null, MaxCharactersInDocument và MaxCharactersInPart 20 MiB.
- Tối đa 32767 ký tự mỗi ô, 2 triệu ký tự toàn nội dung đọc. Đây là giới hạn tài nguyên import/Excel: DTO question hiện có và cột TEXT chưa quy định giới hạn độ dài riêng; không thay đổi quy tắc API create/update thông thường.
- Header phải chính xác ở A1:H1; reject extra columns, duplicate cells/rows, invalid references/shared strings. Trim text; lỗi row có Excel row number. Difficulty trống hoặc không đúng một trong bốn mã viết hoa là lỗi dòng; confirm kiểm tra lại mã trước INSERT.
- Tái sử dụng `QuestionBankService.Validate` và `AddOptions`: nonempty content, bốn options, một correct; labels A–D, displayOrder 1–4 do server đặt.
- Recheck chapter tồn tại, chưa xóa, đúng teacher và Draft ở preview và confirm.
- Reject binary/embedded parts, macro-enabled content types, external relationships/references, connections, defined names và cell formula `<f>` ở mọi XML part. Không evaluate formula. List validation `formula1` tĩnh trong mẫu được giữ.
- Workbook có ảnh/embedded objects/defined names hoặc external hyperlinks không được hỗ trợ; dùng mẫu đơn giản cung cấp.

## Transaction và idempotency

Preview lưu rows đã parse/validate ở singleton server; response không được dùng làm dữ liệu confirm. Token ngẫu nhiên 256-bit, gắn teacher + chapter, hết hạn 15 phút. Không log hoặc persist workbook lên disk. Bộ nhớ giới hạn 32 entries toàn API, 3 entries mỗi teacher, 8 triệu ký tự nội dung lưu. Entries hết hạn được dọn khi thêm preview mới; vẫn không thể đọc/xác nhận sau hạn. Giới hạn ba entries gồm cả receipt đã hoàn tất trong thời gian TTL, để giữ khả năng replay an toàn.

Confirm chuyển Ready → Processing atomically trong lock của entry trước khi thực hiện DB. Request đồng thời nhận Processing; request sau Completed nhận lại receipt Completed, không INSERT lần hai. Dữ liệu row được giải phóng khi terminal. Failed/Unknown cũng không thực hiện lại cùng token. Không deduplicate nội dung giữa hai file/preview khác nhau: người dùng chủ động tạo preview mới có thể nhập lại cùng câu.

Với relational DB: mở transaction **Serializable**, kiểm tra lại chapter, tạo toàn bộ questions/options, SaveChanges một lần rồi commit. Lỗi trước commit dispose/rollback transaction, clear tracking, trả Failed. Lỗi trong commit giữ Unknown để không tự retry một giao dịch có thể đã thành công. Không insert theo từng dòng riêng lẻ, không gọi create API N lần. Quy tắc chapter publication đúng 200 valid PUBLISHED giữ nguyên; import chỉ thêm Draft.

UI khóa double click, không tự retry mutations; khi mất phản hồi confirm gọi status. Nếu status không truy cập được, khóa file/confirm và cho kiểm tra lại. Nếu thấy Ready thì mới cho xác nhận lại cùng token; Completed làm mới queries. UI nhắc giữ trang mở trong lúc confirm.

### Giới hạn triển khai

Store ở bộ nhớ **một tiến trình**, không phải receipt bền vững. Restart làm mất preview và receipt. Chạy nhiều instance cần sticky routing tới instance tạo preview; node khác không biết token và không thực hiện import đó. Nếu process/network chết quanh commit hoặc token hết hạn trước khi lấy receipt, phải kiểm tra ngân hàng trước khi tạo preview mới. Chưa có distributed/durable idempotency store vì không thay schema hoặc thêm dịch vụ hạ tầng. Không tự suy luận rằng 404 sau restart nghĩa là import chưa xảy ra.

## Dependency, license và security

- Production thêm `DocumentFormat.OpenXml` **3.5.1**; dependencies được restore gồm `DocumentFormat.OpenXml.Framework` 3.5.1 và `System.IO.Packaging` 10.0.2. SDK tương thích project net10.0, không đổi TargetFramework.
- Chọn Open XML SDK để đọc package mà không cần Excel hoặc engine tính công thức. Dự án dùng [MIT license](https://github.com/dotnet/Open-XML-SDK/blob/main/LICENSE); [NuGet package/version](https://www.nuget.org/packages/DocumentFormat.OpenXml/3.5.1), [repository và security reporting](https://github.com/dotnet/Open-XML-SDK). Không dùng EPPlus có yêu cầu license khác.
- Test-only thêm `Microsoft.EntityFrameworkCore.Sqlite` **10.0.14** để kiểm chứng rollback trên relational database cô lập. Không có SQLite trong project production, không thay provider PostgreSQL.
- Không thay đổi package không liên quan. Frontend không thêm dependency. Các endpoint bật no-store; trả text an toàn, không raw HTML. JWT/refresh/logout dùng client và guards hiện có.

## File thay đổi

Mới:
- Application: `QuestionBank/QuestionImportContracts.cs`.
- Infrastructure: `QuestionImport/ExcelQuestionReader.cs`, `ImportPreviewStore.cs`, `QuestionImportService.cs`, `Template.xlsx`.
- API: `Controllers/TeacherQuestionImportsController.cs`.
- Frontend: `features/teacher/questions/QuestionImport.tsx`.
- Tests: `SLES.UnitTests/QuestionImport/QuestionImportTests.cs`, `features/teacher/test/questionImport.test.tsx`.
- Tài liệu này.

Cập nhật:
- Infrastructure csproj: SDK và embedded template.
- QuestionBankService: chia sẻ Validate/AddOptions nội bộ assembly, giữ nguyên behavior.
- Program.cs: đăng ký DI cho service/parser/store.
- QuestionPages.tsx: download trên ngân hàng, import trên chương Draft.
- UnitTests csproj: SQLite test provider.
- AdminSubjectEndpointsTests: role tests cho template/preview/confirm/status và DI tương ứng.
- Frontend README, BE/QuestionBank.md.

## Kiểm thử

Backend có 24 cases mới: đọc file mẫu (5 rows/Explanation), missing header, nội dung/đáp án trống, CorrectAnswer sai, field/file limits, XLSX giả, formula/external/macro/definedName, 201 rows được chấp nhận và 1001 bị chặn, success Draft/options, duplicate/concurrent confirm, rollback sau INSERT trước COMMIT trên SQLite, all-or-nothing validation, ownership/lifecycle recheck, expired token, wrong chapter, capacity, endpoint 401/403/teacher.

Frontend có 16 cases mới: template download, multipart preview/options/explanation, confirmation token-only, query/progress refresh, no auto-publish, invalid rows/files/size, server error, double click, timeout/status recovery, failed transaction, file change, published chapter, wrong roles.

Lệnh:

```sh
# tại frontend
npm run build
npm run lint
npm run test -- --run
npm audit
# tại project root
dotnet restore SLES.slnx
dotnet build SLES.slnx --no-restore
dotnet test SLES.slnx --no-build --no-restore
dotnet list SLES.slnx package --vulnerable --include-transitive
```

Kết quả ban đầu của chức năng import: 93 backend và 168 frontend tests đạt. Bản nâng cấp Difficulty: **112 backend tests đạt**, gồm PostgreSQL integration, và **177 frontend tests đạt**; build/lint đạt. Workbook embedded hiện có tám cột và không còn cùng checksum với mẫu tham chiếu cũ.

Kiểm thử import transaction riêng dùng SQLite; integration PostgreSQL mới kiểm chứng migration, bulk publish concurrent/rollback và Exam (không phải import end-to-end). Chưa chạy browser E2E với tài khoản teacher. Frontend tests dùng HTTP adapters giả, backend endpoint tests dùng TestServer. Xem [báo cáo nâng cấp](QuestionDifficultyAndBulkPublish.md) về phạm vi và giới hạn.
