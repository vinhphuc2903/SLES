using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SLES.Application.BulkManagement;
using SLES.Domain.Constants;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.BulkManagement;

public sealed class BulkManagementService(SlesDbContext db) : IBulkManagementService
{
    public async Task<BulkManagementResult> ExecuteAsync(Guid actorId, BulkResource resource, BulkManagementRequest request, CancellationToken ct)
    {
        if (request.Ids is not { Count: > 0 and <= 100 } || request.Ids.Any(x => !Guid.TryParse(x, out var id) || id == Guid.Empty))
            return new(null, "invalid_request");
        var ids = request.Ids.Select(Guid.Parse).Distinct().ToArray();
        var requiredRole = resource == BulkResource.Teachers ? RoleCodes.Admin : RoleCodes.Teacher;
        if (!await db.Users.AnyAsync(x => x.Id == actorId && x.Role.Code == requiredRole && x.IsActive && x.DeletedAt == null, ct))
            return new(null, "forbidden");
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
        try
        {
            var results = await ApplyAsync(actorId, resource, ids, ct);
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return new(new(ids.Length, results.Count(x => x.Success), results.Count(x => !x.Success), results));
        }
        catch (Exception error) when (IsConflict(error))
        {
            if (transaction is not null) await transaction.RollbackAsync(ct);
            db.ChangeTracker.Clear();
            return new(null, "conflict");
        }
    }

    private static bool IsConflict(Exception error) => error is DbUpdateConcurrencyException ||
        error is PostgresException { SqlState: "40001" or "40P01" } || (error.InnerException is not null && IsConflict(error.InnerException));
    private static BulkItemResult Missing(Guid id) => new(id, false, "not_found", "Không tìm thấy bản ghi trong phạm vi quản lý.");
    private static BulkItemResult Lifecycle(Guid id) => new(id, false, "invalid_transition", "Trạng thái hiện tại không cho phép thao tác này.");
    private static BulkItemResult Dependencies(Guid id) => new(id, false, "has_dependencies", "Bản ghi có dữ liệu liên quan cần được bảo toàn.");

    private async Task<List<BulkItemResult>> ApplyAsync(Guid actor, BulkResource resource, Guid[] ids, CancellationToken ct)
    {
        var result = new List<BulkItemResult>();
        var now = DateTimeOffset.UtcNow;
        if (resource is BulkResource.Teachers or BulkResource.Students)
        {
            var role = resource == BulkResource.Teachers ? RoleCodes.Teacher : RoleCodes.Student;
            var users = await db.Users.Where(x => ids.Contains(x.Id) && x.Role.Code == role && x.DeletedAt == null &&
                (resource == BulkResource.Teachers || x.CreatedByTeacherId == actor)).ToDictionaryAsync(x => x.Id, ct);
            var ownedIds = users.Keys.ToArray();
            var tokens = await db.RefreshTokens.Where(x => ownedIds.Contains(x.UserId) && x.RevokedAt == null).ToListAsync(ct);
            foreach (var id in ids)
            {
                if (!users.TryGetValue(id, out var user)) { result.Add(Missing(id)); continue; }
                if (user.IsActive) { user.IsActive = false; user.UpdatedAt = now; }
                result.Add(new(id, true));
            }
            foreach (var token in tokens) token.RevokedAt = now;
        }
        else if (resource == BulkResource.Questions)
        {
            var questions = await db.Questions.Where(x => ids.Contains(x.Id) && x.Chapter.TeacherId == actor && x.Chapter.DeletedAt == null).ToDictionaryAsync(x => x.Id, ct);
            var ownedIds = questions.Keys.ToArray();
            var practice = await db.PracticeAnswers.Where(x => ownedIds.Contains(x.QuestionId)).Select(x => x.QuestionId).Distinct().ToListAsync(ct);
            var exams = await db.ExamAttemptQuestions.Where(x => ownedIds.Contains(x.SourceQuestionId)).Select(x => x.SourceQuestionId).Distinct().ToListAsync(ct);
            var protectedIds = practice.Concat(exams).ToHashSet();
            foreach (var id in ids)
            {
                if (!questions.TryGetValue(id, out var question)) { result.Add(Missing(id)); continue; }
                if (question.DeletedAt is not null) { result.Add(new(id, true)); continue; }
                if (question.Status != QuestionStatus.Draft) { result.Add(Lifecycle(id)); continue; }
                if (protectedIds.Contains(id)) { result.Add(Dependencies(id)); continue; }
                question.DeletedAt = question.UpdatedAt = now;
                result.Add(new(id, true));
            }
        }
        else if (resource == BulkResource.Chapters)
        {
            var chapters = await db.Chapters.Where(x => ids.Contains(x.Id) && x.TeacherId == actor).ToDictionaryAsync(x => x.Id, ct);
            var ownedIds = chapters.Keys.ToArray();
            // Include deleted questions, exactly as the existing single-delete service does.
            var questions = await db.Questions.Where(x => ownedIds.Contains(x.ChapterId)).Select(x => x.ChapterId).Distinct().ToListAsync(ct);
            var exams = await db.Exams.Where(x => ownedIds.Contains(x.ChapterId)).Select(x => x.ChapterId).Distinct().ToListAsync(ct);
            var practice = await db.PracticeAttempts.Where(x => ownedIds.Contains(x.ChapterId)).Select(x => x.ChapterId).Distinct().ToListAsync(ct);
            var protectedIds = questions.Concat(exams).Concat(practice).ToHashSet();
            foreach (var id in ids)
            {
                if (!chapters.TryGetValue(id, out var chapter)) { result.Add(Missing(id)); continue; }
                if (chapter.DeletedAt is not null) { result.Add(new(id, true)); continue; }
                if (chapter.Status != ChapterStatus.Draft) { result.Add(Lifecycle(id)); continue; }
                if (protectedIds.Contains(id)) { result.Add(Dependencies(id)); continue; }
                chapter.DeletedAt = chapter.UpdatedAt = now;
                result.Add(new(id, true));
            }
        }
        else
        {
            var exams = await db.Exams.Where(x => ids.Contains(x.Id) && x.TeacherId == actor).ToDictionaryAsync(x => x.Id, ct);
            foreach (var id in ids)
            {
                if (!exams.TryGetValue(id, out var exam)) { result.Add(Missing(id)); continue; }
                if (exam.Status == ExamStatus.Cancelled) { result.Add(Lifecycle(id)); continue; }
                if (exam.Status != ExamStatus.Closed) { exam.Status = ExamStatus.Closed; exam.ClosedAt = exam.UpdatedAt = now; }
                result.Add(new(id, true));
            }
        }
        return result;
    }
}
