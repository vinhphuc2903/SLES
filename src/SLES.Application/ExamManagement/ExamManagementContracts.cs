using SLES.Application.Practice;
using SLES.Domain.Enums;

namespace SLES.Application.ExamManagement;

public sealed record CreateExamRequest(Guid ChapterId, string Name, string? Description, int DurationMinutes, DateTimeOffset? StartAt, DateTimeOffset? EndAt);
public sealed record UpdateExamRequest(string Name, string? Description, int DurationMinutes, DateTimeOffset? StartAt, DateTimeOffset? EndAt);
public sealed record ExamListQuery(int Page = 1, int PageSize = 20, ExamStatus? Status = null, Guid? ChapterId = null, string? Keyword = null);
public sealed record ExamResponse(Guid Id, Guid ChapterId, string Name, string? Description, short QuestionCount, int DurationMinutes, DateTimeOffset? StartAt, DateTimeOffset? EndAt, ExamStatus Status, DateTimeOffset? OpenedAt, DateTimeOffset? ClosedAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, int PermissionCount, int AttemptCount);
public sealed record GrantExamPermissionRequest(Guid StudentId);
public sealed record BulkGrantExamPermissionRequest(IReadOnlyList<Guid> StudentIds);
public sealed record ExamPermissionResponse(Guid StudentId, string Username, string FullName, PermissionStatus Status, DateTimeOffset GrantedAt, DateTimeOffset? RevokedAt, bool HasAttempt)
{
    public Guid? GradeId { get; init; }
    public string? GradeName { get; init; }
    public ExamAttemptStatus? AttemptStatus { get; init; }
}
public sealed record BulkPermissionItem(Guid StudentId, bool Granted, string? Detail);
public sealed record SaveExamAnswerRequest(Guid? SelectedOptionId);
public sealed record ExamOptionResponse(Guid Id, string Label, string Content);
public sealed record ExamQuestionResponse(Guid Id, int Number, string Content, Guid? SelectedOptionId, IReadOnlyList<ExamOptionResponse> Options);
public sealed record ExamAttemptResponse(Guid AttemptId, Guid ExamId, ExamAttemptStatus Status, DateTimeOffset StartedAt, DateTimeOffset ExpiresAt, int RemainingSeconds, int AnsweredQuestions, IReadOnlyList<ExamQuestionResponse> Questions)
{
    public DateTimeOffset ServerNow { get; init; } = DateTimeOffset.UtcNow;
}
public sealed record ExamResultOptionResponse(Guid Id, string Label, string Content, bool IsCorrect);
public sealed record ExamResultQuestionResponse(Guid Id, int Number, string Content, Guid? SelectedOptionId, bool? IsCorrect, IReadOnlyList<ExamResultOptionResponse> Options);
public sealed record ExamResultResponse(Guid AttemptId, Guid ExamId, ExamAttemptStatus Status, int TotalQuestions, int AnsweredQuestions, int CorrectAnswers, int IncorrectAnswers, int UnansweredAnswers, decimal Score, decimal Percentage, DateTimeOffset SubmittedAt, IReadOnlyList<ExamResultQuestionResponse> Questions)
{
    public Guid? StudentId { get; init; }
    public string? StudentUsername { get; init; }
    public string? StudentFullName { get; init; }
    public DateTimeOffset? StartedAt { get; init; }
}
public sealed record StudentAvailableExamResponse(Guid Id, string Name, string? Description, Guid ChapterId, string ChapterName, int DurationMinutes, DateTimeOffset? StartAt, DateTimeOffset? EndAt, ExamStatus Status);
public sealed record TeacherExamResultItem(Guid StudentId, string Username, string FullName, PermissionStatus PermissionStatus, Guid? AttemptId, ExamAttemptStatus? AttemptStatus, decimal? Score, int? CorrectAnswers, int? IncorrectAnswers, int? UnansweredAnswers, decimal? Percentage, DateTimeOffset? SubmittedAt);
public sealed record TeacherExamResultsQuery(int Page = 1, int PageSize = 20, string? StudentKeyword = null);

public sealed record StudentExamResponse(Guid Id, string Name, string? Description, Guid ChapterId, string ChapterName, string SubjectName, int DurationMinutes, DateTimeOffset? StartAt, DateTimeOffset? EndAt, ExamStatus Status, bool CanStart, Guid? AttemptId, ExamAttemptStatus? AttemptStatus, DateTimeOffset ServerNow);
public sealed record StudentExamHistoryItem(Guid AttemptId, Guid ExamId, string ExamName, string ChapterName, string SubjectName, ExamAttemptStatus Status, DateTimeOffset StartedAt, DateTimeOffset ExpiresAt, DateTimeOffset? SubmittedAt, decimal? Score);

