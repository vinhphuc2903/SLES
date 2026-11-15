using Microsoft.EntityFrameworkCore;
using SLES.Application.QuestionBank;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.QuestionBank;

public sealed partial class QuestionBankService(SlesDbContext dbContext) : IQuestionBankService
{
    public async Task<QuestionResult<QuestionProgressResponse>> ProgressAsync(Guid teacherId, Guid chapterId, CancellationToken ct)
    {
        if (await OwnedChapterAsync(teacherId, chapterId, ct) is null) return QuestionResult<QuestionProgressResponse>.Fail(QuestionFailure.NotFound);
        var rows = await dbContext.Questions.AsNoTracking().Include(x => x.Options)
            .Where(x => x.ChapterId == chapterId && x.DeletedAt == null).ToListAsync(ct);
        return QuestionResult<QuestionProgressResponse>.Success(new(
            rows.Count(x => x.Status == QuestionStatus.Draft),
            rows.Count(x => x.Status == QuestionStatus.Published),
            rows.Count(x => x.Status == QuestionStatus.Archived),
            rows.Count(x => x.Status == QuestionStatus.Published && Validate(x.Content, x.Options.Select(o => new QuestionOptionRequest(o.Content, o.IsCorrect)).ToList()) is null)) { Difficulties = DifficultyCounts(rows) });
    }

