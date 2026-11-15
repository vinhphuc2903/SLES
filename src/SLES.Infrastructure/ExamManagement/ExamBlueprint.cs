using System.Data;
using Microsoft.EntityFrameworkCore;
using SLES.Application.ExamManagement;
using SLES.Domain.Entities;
using SLES.Domain.Enums;

namespace SLES.Infrastructure.ExamManagement;

public sealed partial class ExamManagementService
{
    private IQueryable<Question> EligibleQuestions(Guid chapterId) => dbContext.Questions.AsNoTracking().Where(q => q.ChapterId == chapterId && q.DeletedAt == null && q.Status == QuestionStatus.Published && !string.IsNullOrWhiteSpace(q.Content) && q.Options.Count == 4 && q.Options.All(o => !string.IsNullOrWhiteSpace(o.Content)) && q.Options.Count(o => o.IsCorrect) == 1);
    private async Task<ExamBlueprintResponse> BlueprintAsync(Guid chapterId, CancellationToken ct)
    {
        var groups = await EligibleQuestions(chapterId).GroupBy(q => q.Difficulty).Select(g => new { Difficulty = g.Key, Count = g.Count() }).ToListAsync(ct);
        var levels = Enum.GetValues<QuestionDifficulty>().Select(d => new BlueprintLevel(d, d is QuestionDifficulty.RECOGNITION or QuestionDifficulty.COMPREHENSION ? 3 : 2, groups.SingleOrDefault(g => g.Difficulty == d)?.Count ?? 0)).ToArray();
        var total = groups.Sum(g => g.Count);
        return new(total == 200 && levels.All(l => l.Available >= l.Required), total, levels);
    }
    private static ExamResult<T> BlueprintFailure<T>(ExamBlueprintResponse blueprint) => ExamResult<T>.Fail(ExamFailure.InsufficientBlueprint, "Ngân hàng câu hỏi chưa đáp ứng ma trận 3/3/2/2 hoặc chưa có đúng 200 câu đã xuất bản hợp lệ.") with { Blueprint = blueprint };
    public async Task<ExamResult<ExamBlueprintResponse>> GetBlueprintAsync(Guid teacherId, Guid chapterId, CancellationToken ct)
    {
        if (!await dbContext.Chapters.AnyAsync(c => c.Id == chapterId && c.TeacherId == teacherId && c.DeletedAt == null, ct)) return ExamResult<ExamBlueprintResponse>.Fail(ExamFailure.NotFound);
        return ExamResult<ExamBlueprintResponse>.Success(await BlueprintAsync(chapterId, ct));
    }
    public async Task<ExamResult<ExamAttemptResponse>> StartAsync(Guid studentId, Guid examId, CancellationToken ct)
    {
        if (!dbContext.Database.IsRelational()) return await StartCoreAsync(studentId, examId, ct);
        var tx = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        try
        {
            var result = await StartCoreAsync(studentId, examId, ct);
            await tx.CommitAsync(ct); return result;
        }
        catch (Exception e) when (e is DbUpdateException or System.Data.Common.DbException || IsSerializationFailure(e))
        {
            await tx.DisposeAsync(); dbContext.ChangeTracker.Clear();
            var existing = await AttemptGraphAsync(a => a.ExamId == examId && a.StudentId == studentId, ct);
            return existing is not null ? ExamResult<ExamAttemptResponse>.Success(ToAttemptResponse(existing)) : ExamResult<ExamAttemptResponse>.Fail(ExamFailure.Conflict);
        }
        finally { await tx.DisposeAsync(); }
    }
    // Npgsql's execution strategy wraps PostgreSQL serialization/deadlock errors in
    // InvalidOperationException. Recognize SQLSTATE, not arbitrary programming errors.
    private static bool IsSerializationFailure(Exception error)
    {
        for (Exception? current = error; current is not null; current = current.InnerException)
            if (current is Npgsql.PostgresException { SqlState: "40001" or "40P01" }) return true;
        return false;
    }

}
