using SLES.Domain.Enums;

namespace SLES.Application.ChapterManagement;

public sealed record CreateSubjectRequest(string Code, string Name, string? Description);
public sealed record UpdateSubjectRequest(string Name, string? Description);
public sealed record ChangeSubjectStatusRequest(bool IsActive);
public sealed record SubjectResponse(Guid Id, string Code, string Name, string? Description, bool IsActive, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
public sealed record SubjectListQuery(int Page = 1, int PageSize = 50, string? Search = null, bool SortDescending = false);
public sealed record AdminSubjectListQuery(int Page = 1, int PageSize = 20, string? Search = null, bool? IsActive = null, bool SortDescending = false);

public sealed record CreateChapterRequest(Guid GradeId, Guid SubjectId, string Name, string? Description, int DisplayOrder);
public sealed record UpdateChapterContentRequest(string Content);
public sealed record ChapterListQuery(int Page = 1, int PageSize = 20, Guid? GradeId = null, Guid? SubjectId = null, Guid? TeacherId = null, ChapterStatus? Status = null, string? Search = null, string SortBy = "displayOrder", bool SortDescending = false);
public sealed record ChapterActor(Guid UserId, string Role);
public sealed record ChapterResponse(Guid Id, string Name, string? Description, Guid GradeId, string GradeName, Guid SubjectId, string SubjectName, Guid TeacherId, string? TeacherName, int DisplayOrder, ChapterStatus Status, DateTimeOffset? PublishedAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, bool HasContent);
public sealed record ChapterDetailResponse(ChapterResponse Chapter, string Content, ContentFormat ContentFormat, int Version);
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public enum ChapterFailure { Forbidden, NotFound, InvalidRequest, InvalidGrade, InvalidSubject, InvalidTransition, Conflict, PublicationValidationPending }
public sealed record ChapterResult<T>(T? Value, ChapterFailure? Failure, string? Detail = null)
{
    public static ChapterResult<T> Success(T value) => new(value, null);
    public static ChapterResult<T> Fail(ChapterFailure failure, string? detail = null) => new(default, failure, detail);
}

public sealed record PublicationValidationResult(bool IsReady, string Code, string Detail);
public interface IChapterPublicationValidator
{
    Task<PublicationValidationResult> ValidateAsync(Guid chapterId, CancellationToken cancellationToken);
}

public interface ISubjectManagementService
{
    Task<ChapterResult<PagedResult<SubjectResponse>>> ListForAdminAsync(AdminSubjectListQuery query, CancellationToken cancellationToken);
    Task<ChapterResult<PagedResult<SubjectResponse>>> ListActiveAsync(SubjectListQuery query, CancellationToken cancellationToken);
    Task<ChapterResult<SubjectResponse>> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<ChapterResult<SubjectResponse>> CreateAsync(CreateSubjectRequest request, CancellationToken cancellationToken);
    Task<ChapterResult<SubjectResponse>> UpdateAsync(Guid id, UpdateSubjectRequest request, CancellationToken cancellationToken);
    Task<ChapterResult<bool>> SetStatusAsync(Guid id, ChangeSubjectStatusRequest request, CancellationToken cancellationToken);
}

public interface IChapterManagementService
{
    Task<ChapterResult<ChapterResponse>> CreateAsync(Guid teacherId, CreateChapterRequest request, CancellationToken cancellationToken);
    Task<ChapterResult<PagedResult<ChapterResponse>>> ListAsync(ChapterActor actor, ChapterListQuery query, CancellationToken cancellationToken);
    Task<ChapterResult<ChapterDetailResponse>> GetAsync(ChapterActor actor, Guid chapterId, CancellationToken cancellationToken);
    Task<ChapterResult<ChapterDetailResponse>> UpdateContentAsync(Guid teacherId, Guid chapterId, UpdateChapterContentRequest request, CancellationToken cancellationToken);
    Task<ChapterResult<bool>> PublishAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken);
    Task<ChapterResult<bool>> ArchiveAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken);
    Task<ChapterResult<bool>> DeleteAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken);
}
