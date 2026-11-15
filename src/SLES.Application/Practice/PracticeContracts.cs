namespace SLES.Application.Practice;

public sealed record SavePracticeAnswerRequest(Guid? SelectedOptionId);
public sealed record PracticeQuestionOptionResponse(Guid Id, string Label, string Content);
public sealed record PracticeQuestionResponse(Guid Id, int Number, string Content, Guid? SelectedOptionId, IReadOnlyList<PracticeQuestionOptionResponse> Options);
public sealed record PracticeAttemptResponse(Guid AttemptId, Guid ChapterId, int TotalQuestions, int AnsweredQuestions, bool IsSubmitted, IReadOnlyList<PracticeQuestionResponse> Questions);
public sealed record PracticeResultOptionResponse(Guid Id, string Label, string Content, bool IsCorrect);
public sealed record PracticeResultQuestionResponse(Guid QuestionId, int Number, string Content, Guid? SelectedOptionId, bool? IsCorrect, IReadOnlyList<PracticeResultOptionResponse> Options);
public sealed record PracticeResultResponse(Guid AttemptId, int TotalQuestions, int AnsweredQuestions, int CorrectAnswers, int IncorrectAnswers, int UnansweredQuestions, decimal Score, decimal Percentage, DateTimeOffset CompletedAt, IReadOnlyList<PracticeResultQuestionResponse> Questions)
{
    public Guid ChapterId { get; init; }
    public string ChapterName { get; init; } = string.Empty;
    public string SubjectName { get; init; } = string.Empty;
    public DateTimeOffset StartedAt { get; init; }
}
public sealed record PracticeHistoryQuery(int Page = 1, int PageSize = 20, Guid? ChapterId = null);
public sealed record PracticeHistoryItem(Guid AttemptId, Guid ChapterId, string ChapterName, int TotalQuestions, int CorrectAnswers, int IncorrectAnswers, decimal? Score, DateTimeOffset StartedAt, DateTimeOffset? SubmittedAt);
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public enum PracticeFailure { NotFound, InvalidRequest, ChapterHasInvalidQuestionCount, AttemptSubmitted, AnswerOptionInvalid, QuestionNotInAttempt, ResultUnavailable, Conflict }
public sealed record PracticeResult<T>(T? Value, PracticeFailure? Failure, string? Detail = null)
{
    public static PracticeResult<T> Success(T value) => new(value, null);
    public static PracticeResult<T> Fail(PracticeFailure failure, string? detail = null) => new(default, failure, detail);
}

public interface IPracticeService
{
    Task<PracticeResult<PracticeAttemptResponse>> StartAsync(Guid studentId, Guid chapterId, CancellationToken cancellationToken);
    Task<PracticeResult<PracticeAttemptResponse>> GetAttemptAsync(Guid studentId, Guid attemptId, CancellationToken cancellationToken);
    Task<PracticeResult<bool>> SaveAnswerAsync(Guid studentId, Guid attemptId, Guid questionId, SavePracticeAnswerRequest request, CancellationToken cancellationToken);
    Task<PracticeResult<PracticeResultResponse>> SubmitAsync(Guid studentId, Guid attemptId, CancellationToken cancellationToken);
    Task<PracticeResult<PracticeResultResponse>> GetResultAsync(Guid studentId, Guid attemptId, CancellationToken cancellationToken);
    Task<PracticeResult<PagedResult<PracticeHistoryItem>>> GetHistoryAsync(Guid studentId, PracticeHistoryQuery query, CancellationToken cancellationToken);
}
