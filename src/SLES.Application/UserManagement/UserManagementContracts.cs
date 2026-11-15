namespace SLES.Application.UserManagement;

public sealed record CreateTeacherRequest(string Username, string FullName, string? Email, string? Phone);
public sealed record CreateStudentRequest(string Username, string FullName, Guid GradeId, string? Email, string? Phone);
public sealed record UpdateUserProfileRequest(string FullName, string? Email, string? Phone);
public sealed record UpdateStudentProfileRequest(string FullName, string? Email, string? Phone, Guid GradeId);
public sealed record ChangeUserStatusRequest(bool IsActive);
public sealed record UserListQuery(int Page = 1, int PageSize = 20, string? Search = null, bool? IsActive = null, Guid? GradeId = null, bool SortDescending = true);

public sealed record ManagedUserResponse(Guid Id, string Username, string FullName, string Role, Guid? GradeId, string? Email, string? Phone, bool IsActive, bool MustChangePassword, DateTimeOffset CreatedAt);
public sealed record CreatedUserResponse(ManagedUserResponse User, string TemporaryPassword);
public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);

public enum UserManagementFailure { Forbidden, NotFound, DuplicateUsername, InvalidGrade, InvalidRequest }
public sealed record UserManagementResult<T>(T? Value, UserManagementFailure? Failure)
{
    public static UserManagementResult<T> Success(T value) => new(value, null);
    public static UserManagementResult<T> Fail(UserManagementFailure failure) => new(default, failure);
}

public interface IUserManagementService
{
    Task<UserManagementResult<CreatedUserResponse>> CreateTeacherAsync(Guid actorId, CreateTeacherRequest request, CancellationToken cancellationToken);
    Task<UserManagementResult<PagedResult<ManagedUserResponse>>> ListTeachersAsync(UserListQuery query, CancellationToken cancellationToken);
    Task<UserManagementResult<ManagedUserResponse>> GetTeacherAsync(Guid id, CancellationToken cancellationToken);
    Task<UserManagementResult<ManagedUserResponse>> UpdateTeacherAsync(Guid id, UpdateUserProfileRequest request, CancellationToken cancellationToken);
    Task<UserManagementResult<bool>> SetTeacherStatusAsync(Guid id, ChangeUserStatusRequest request, CancellationToken cancellationToken);
    Task<UserManagementResult<string>> ResetTeacherPasswordAsync(Guid id, CancellationToken cancellationToken);

    Task<UserManagementResult<CreatedUserResponse>> CreateStudentAsync(Guid teacherId, CreateStudentRequest request, CancellationToken cancellationToken);
    Task<UserManagementResult<PagedResult<ManagedUserResponse>>> ListStudentsAsync(Guid teacherId, UserListQuery query, CancellationToken cancellationToken);
    Task<UserManagementResult<ManagedUserResponse>> GetStudentAsync(Guid teacherId, Guid studentId, CancellationToken cancellationToken);
    Task<UserManagementResult<ManagedUserResponse>> UpdateStudentAsync(Guid teacherId, Guid studentId, UpdateStudentProfileRequest request, CancellationToken cancellationToken);
    Task<UserManagementResult<bool>> SetStudentStatusAsync(Guid teacherId, Guid studentId, ChangeUserStatusRequest request, CancellationToken cancellationToken);
    Task<UserManagementResult<string>> ResetStudentPasswordAsync(Guid teacherId, Guid studentId, CancellationToken cancellationToken);
}