public sealed record BlueprintLevel(QuestionDifficulty Difficulty, int Required, int Available);
public sealed record ExamBlueprintResponse(bool Ready, int ValidPublished, IReadOnlyList<BlueprintLevel> Levels);

public enum ExamFailure { NotFound, InsufficientBlueprint, InvalidRequest, InvalidSchedule, ChapterHasInvalidQuestionCount, InvalidLifecycle, PermissionInvalid, AttemptExists, AttemptCompleted, AttemptExpired, QuestionNotInAttempt, AnswerOptionInvalid, ResultUnavailable, Conflict }
public sealed record ExamResult<T>(T? Value, ExamFailure? Failure, string? Detail = null)
{
    public ExamBlueprintResponse? Blueprint { get; init; }
    public static ExamResult<T> Success(T value) => new(value, null);
    public static ExamResult<T> Fail(ExamFailure failure, string? detail = null) => new(default, failure, detail);
}

public interface IExamManagementService
{
    Task<ExamResult<ExamBlueprintResponse>> GetBlueprintAsync(Guid teacherId, Guid chapterId, CancellationToken ct);
    Task<ExamResult<PagedResult<StudentExamResponse>>> ListStudentExamsAsync(Guid studentId, int page, int pageSize, CancellationToken ct);
    Task<ExamResult<StudentExamResponse>> GetStudentExamAsync(Guid studentId, Guid examId, CancellationToken ct);
    Task<ExamResult<PagedResult<StudentExamHistoryItem>>> GetStudentHistoryAsync(Guid studentId, int page, int pageSize, CancellationToken ct);
    Task<ExamResult<ExamResponse>> CreateAsync(Guid teacherId, CreateExamRequest request, CancellationToken cancellationToken);
    Task<ExamResult<PagedResult<ExamResponse>>> ListAsync(Guid teacherId, ExamListQuery query, CancellationToken cancellationToken);
    Task<ExamResult<ExamResponse>> GetAsync(Guid teacherId, Guid examId, CancellationToken cancellationToken);
    Task<ExamResult<ExamResponse>> UpdateAsync(Guid teacherId, Guid examId, UpdateExamRequest request, CancellationToken cancellationToken);
    Task<ExamResult<ExamResponse>> PublishAsync(Guid teacherId, Guid examId, CancellationToken cancellationToken);
    Task<ExamResult<ExamResponse>> CloseAsync(Guid teacherId, Guid examId, CancellationToken cancellationToken);
    Task<ExamResult<ExamPermissionResponse>> GrantPermissionAsync(Guid teacherId, Guid examId, GrantExamPermissionRequest request, CancellationToken cancellationToken);
    Task<ExamResult<IReadOnlyList<BulkPermissionItem>>> GrantPermissionsAsync(Guid teacherId, Guid examId, BulkGrantExamPermissionRequest request, CancellationToken cancellationToken);
    Task<ExamResult<PagedResult<ExamPermissionResponse>>> ListPermissionsAsync(Guid teacherId, Guid examId, int page, int pageSize, PermissionStatus? status, CancellationToken cancellationToken);
    Task<ExamResult<bool>> RevokePermissionAsync(Guid teacherId, Guid examId, Guid studentId, CancellationToken cancellationToken);
    Task<ExamResult<PagedResult<TeacherExamResultItem>>> GetTeacherResultsAsync(Guid teacherId, Guid examId, TeacherExamResultsQuery query, CancellationToken cancellationToken);
    Task<ExamResult<ExamResultResponse>> GetTeacherAttemptAsync(Guid teacherId, Guid examId, Guid attemptId, CancellationToken cancellationToken);
    Task<ExamResult<PagedResult<StudentAvailableExamResponse>>> GetAvailableAsync(Guid studentId, int page, int pageSize, CancellationToken cancellationToken);
    Task<ExamResult<ExamAttemptResponse>> StartAsync(Guid studentId, Guid examId, CancellationToken cancellationToken);
    Task<ExamResult<ExamAttemptResponse>> GetCurrentAttemptAsync(Guid studentId, Guid examId, CancellationToken cancellationToken);
    Task<ExamResult<ExamAttemptResponse>> GetAttemptAsync(Guid studentId, Guid attemptId, CancellationToken cancellationToken);
    Task<ExamResult<bool>> SaveAnswerAsync(Guid studentId, Guid attemptId, Guid attemptQuestionId, SaveExamAnswerRequest request, CancellationToken cancellationToken);
    Task<ExamResult<ExamResultResponse>> SubmitAsync(Guid studentId, Guid attemptId, CancellationToken cancellationToken);
    Task<ExamResult<ExamResultResponse>> GetResultAsync(Guid studentId, Guid attemptId, CancellationToken cancellationToken);
}
