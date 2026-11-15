using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using SLES.Application.Practice;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.Practice;

public sealed class PracticeService(SlesDbContext dbContext) : IPracticeService
{
    public async Task<PracticeResult<PracticeAttemptResponse>> StartAsync(Guid studentId, Guid chapterId, CancellationToken ct)
    {
        var chapter = await AccessibleChapterAsync(studentId, chapterId, ct);
        if (chapter is null) return PracticeResult<PracticeAttemptResponse>.Fail(PracticeFailure.NotFound);
        var questions = await ValidPublishedQuestionsAsync(chapterId, ct);
        if (questions.Count != 200) return PracticeResult<PracticeAttemptResponse>.Fail(PracticeFailure.ChapterHasInvalidQuestionCount, $"Chapter has {questions.Count} valid published questions; exactly 200 are required.");
        var now = DateTimeOffset.UtcNow;
        var attempt = new PracticeAttempt { StudentId = studentId, TeacherId = chapter.TeacherId, ChapterId = chapterId, Mode = PracticeMode.Practice, Status = PracticeAttemptStatus.InProgress, TotalQuestions = 200, StartedAt = now, CreatedAt = now };
        dbContext.PracticeAttempts.Add(attempt);
        foreach (var question in questions) attempt.Answers.Add(new PracticeAnswer { QuestionId = question.Id, AnsweredAt = now });
        if (dbContext.Database.IsRelational()) { await using var tx = await dbContext.Database.BeginTransactionAsync(ct); await dbContext.SaveChangesAsync(ct); await tx.CommitAsync(ct); } else await dbContext.SaveChangesAsync(ct);
        return PracticeResult<PracticeAttemptResponse>.Success(ToAttemptResponse(attempt, questions));
    }

    public async Task<PracticeResult<PracticeAttemptResponse>> GetAttemptAsync(Guid studentId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await OwnedAttemptAsync(studentId, attemptId, ct); if (attempt is null) return PracticeResult<PracticeAttemptResponse>.Fail(PracticeFailure.NotFound);
        var questions = await QuestionsForAttemptAsync(attempt, ct);
        return PracticeResult<PracticeAttemptResponse>.Success(ToAttemptResponse(attempt, questions));
    }

    public async Task<PracticeResult<bool>> SaveAnswerAsync(Guid studentId, Guid attemptId, Guid questionId, SavePracticeAnswerRequest request, CancellationToken ct)
    {
        var attempt = await OwnedAttemptAsync(studentId, attemptId, ct); if (attempt is null) return PracticeResult<bool>.Fail(PracticeFailure.NotFound);
        if (attempt.Status != PracticeAttemptStatus.InProgress) return PracticeResult<bool>.Fail(PracticeFailure.AttemptSubmitted);
        var answer = await dbContext.PracticeAnswers.SingleOrDefaultAsync(x => x.PracticeAttemptId == attemptId && x.QuestionId == questionId, ct);
        if (answer is null) return PracticeResult<bool>.Fail(PracticeFailure.QuestionNotInAttempt);
        if (request.SelectedOptionId.HasValue && !await dbContext.QuestionOptions.AnyAsync(x => x.Id == request.SelectedOptionId && x.QuestionId == questionId, ct)) return PracticeResult<bool>.Fail(PracticeFailure.AnswerOptionInvalid);
        answer.SelectedOptionId = request.SelectedOptionId; answer.IsCorrect = null; answer.AnsweredAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(ct); return PracticeResult<bool>.Success(true);
    }

    public async Task<PracticeResult<PracticeResultResponse>> SubmitAsync(Guid studentId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await OwnedAttemptAsync(studentId, attemptId, ct); if (attempt is null) return PracticeResult<PracticeResultResponse>.Fail(PracticeFailure.NotFound);
        if (attempt.Status != PracticeAttemptStatus.InProgress) return PracticeResult<PracticeResultResponse>.Fail(PracticeFailure.AttemptSubmitted);
        if (dbContext.Database.IsRelational())
        {
            await using var tx = await dbContext.Database.BeginTransactionAsync(ct);
            var result = await SubmitCoreAsync(attempt, ct); await tx.CommitAsync(ct); return PracticeResult<PracticeResultResponse>.Success(result);
        }
        return PracticeResult<PracticeResultResponse>.Success(await SubmitCoreAsync(attempt, ct));
    }