    public async Task<QuestionResult<QuestionDetailResponse>> CreateAsync(Guid teacherId, Guid chapterId, CreateQuestionRequest request, CancellationToken ct)
    {
        var validation = Validate(request.Content, request.Options); if (validation is not null) return QuestionResult<QuestionDetailResponse>.Fail(validation.Value);
        if (!ValidDifficulty(request.Difficulty)) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.InvalidDifficulty);
        var chapter = await OwnedDraftChapterAsync(teacherId, chapterId, ct); if (chapter is null) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.NotFound);
        var now = DateTimeOffset.UtcNow; var question = new Question { ChapterId = chapterId, Content = request.Content.Trim(), Status = QuestionStatus.Draft, Difficulty = request.Difficulty, CreatedAt = now, UpdatedAt = now };
        AddOptions(question, request.Options);
        dbContext.Questions.Add(question);
        if (dbContext.Database.IsRelational()) { await using var tx = await dbContext.Database.BeginTransactionAsync(ct); await dbContext.SaveChangesAsync(ct); await tx.CommitAsync(ct); } else await dbContext.SaveChangesAsync(ct);
        return QuestionResult<QuestionDetailResponse>.Success(ToDetail(question));
    }

    public async Task<QuestionResult<PagedResult<QuestionSummaryResponse>>> ListAsync(Guid teacherId, Guid chapterId, QuestionListQuery query, CancellationToken ct)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100 || (query.Difficulty.HasValue && !ValidDifficulty(query.Difficulty))) return QuestionResult<PagedResult<QuestionSummaryResponse>>.Fail(QuestionFailure.InvalidRequest);
        if (await OwnedChapterAsync(teacherId, chapterId, ct) is null) return QuestionResult<PagedResult<QuestionSummaryResponse>>.Fail(QuestionFailure.NotFound);
        var questions = dbContext.Questions.AsNoTracking().Where(x => x.ChapterId == chapterId && x.DeletedAt == null);
        if (query.Status.HasValue) questions = questions.Where(x => x.Status == query.Status); if (!string.IsNullOrWhiteSpace(query.Keyword)) questions = questions.Where(x => x.Content.Contains(query.Keyword.Trim()));
        if (query.Unclassified) questions = questions.Where(x => x.Difficulty == null);
        else if (query.Difficulty.HasValue) questions = questions.Where(x => x.Difficulty == query.Difficulty);
        var total = await questions.CountAsync(ct); var items = await questions.OrderByDescending(x => x.CreatedAt).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).Select(x => ToSummary(x)).ToListAsync(ct);
        return QuestionResult<PagedResult<QuestionSummaryResponse>>.Success(new PagedResult<QuestionSummaryResponse>(items, query.Page, query.PageSize, total));
    }

    public async Task<QuestionResult<QuestionDetailResponse>> GetAsync(Guid teacherId, Guid questionId, CancellationToken ct)
    {
        var question = await OwnedQuestionAsync(teacherId, questionId, true, ct); return question is null ? QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.NotFound) : QuestionResult<QuestionDetailResponse>.Success(ToDetail(question));
    }

    public async Task<QuestionResult<QuestionDetailResponse>> UpdateAsync(Guid teacherId, Guid questionId, UpdateQuestionRequest request, CancellationToken ct)
    {
        var validation = Validate(request.Content, request.Options); if (validation is not null) return QuestionResult<QuestionDetailResponse>.Fail(validation.Value);
        var question = await OwnedQuestionAsync(teacherId, questionId, true, ct); if (question is null) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.NotFound);
        if (question.Status != QuestionStatus.Draft) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.NotEditable);
        if (await HasHistoryAsync(questionId, ct)) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.HasLearningHistory);
        if (!ValidDifficulty(request.Difficulty)) return QuestionResult<QuestionDetailResponse>.Fail(QuestionFailure.InvalidDifficulty);
        question.Difficulty = request.Difficulty;
        question.Content = request.Content.Trim(); question.UpdatedAt = DateTimeOffset.UtcNow;
        if (dbContext.Database.IsRelational())
        {
            await using var tx = await dbContext.Database.BeginTransactionAsync(ct);
            await ReplaceOptionsAsync(question, request.Options, ct);
            await tx.CommitAsync(ct);
        }
        else await ReplaceOptionsAsync(question, request.Options, ct);
        var reloaded = await OwnedQuestionAsync(teacherId, questionId, true, ct);
        return QuestionResult<QuestionDetailResponse>.Success(ToDetail(reloaded!));
    }

    public async Task<QuestionResult<bool>> PublishAsync(Guid teacherId, Guid questionId, CancellationToken ct)
    {
        var question = await OwnedQuestionAsync(teacherId, questionId, true, ct); if (question is null) return QuestionResult<bool>.Fail(QuestionFailure.NotFound);
        if (question.Status != QuestionStatus.Draft) return QuestionResult<bool>.Fail(QuestionFailure.InvalidTransition);
        var validation = Validate(question.Content, question.Options.Select(x => new QuestionOptionRequest(x.Content, x.IsCorrect)).ToList()); if (validation is not null) return QuestionResult<bool>.Fail(validation.Value);
        if (!ValidDifficulty(question.Difficulty)) return QuestionResult<bool>.Fail(QuestionFailure.InvalidDifficulty);
        question.Status = QuestionStatus.Published; question.UpdatedAt = DateTimeOffset.UtcNow; await dbContext.SaveChangesAsync(ct); return QuestionResult<bool>.Success(true);
    }

    public async Task<QuestionResult<bool>> ArchiveAsync(Guid teacherId, Guid questionId, CancellationToken ct)
    {
        var question = await OwnedQuestionAsync(teacherId, questionId, false, ct); if (question is null) return QuestionResult<bool>.Fail(QuestionFailure.NotFound);
        if (question.Status == QuestionStatus.Archived) return QuestionResult<bool>.Fail(QuestionFailure.InvalidTransition);
        question.Status = QuestionStatus.Archived; question.UpdatedAt = DateTimeOffset.UtcNow; await dbContext.SaveChangesAsync(ct); return QuestionResult<bool>.Success(true);
    }

    public async Task<QuestionResult<bool>> DeleteAsync(Guid teacherId, Guid questionId, CancellationToken ct)
    {
        var question = await OwnedQuestionAsync(teacherId, questionId, false, ct); if (question is null) return QuestionResult<bool>.Fail(QuestionFailure.NotFound);
        if (question.Status != QuestionStatus.Draft) return QuestionResult<bool>.Fail(QuestionFailure.InvalidTransition);
        if (await HasHistoryAsync(questionId, ct)) return QuestionResult<bool>.Fail(QuestionFailure.HasLearningHistory);
        question.DeletedAt = DateTimeOffset.UtcNow; question.UpdatedAt = question.DeletedAt.Value; await dbContext.SaveChangesAsync(ct); return QuestionResult<bool>.Success(true);
    }

    public async Task<QuestionResult<IReadOnlyList<StudentQuestionResponse>>> GetStudentQuestionsAsync(Guid studentId, Guid chapterId, CancellationToken ct)
    {
        var student = await dbContext.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == studentId && x.IsActive && x.DeletedAt == null && x.Role.Code == RoleCodes.Student, ct);
        if (student?.CreatedByTeacherId is not { } ownerId || student.GradeId is not { } gradeId) return QuestionResult<IReadOnlyList<StudentQuestionResponse>>.Fail(QuestionFailure.NotFound);
        var chapter = await dbContext.Chapters.AsNoTracking().AnyAsync(x => x.Id == chapterId && x.DeletedAt == null && x.Status == ChapterStatus.Published && x.TeacherId == ownerId && x.GradeId == gradeId && x.Subject.IsActive && x.Grade.IsActive, ct);
        if (!chapter) return QuestionResult<IReadOnlyList<StudentQuestionResponse>>.Fail(QuestionFailure.NotFound);
        var questions = await dbContext.Questions.AsNoTracking().Include(x => x.Options).Where(x => x.ChapterId == chapterId && x.DeletedAt == null && x.Status == QuestionStatus.Published).OrderBy(x => x.CreatedAt).ToListAsync(ct);
        return QuestionResult<IReadOnlyList<StudentQuestionResponse>>.Success(questions.Select(x => new StudentQuestionResponse(x.Id, x.Content, x.Options.OrderBy(o => o.DisplayOrder).Select(o => new StudentQuestionOptionResponse(o.Id, o.Label, o.Content, o.DisplayOrder)).ToList())).ToList());
    }

    private Task<Chapter?> OwnedChapterAsync(Guid teacherId, Guid chapterId, CancellationToken ct) => dbContext.Chapters.SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.DeletedAt == null, ct);
    private Task<Chapter?> OwnedDraftChapterAsync(Guid teacherId, Guid chapterId, CancellationToken ct) => dbContext.Chapters.SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.DeletedAt == null && x.Status == ChapterStatus.Draft, ct);
    private Task<Question?> OwnedQuestionAsync(Guid teacherId, Guid questionId, bool options, CancellationToken ct) { IQueryable<Question> query = dbContext.Questions.Include(x => x.Chapter).Where(x => x.Id == questionId && x.DeletedAt == null && x.Chapter.TeacherId == teacherId && x.Chapter.DeletedAt == null); if (options) query = query.Include(x => x.Options); return query.SingleOrDefaultAsync(ct); }
    private async Task<bool> HasHistoryAsync(Guid questionId, CancellationToken ct) =>
        await dbContext.PracticeAnswers.AnyAsync(x => x.QuestionId == questionId, ct) || await dbContext.ExamAttemptQuestions.AnyAsync(x => x.SourceQuestionId == questionId, ct);
    private async Task ReplaceOptionsAsync(Question question, IReadOnlyList<QuestionOptionRequest> options, CancellationToken ct)
    {
        dbContext.QuestionOptions.RemoveRange(question.Options);
        await dbContext.SaveChangesAsync(ct);
        dbContext.ChangeTracker.Clear();
        dbContext.QuestionOptions.AddRange(BuildOptions(question.Id, options));
        await dbContext.SaveChangesAsync(ct);
    }
    internal static QuestionFailure? Validate(string? content, IReadOnlyList<QuestionOptionRequest>? options) { if (string.IsNullOrWhiteSpace(content)) return QuestionFailure.ContentRequired; if (options is null || options.Count != 4) return QuestionFailure.MustHaveFourOptions; if (options.Any(x => string.IsNullOrWhiteSpace(x.Content))) return QuestionFailure.EmptyOptionContent; return options.Count(x => x.IsCorrect) != 1 ? QuestionFailure.MustHaveExactlyOneCorrectAnswer : null; }
    internal static void AddOptions(Question question, IReadOnlyList<QuestionOptionRequest> options) { for (short i = 0; i < 4; i++) question.Options.Add(new QuestionOption { Label = ((char)('A' + i)).ToString(), Content = options[i].Content.Trim(), IsCorrect = options[i].IsCorrect, DisplayOrder = (short)(i + 1) }); }
    private static IEnumerable<QuestionOption> BuildOptions(Guid questionId, IReadOnlyList<QuestionOptionRequest> options) { for (short i = 0; i < 4; i++) yield return new QuestionOption { QuestionId = questionId, Label = ((char)('A' + i)).ToString(), Content = options[i].Content.Trim(), IsCorrect = options[i].IsCorrect, DisplayOrder = (short)(i + 1) }; }
    private static QuestionSummaryResponse ToSummary(Question x) => new(x.Id, x.ChapterId, x.Content, x.Status, x.Difficulty, x.CreatedAt, x.UpdatedAt);
    private static QuestionDetailResponse ToDetail(Question x) => new(ToSummary(x), x.Options.OrderBy(o => o.DisplayOrder).Select(o => new QuestionOptionResponse(o.Id, o.Label, o.Content, o.IsCorrect, o.DisplayOrder)).ToList());
}
