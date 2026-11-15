using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SLES.Application.QuestionBank;
using SLES.Domain.Entities;
using SLES.Domain.Enums;

namespace SLES.Infrastructure.QuestionBank;

public sealed partial class QuestionBankService
{
    internal static bool ValidDifficulty(QuestionDifficulty? difficulty) => difficulty.HasValue && Enum.IsDefined(difficulty.Value);
    internal static IReadOnlyList<DifficultyCount> DifficultyCounts(IEnumerable<Question> rows) => Enum.GetValues<QuestionDifficulty>().Select(d => (QuestionDifficulty?)d).Append(null)
        .Select(d => new DifficultyCount(d, rows.Count(x => x.Difficulty == d), d is null ? 0 : rows.Count(x => x.Difficulty == d && x.Status == QuestionStatus.Published && Validate(x.Content, x.Options.Select(o => new QuestionOptionRequest(o.Content, o.IsCorrect)).ToArray()) is null))).ToArray();

    public async Task<QuestionResult<QuestionDetailResponse>> ClassifyAsync(Guid teacherId, Guid questionId, ClassifyQuestionRequest request, CancellationToken ct)
    {
        if (!ValidDifficulty(request.Difficulty)) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.InvalidDifficulty);
        var question = await OwnedQuestionAsync(teacherId, questionId, true, ct);
        if (question is null) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.NotFound);
        // Metadata only: legacy published questions may be classified without touching historical content/options.
        if (question.Status == QuestionStatus.Archived || question.Chapter.Status == ChapterStatus.Archived || (question.Status == QuestionStatus.Published && question.Difficulty is not null)) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.NotEditable);
        question.Difficulty = request.Difficulty; question.UpdatedAt = DateTimeOffset.UtcNow;
        try { await dbContext.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { dbContext.ChangeTracker.Clear(); return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.Conflict); }
        return QuestionResult<QuestionDetailResponse>.Success(ToDetail(question));
    }

    private sealed record PublishReceipt(string Fingerprint, BulkPublishResponse Result);
    public async Task<QuestionResult<BulkPublishResponse>> BulkPublishAsync(Guid teacherId, Guid chapterId, BulkPublishRequest request, CancellationToken ct)
    {
        var ids = request.QuestionIds?.Distinct().Order().ToArray() ?? [];
        if (request.RequestId == Guid.Empty || (!request.AllEligible && (ids.Length == 0 || ids.Length > 1000)) || (request.AllEligible && ids.Length > 0)) return QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.InvalidRequest);
        if (!await dbContext.Chapters.AsNoTracking().AnyAsync(c => c.Id == chapterId && c.TeacherId == teacherId && c.DeletedAt == null, ct)) return QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.NotFound);
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.AllEligible + ":" + string.Join(",", ids))));
        var existing = await dbContext.AuditLogs.AsNoTracking().SingleOrDefaultAsync(a => a.Id == request.RequestId, ct);
        if (existing is not null)
        {
            if (existing.UserId != teacherId || existing.EntityId != chapterId || existing.Action != "QUESTION_BULK_PUBLISH") return QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.Conflict);
            var receipt = existing.NewValues?.Deserialize<PublishReceipt>();
            return receipt?.Fingerprint == fingerprint ? QuestionResult<BulkPublishResponse>.Success(receipt.Result) : QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.Conflict);
        }
        try
        {
            await using var tx = dbContext.Database.IsRelational() ? await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
            var chapter = await OwnedChapterAsync(teacherId, chapterId, ct);
            if (chapter is null) return QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.NotFound);
            if (chapter.Status != ChapterStatus.Draft) return QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.NotEditable);
            var query = dbContext.Questions.Include(q => q.Options).Where(q => q.ChapterId == chapterId && q.DeletedAt == null);
            var all = await query.ToListAsync(ct);
            var candidates = request.AllEligible ? all.Where(q => q.Status == QuestionStatus.Draft).ToList() : all.Where(q => ids.Contains(q.Id)).ToList();
            var errors = new List<BulkPublishError>();
            if (!request.AllEligible) errors.AddRange(ids.Except(candidates.Select(q => q.Id)).Select(id => new BulkPublishError(id, "not_found_in_chapter")));
            foreach (var q in candidates)
            {
                var code = q.Status != QuestionStatus.Draft ? "not_draft" : !ValidDifficulty(q.Difficulty) ? "invaliddifficulty" : Validate(q.Content, q.Options.Select(o => new QuestionOptionRequest(o.Content, o.IsCorrect)).ToArray())?.ToString().ToLowerInvariant();
                if (code is not null) errors.Add(new(q.Id, code));
            }
            var requested = request.AllEligible ? candidates.Count : ids.Length;
            if (!request.AllEligible && errors.Count > 0) return QuestionResult<BulkPublishResponse>.Success(new(requested, 0, requested, errors, DifficultyCounts(all)));
            var excluded = errors.Select(e => e.QuestionId).ToHashSet();
            foreach (var q in candidates.Where(q => !excluded.Contains(q.Id))) { q.Status = QuestionStatus.Published; q.UpdatedAt = DateTimeOffset.UtcNow; }
            var result = new BulkPublishResponse(requested, candidates.Count - errors.Count, errors.Count, errors, DifficultyCounts(all));
            // The receipt is durable and commits atomically with status updates. Its primary key guards request replay across instances/restarts.
            dbContext.AuditLogs.Add(new AuditLog { Id = request.RequestId, UserId = teacherId, Action = "QUESTION_BULK_PUBLISH", EntityType = "Chapter", EntityId = chapterId, NewValues = JsonSerializer.SerializeToDocument(new PublishReceipt(fingerprint, result)), CreatedAt = DateTimeOffset.UtcNow });
            await dbContext.SaveChangesAsync(ct); if (tx is not null) await tx.CommitAsync(ct);
            return QuestionResult<BulkPublishResponse>.Success(result);
        }
        catch (DbUpdateException) { dbContext.ChangeTracker.Clear(); return QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.Conflict, "Dữ liệu đã thay đổi hoặc request đang được xử lý. Kiểm tra lại với cùng requestId."); }
        catch (System.Data.Common.DbException) { dbContext.ChangeTracker.Clear(); return QuestionResult<BulkPublishResponse>.Fail(QuestionFailure.Conflict, "Giao dịch xung đột. Kiểm tra lại với cùng requestId."); }
    }
}