    public async Task<PracticeResult<PracticeResultResponse>> GetResultAsync(Guid studentId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await OwnedAttemptAsync(studentId, attemptId, ct); if (attempt is null) return PracticeResult<PracticeResultResponse>.Fail(PracticeFailure.NotFound);
        if (attempt.Status != PracticeAttemptStatus.Submitted || attempt.SubmittedAt is null) return PracticeResult<PracticeResultResponse>.Fail(PracticeFailure.ResultUnavailable);
        return PracticeResult<PracticeResultResponse>.Success(await ToResultAsync(attempt, ct));
    }

    public async Task<PracticeResult<PagedResult<PracticeHistoryItem>>> GetHistoryAsync(Guid studentId, PracticeHistoryQuery query, CancellationToken ct)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100) return PracticeResult<PagedResult<PracticeHistoryItem>>.Fail(PracticeFailure.InvalidRequest);
        var attempts = dbContext.PracticeAttempts.AsNoTracking().Where(x => x.StudentId == studentId); if (query.ChapterId.HasValue) attempts = attempts.Where(x => x.ChapterId == query.ChapterId);
        var total = await attempts.CountAsync(ct);
        var items = await (from attempt in attempts orderby attempt.CreatedAt descending join chapter in dbContext.Chapters.AsNoTracking() on attempt.ChapterId equals chapter.Id select new PracticeHistoryItem(attempt.Id, attempt.ChapterId, chapter.Name, attempt.TotalQuestions, attempt.CorrectCount, attempt.WrongCount, attempt.Score, attempt.StartedAt, attempt.SubmittedAt)).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return PracticeResult<PagedResult<PracticeHistoryItem>>.Success(new PagedResult<PracticeHistoryItem>(items, query.Page, query.PageSize, total));
    }

    private async Task<PracticeResultResponse> SubmitCoreAsync(PracticeAttempt attempt, CancellationToken ct)
    {
        var answers = await dbContext.PracticeAnswers.Where(x => x.PracticeAttemptId == attempt.Id).ToListAsync(ct);
        var selectedIds = answers.Where(x => x.SelectedOptionId.HasValue).Select(x => x.SelectedOptionId!.Value).ToList();
        var correctness = await dbContext.QuestionOptions.Where(x => selectedIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, x => x.IsCorrect, ct);
        foreach (var answer in answers) answer.IsCorrect = answer.SelectedOptionId.HasValue && correctness.TryGetValue(answer.SelectedOptionId.Value, out var correct) ? correct : null;
        attempt.CorrectCount = answers.Count(x => x.IsCorrect == true); attempt.WrongCount = answers.Count(x => x.SelectedOptionId.HasValue && x.IsCorrect == false); attempt.Score = Math.Round((decimal)attempt.CorrectCount / attempt.TotalQuestions * 10m, 2); attempt.Status = PracticeAttemptStatus.Submitted; attempt.SubmittedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(ct); return await ToResultAsync(attempt, ct);
    }

    private async Task<PracticeResultResponse> ToResultAsync(PracticeAttempt attempt, CancellationToken ct)
    {
        var questions = await QuestionsForAttemptAsync(attempt, ct); var answers = attempt.Answers.ToDictionary(x => x.QuestionId);
        var ordered = OrderQuestions(attempt.Id, questions);
        var reviews = ordered.Select((question, index) => { var answer = answers[question.Id]; return new PracticeResultQuestionResponse(question.Id, index + 1, question.Content, answer.SelectedOptionId, answer.IsCorrect, OrderOptions(attempt.Id, question.Id, question.Options).Select(x => new PracticeResultOptionResponse(x.Id, x.Label, x.Content, x.IsCorrect)).ToList()); }).ToList();
        var answered = attempt.Answers.Count(x => x.SelectedOptionId.HasValue); var unanswered = attempt.TotalQuestions - answered;
        var chapter = await dbContext.Chapters.AsNoTracking().Include(x => x.Subject).SingleAsync(x => x.Id == attempt.ChapterId, ct);
        return new PracticeResultResponse(attempt.Id, attempt.TotalQuestions, answered, attempt.CorrectCount, attempt.WrongCount, unanswered, attempt.Score ?? 0, Math.Round((decimal)attempt.CorrectCount / attempt.TotalQuestions * 100m, 2), attempt.SubmittedAt!.Value, reviews)
        { ChapterId = chapter.Id, ChapterName = chapter.Name, SubjectName = chapter.Subject.Name, StartedAt = attempt.StartedAt };
    }

    private async Task<Chapter?> AccessibleChapterAsync(Guid studentId, Guid chapterId, CancellationToken ct)
    {
        var student = await dbContext.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == studentId && x.IsActive && x.DeletedAt == null && x.Role.Code == RoleCodes.Student, ct);
        if (student?.CreatedByTeacherId is not { } teacherId || student.GradeId is not { } gradeId) return null;
        return await dbContext.Chapters.AsNoTracking().SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.GradeId == gradeId && x.Status == ChapterStatus.Published && x.DeletedAt == null && x.Subject.IsActive && x.Grade.IsActive, ct);
    }
    private Task<PracticeAttempt?> OwnedAttemptAsync(Guid studentId, Guid attemptId, CancellationToken ct) => dbContext.PracticeAttempts.Include(x => x.Answers).SingleOrDefaultAsync(x => x.Id == attemptId && x.StudentId == studentId, ct);
    private async Task<List<Question>> ValidPublishedQuestionsAsync(Guid chapterId, CancellationToken ct) => await dbContext.Questions.AsNoTracking().Include(x => x.Options).Where(x => x.ChapterId == chapterId && x.DeletedAt == null && x.Status == QuestionStatus.Published).Where(x => !string.IsNullOrWhiteSpace(x.Content) && x.Options.Count == 4 && x.Options.All(o => !string.IsNullOrWhiteSpace(o.Content)) && x.Options.Count(o => o.IsCorrect) == 1).ToListAsync(ct);
    private async Task<List<Question>> QuestionsForAttemptAsync(PracticeAttempt attempt, CancellationToken ct) { var ids = attempt.Answers.Select(x => x.QuestionId).ToList(); return await dbContext.Questions.AsNoTracking().Include(x => x.Options).Where(x => ids.Contains(x.Id)).ToListAsync(ct); }
    private static PracticeAttemptResponse ToAttemptResponse(PracticeAttempt attempt, IReadOnlyList<Question> questions) { var answers = attempt.Answers.ToDictionary(x => x.QuestionId); var ordered = OrderQuestions(attempt.Id, questions); return new PracticeAttemptResponse(attempt.Id, attempt.ChapterId, attempt.TotalQuestions, answers.Values.Count(x => x.SelectedOptionId.HasValue), attempt.Status == PracticeAttemptStatus.Submitted, ordered.Select((q, i) => new PracticeQuestionResponse(q.Id, i + 1, q.Content, answers[q.Id].SelectedOptionId, OrderOptions(attempt.Id, q.Id, q.Options).Select(o => new PracticeQuestionOptionResponse(o.Id, o.Label, o.Content)).ToList())).ToList()); }
    private static List<Question> OrderQuestions(Guid attemptId, IEnumerable<Question> questions) => questions.OrderBy(x => SortKey(attemptId, x.Id)).ToList();
    private static List<QuestionOption> OrderOptions(Guid attemptId, Guid questionId, IEnumerable<QuestionOption> options) => options.OrderBy(x => SortKey(attemptId, questionId, x.Id)).ToList();
    private static string SortKey(params Guid[] ids) { var bytes = ids.SelectMany(x => x.ToByteArray()).ToArray(); return Convert.ToHexString(SHA256.HashData(bytes)); }
}
