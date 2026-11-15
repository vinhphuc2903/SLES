using System.Data;
using System.Xml;
using DocumentFormat.OpenXml.Packaging;
using Microsoft.EntityFrameworkCore;
using SLES.Application.QuestionBank;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.QuestionBank;

namespace SLES.Infrastructure.QuestionImport;

public sealed class QuestionImportService(SlesDbContext db, ImportPreviewStore store, ExcelQuestionReader reader) : IQuestionImportService
{
    public byte[] Template()
    {
        using var input = typeof(QuestionImportService).Assembly.GetManifestResourceStream("SLES.Infrastructure.QuestionImport.Template.xlsx")!;
        using var output = new MemoryStream(); input.CopyTo(output); return output.ToArray();
    }
    public async Task<QuestionResult<ImportPreview>> PreviewAsync(Guid teacherId, Guid chapterId, string filename, Stream file, CancellationToken ct)
    {
        var failure = await CheckChapter(teacherId, chapterId, ct);
        if (failure is not null) return QuestionResult<ImportPreview>.Fail(failure.Value);
        if (!Path.GetExtension(filename).Equals(".xlsx", StringComparison.OrdinalIgnoreCase)) return QuestionResult<ImportPreview>.Fail(QuestionFailure.InvalidRequest, "Chỉ nhận file .xlsx.");
        try
        {
            using var buffer = new MemoryStream(); var chunk = new byte[81920]; int count;
            while ((count = await file.ReadAsync(chunk, ct)) > 0) { if (buffer.Length + count > ExcelQuestionReader.MaxBytes) return QuestionResult<ImportPreview>.Fail(QuestionFailure.InvalidRequest, "File vượt 4 MiB."); await buffer.WriteAsync(chunk.AsMemory(0, count), ct); }
            var rows = reader.Read(buffer.ToArray()); var valid = rows.Count(r => r.Errors.Count == 0);
            if (valid != rows.Length) return QuestionResult<ImportPreview>.Success(new(null, null, rows.Length, valid, rows.Length - valid, rows));
            var entry = store.Add(teacherId, chapterId, rows);
            if (entry is null) return QuestionResult<ImportPreview>.Fail(QuestionFailure.Conflict, "Bộ nhớ preview đã đầy. Vui lòng đợi preview cũ hết hạn sau 15 phút.");
            return QuestionResult<ImportPreview>.Success(new(entry.Value.Token, entry.Value.ExpiresAt, rows.Length, valid, 0, rows));
        }
        catch (Exception e) when (e is InvalidDataException or XmlException or OpenXmlPackageException or ArgumentException or FormatException or InvalidOperationException or IOException)
        { return QuestionResult<ImportPreview>.Fail(QuestionFailure.InvalidRequest, e is InvalidDataException ? e.Message : "Workbook hỏng hoặc có cấu trúc không hỗ trợ."); }
    }
    private async Task<QuestionFailure?> CheckChapter(Guid teacher, Guid chapter, CancellationToken ct)
    {
        var owned = await db.Chapters.AsNoTracking().SingleOrDefaultAsync(x => x.Id == chapter && x.TeacherId == teacher && x.DeletedAt == null, ct);
        return owned is null ? QuestionFailure.NotFound : owned.Status != ChapterStatus.Draft ? QuestionFailure.NotEditable : null;
    }
    public QuestionResult<ImportStatus> Status(Guid teacherId, Guid chapterId, string token)
    {
        var e = store.Find(teacherId, chapterId, token);
        return e is null ? QuestionResult<ImportStatus>.Fail(QuestionFailure.NotFound, "Preview không tồn tại hoặc đã hết hạn.") : QuestionResult<ImportStatus>.Success(store.Read(e));
    }
    public async Task<QuestionResult<ImportStatus>> ConfirmAsync(Guid teacherId, Guid chapterId, string token, CancellationToken ct)
    {
        var e = store.Find(teacherId, chapterId, token);
        if (e is null) return QuestionResult<ImportStatus>.Fail(QuestionFailure.NotFound, "Preview không tồn tại hoặc đã hết hạn.");
        if (!store.Begin(e)) return QuestionResult<ImportStatus>.Success(store.Read(e));
        var committing = false;
        try
        {
            await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
            var failure = await CheckChapter(teacherId, chapterId, ct);
            if (failure is not null) { store.Finish(e, new("Failed", 0, "Chương không còn là bản nháp thuộc giáo viên. Không nhập câu hỏi.")); return QuestionResult<ImportStatus>.Fail(failure.Value); }
            var now = DateTimeOffset.UtcNow;
            foreach (var row in e.Rows)
            {
                var options = new[] { row.OptionA, row.OptionB, row.OptionC, row.OptionD }.Select((text, i) => new QuestionOptionRequest(text, row.CorrectAnswer == ((char)('A' + i)).ToString())).ToArray();
                if (!Enum.TryParse<QuestionDifficulty>(row.Difficulty, out var difficulty) || !Enum.IsDefined(difficulty) || row.Difficulty != difficulty.ToString() || row.Errors.Count > 0 || QuestionBankService.Validate(row.QuestionText, options) is not null) throw new InvalidDataException("Preview không hợp lệ.");
                var question = new Question { ChapterId = chapterId, Content = row.QuestionText, Explanation = row.Explanation, Status = QuestionStatus.Draft, Difficulty = difficulty, CreatedAt = now, UpdatedAt = now };
                QuestionBankService.AddOptions(question, options); db.Questions.Add(question);
            }
            var imported = e.Rows.Length;
            await db.SaveChangesAsync(ct);
            committing = true;
            if (tx is not null) await tx.CommitAsync(ct);
            store.Finish(e, new("Completed", imported, null));
        }
        catch (Exception) when (!committing)
        {
            db.ChangeTracker.Clear(); store.Finish(e, new("Failed", 0, "Import thất bại; giao dịch đã bị hủy. Không nhập câu hỏi."));
        }
        catch (Exception)
        {
            db.ChangeTracker.Clear(); store.Finish(e, new("Unknown", 0, "Chưa xác định được kết quả commit. Kiểm tra ngân hàng câu hỏi trước khi tạo preview mới; không xác nhận lại để nhập thêm."));
        }
        return QuestionResult<ImportStatus>.Success(store.Read(e));
    }
}
