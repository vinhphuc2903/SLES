using SLES.Domain.Enums;

namespace SLES.Application.QuestionBank;

public sealed record QuestionOptionRequest(string Content, bool IsCorrect);
public sealed record CreateQuestionRequest(string Content, IReadOnlyList<QuestionOptionRequest> Options, QuestionDifficulty? Difficulty = null);
public sealed record UpdateQuestionRequest(string Content, IReadOnlyList<QuestionOptionRequest> Options, QuestionDifficulty? Difficulty = null);
public sealed record QuestionListQuery(int Page = 1, int PageSize = 20, QuestionStatus? Status = null, string? Keyword = null, QuestionDifficulty? Difficulty = null, bool Unclassified = false);
public sealed record DifficultyCount(QuestionDifficulty? Difficulty, int Total, int EligiblePublished);
public sealed record QuestionProgressResponse(int Draft, int Published, int Archived, int ValidPublished)
{
    public IReadOnlyList<DifficultyCount> Difficulties { get; init; } = [];
}
public sealed record ClassifyQuestionRequest(QuestionDifficulty? Difficulty);
public sealed record BulkPublishRequest(Guid RequestId, bool AllEligible, IReadOnlyList<Guid>? QuestionIds);
public sealed record BulkPublishError(Guid QuestionId, string Code);
public sealed record BulkPublishResponse(int RequestedCount, int PublishedCount, int SkippedCount, IReadOnlyList<BulkPublishError> Errors, IReadOnlyList<DifficultyCount> Difficulties);
public sealed record QuestionOptionResponse(Guid Id, string Label, string Content, bool IsCorrect, short DisplayOrder);
public sealed record QuestionSummaryResponse(Guid Id, Guid ChapterId, string Content, QuestionStatus Status, QuestionDifficulty? Difficulty, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record QuestionDetailResponse(QuestionSummaryResponse Question, IReadOnlyList<QuestionOptionResponse> Options);
public sealed record StudentQuestionOptionResponse(Guid Id, string Label, string Content, short DisplayOrder);
public sealed record StudentQuestionResponse(Guid Id, string Content, IReadOnlyList<StudentQuestionOptionResponse> Options);
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public enum QuestionFailure { Forbidden, NotFound, InvalidRequest, ContentRequired, MustHaveFourOptions, MustHaveExactlyOneCorrectAnswer, EmptyOptionContent, NotEditable, InvalidTransition, HasLearningHistory, InvalidDifficulty, Conflict }
public sealed record QuestionResult<T>(T? Value, QuestionFailure? Failure, string? Detail = null)
{
    public static QuestionResult<T> Success(T value) => new(value, null);
    public static QuestionResult<T> Fail(QuestionFailure failure, string? detail = null) => new(default, failure, detail);
}

public interface IQuestionBankService
{
    Task<QuestionResult<QuestionDetailResponse>> ClassifyAsync(Guid teacherId, Guid questionId, ClassifyQuestionRequest request, CancellationToken ct);
    Task<QuestionResult<BulkPublishResponse>> BulkPublishAsync(Guid teacherId, Guid chapterId, BulkPublishRequest request, CancellationToken ct);
    Task<QuestionResult<QuestionProgressResponse>> ProgressAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken);
    Task<QuestionResult<QuestionDetailResponse>> CreateAsync(Guid teacherId, Guid chapterId, CreateQuestionRequest request, CancellationToken cancellationToken);
    Task<QuestionResult<PagedResult<QuestionSummaryResponse>>> ListAsync(Guid teacherId, Guid chapterId, QuestionListQuery query, CancellationToken cancellationToken);
    Task<QuestionResult<QuestionDetailResponse>> GetAsync(Guid teacherId, Guid questionId, CancellationToken cancellationToken);
    Task<QuestionResult<QuestionDetailResponse>> UpdateAsync(Guid teacherId, Guid questionId, UpdateQuestionRequest request, CancellationToken cancellationToken);
    Task<QuestionResult<bool>> PublishAsync(Guid teacherId, Guid questionId, CancellationToken cancellationToken);
    Task<QuestionResult<bool>> ArchiveAsync(Guid teacherId, Guid questionId, CancellationToken cancellationToken);
    Task<QuestionResult<bool>> DeleteAsync(Guid teacherId, Guid questionId, CancellationToken cancellationToken);
    Task<QuestionResult<IReadOnlyList<StudentQuestionResponse>>> GetStudentQuestionsAsync(Guid studentId, Guid chapterId, CancellationToken cancellationToken);
}
