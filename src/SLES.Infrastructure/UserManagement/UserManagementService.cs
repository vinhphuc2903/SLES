using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SLES.Application.UserManagement;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.UserManagement;

public sealed class UserManagementService(SlesDbContext dbContext, IPasswordHasher<User> passwordHasher) : IUserManagementService
{
    public async Task<UserManagementResult<CreatedUserResponse>> CreateTeacherAsync(Guid actorId, CreateTeacherRequest request, CancellationToken cancellationToken)
    {
        if (!await IsRoleAsync(actorId, RoleCodes.Admin, cancellationToken)) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.Forbidden);
        if (!IsValidProfile(request.Username, request.FullName)) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.InvalidRequest);
        if (await UsernameExistsAsync(request.Username, cancellationToken)) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.DuplicateUsername);
        var role = await FindRoleAsync(RoleCodes.Teacher, cancellationToken);
        if (role is null) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.InvalidRequest);

        var password = GenerateTemporaryPassword();
        var user = NewUser(role.Id, request.Username, request.FullName, request.Email, request.Phone, null, null, password);
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);
        return UserManagementResult<CreatedUserResponse>.Success(new CreatedUserResponse(ToResponse(user, RoleCodes.Teacher), password));
    }

    public Task<UserManagementResult<PagedResult<ManagedUserResponse>>> ListTeachersAsync(UserListQuery query, CancellationToken cancellationToken) =>
        ListUsersAsync(dbContext.Users.AsNoTracking().Include(x => x.Role).Where(x => x.DeletedAt == null && x.Role.Code == RoleCodes.Teacher), query, cancellationToken);

    public async Task<UserManagementResult<ManagedUserResponse>> GetTeacherAsync(Guid id, CancellationToken cancellationToken)
    {
        var user = await FindTeacherAsync(id, cancellationToken);
        return user is null ? UserManagementResult<ManagedUserResponse>.Fail(UserManagementFailure.NotFound) : UserManagementResult<ManagedUserResponse>.Success(ToResponse(user, RoleCodes.Teacher));
    }

    public async Task<UserManagementResult<ManagedUserResponse>> UpdateTeacherAsync(Guid id, UpdateUserProfileRequest request, CancellationToken cancellationToken)
    {
        var user = await FindTeacherAsync(id, cancellationToken);
        if (user is null) return UserManagementResult<ManagedUserResponse>.Fail(UserManagementFailure.NotFound);
        if (string.IsNullOrWhiteSpace(request.FullName)) return UserManagementResult<ManagedUserResponse>.Fail(UserManagementFailure.InvalidRequest);
        ApplyProfile(user, request.FullName, request.Email, request.Phone);
        await dbContext.SaveChangesAsync(cancellationToken);
        return UserManagementResult<ManagedUserResponse>.Success(ToResponse(user, RoleCodes.Teacher));
    }

    public async Task<UserManagementResult<bool>> SetTeacherStatusAsync(Guid id, ChangeUserStatusRequest request, CancellationToken cancellationToken)
    {
        var user = await FindTeacherWithTokensAsync(id, cancellationToken);
        if (user is null) return UserManagementResult<bool>.Fail(UserManagementFailure.NotFound);
        await SetStatusAsync(user, request.IsActive, cancellationToken);
        return UserManagementResult<bool>.Success(true);
    }

    public async Task<UserManagementResult<string>> ResetTeacherPasswordAsync(Guid id, CancellationToken cancellationToken)
    {
        var user = await FindTeacherWithTokensAsync(id, cancellationToken);
        return user is null ? UserManagementResult<string>.Fail(UserManagementFailure.NotFound) : UserManagementResult<string>.Success(await ResetPasswordAsync(user, cancellationToken));
    }

    public async Task<UserManagementResult<CreatedUserResponse>> CreateStudentAsync(Guid teacherId, CreateStudentRequest request, CancellationToken cancellationToken)
    {
        if (!await IsRoleAsync(teacherId, RoleCodes.Teacher, cancellationToken)) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.Forbidden);
        if (!IsValidProfile(request.Username, request.FullName)) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.InvalidRequest);
        if (await UsernameExistsAsync(request.Username, cancellationToken)) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.DuplicateUsername);
        if (!await dbContext.Grades.AnyAsync(x => x.Id == request.GradeId && x.IsActive, cancellationToken)) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.InvalidGrade);
        var role = await FindRoleAsync(RoleCodes.Student, cancellationToken);
        if (role is null) return UserManagementResult<CreatedUserResponse>.Fail(UserManagementFailure.InvalidRequest);

        var password = GenerateTemporaryPassword();
        var user = NewUser(role.Id, request.Username, request.FullName, request.Email, request.Phone, teacherId, request.GradeId, password);
        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);
        return UserManagementResult<CreatedUserResponse>.Success(new CreatedUserResponse(ToResponse(user, RoleCodes.Student), password));
    }

    public Task<UserManagementResult<PagedResult<ManagedUserResponse>>> ListStudentsAsync(Guid teacherId, UserListQuery query, CancellationToken cancellationToken) =>
        ListUsersAsync(dbContext.Users.AsNoTracking().Include(x => x.Role).Where(x => x.DeletedAt == null && x.CreatedByTeacherId == teacherId && x.Role.Code == RoleCodes.Student), query, cancellationToken);

    public async Task<UserManagementResult<ManagedUserResponse>> GetStudentAsync(Guid teacherId, Guid studentId, CancellationToken cancellationToken)
    {
        var user = await FindStudentAsync(teacherId, studentId, cancellationToken);
        return user is null ? UserManagementResult<ManagedUserResponse>.Fail(UserManagementFailure.NotFound) : UserManagementResult<ManagedUserResponse>.Success(ToResponse(user, RoleCodes.Student));
    }

    public async Task<UserManagementResult<ManagedUserResponse>> UpdateStudentAsync(Guid teacherId, Guid studentId, UpdateStudentProfileRequest request, CancellationToken cancellationToken)
    {
        var user = await FindStudentAsync(teacherId, studentId, cancellationToken);
        if (user is null) return UserManagementResult<ManagedUserResponse>.Fail(UserManagementFailure.NotFound);
        if (string.IsNullOrWhiteSpace(request.FullName)) return UserManagementResult<ManagedUserResponse>.Fail(UserManagementFailure.InvalidRequest);
        if (!await dbContext.Grades.AnyAsync(x => x.Id == request.GradeId && x.IsActive, cancellationToken)) return UserManagementResult<ManagedUserResponse>.Fail(UserManagementFailure.InvalidGrade);
        ApplyProfile(user, request.FullName, request.Email, request.Phone);
        user.GradeId = request.GradeId;
        await dbContext.SaveChangesAsync(cancellationToken);
        return UserManagementResult<ManagedUserResponse>.Success(ToResponse(user, RoleCodes.Student));
    }

    public async Task<UserManagementResult<bool>> SetStudentStatusAsync(Guid teacherId, Guid studentId, ChangeUserStatusRequest request, CancellationToken cancellationToken)
    {
        var user = await FindStudentWithTokensAsync(teacherId, studentId, cancellationToken);
        if (user is null) return UserManagementResult<bool>.Fail(UserManagementFailure.NotFound);
        await SetStatusAsync(user, request.IsActive, cancellationToken);
        return UserManagementResult<bool>.Success(true);
    }

    public async Task<UserManagementResult<string>> ResetStudentPasswordAsync(Guid teacherId, Guid studentId, CancellationToken cancellationToken)
    {
        var user = await FindStudentWithTokensAsync(teacherId, studentId, cancellationToken);
        return user is null ? UserManagementResult<string>.Fail(UserManagementFailure.NotFound) : UserManagementResult<string>.Success(await ResetPasswordAsync(user, cancellationToken));
    }

    private async Task<UserManagementResult<PagedResult<ManagedUserResponse>>> ListUsersAsync(IQueryable<User> users, UserListQuery query, CancellationToken cancellationToken)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100) return UserManagementResult<PagedResult<ManagedUserResponse>>.Fail(UserManagementFailure.InvalidRequest);
        if (!string.IsNullOrWhiteSpace(query.Search)) users = users.Where(x => x.Username.Contains(query.Search) || x.FullName.Contains(query.Search));
        if (query.IsActive.HasValue) users = users.Where(x => x.IsActive == query.IsActive.Value);
        if (query.GradeId.HasValue) users = users.Where(x => x.GradeId == query.GradeId.Value);
        var total = await users.CountAsync(cancellationToken);
        users = query.SortDescending ? users.OrderByDescending(x => x.CreatedAt) : users.OrderBy(x => x.CreatedAt);
        var items = await users.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(x => new ManagedUserResponse(x.Id, x.Username, x.FullName, x.Role.Code, x.GradeId, x.Email, x.Phone, x.IsActive, x.MustChangePassword, x.CreatedAt)).ToListAsync(cancellationToken);
        return UserManagementResult<PagedResult<ManagedUserResponse>>.Success(new PagedResult<ManagedUserResponse>(items, query.Page, query.PageSize, total));
    }

    private Task<User?> FindTeacherAsync(Guid id, CancellationToken ct) => dbContext.Users.Include(x => x.Role).SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null && x.Role.Code == RoleCodes.Teacher, ct);
    private Task<User?> FindTeacherWithTokensAsync(Guid id, CancellationToken ct) => dbContext.Users.Include(x => x.Role).Include(x => x.RefreshTokens).SingleOrDefaultAsync(x => x.Id == id && x.DeletedAt == null && x.Role.Code == RoleCodes.Teacher, ct);
    private Task<User?> FindStudentAsync(Guid teacherId, Guid studentId, CancellationToken ct) => dbContext.Users.Include(x => x.Role).SingleOrDefaultAsync(x => x.Id == studentId && x.CreatedByTeacherId == teacherId && x.DeletedAt == null && x.Role.Code == RoleCodes.Student, ct);
    private Task<User?> FindStudentWithTokensAsync(Guid teacherId, Guid studentId, CancellationToken ct) => dbContext.Users.Include(x => x.Role).Include(x => x.RefreshTokens).SingleOrDefaultAsync(x => x.Id == studentId && x.CreatedByTeacherId == teacherId && x.DeletedAt == null && x.Role.Code == RoleCodes.Student, ct);
    private Task<Role?> FindRoleAsync(string code, CancellationToken ct) => dbContext.Roles.SingleOrDefaultAsync(x => x.Code == code, ct);
    private Task<bool> UsernameExistsAsync(string username, CancellationToken ct) => dbContext.Users.AnyAsync(x => x.Username == username, ct);
    private Task<bool> IsRoleAsync(Guid userId, string roleCode, CancellationToken ct) => dbContext.Users.AnyAsync(x => x.Id == userId && x.DeletedAt == null && x.IsActive && x.Role.Code == roleCode, ct);

    private User NewUser(Guid roleId, string username, string fullName, string? email, string? phone, Guid? ownerId, Guid? gradeId, string password)
    {
        var now = DateTimeOffset.UtcNow;
        var user = new User { RoleId = roleId, Username = username.Trim(), FullName = fullName.Trim(), Email = Normalize(email), Phone = Normalize(phone), CreatedByTeacherId = ownerId, GradeId = gradeId, IsActive = true, MustChangePassword = true, CreatedAt = now, UpdatedAt = now };
        user.PasswordHash = passwordHasher.HashPassword(user, password);
        return user;
    }
    private static bool IsValidProfile(string username, string fullName) => !string.IsNullOrWhiteSpace(username) && username.Trim().Length is >= 3 and <= 100 && !string.IsNullOrWhiteSpace(fullName) && fullName.Trim().Length <= 255;
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ManagedUserResponse ToResponse(User user, string role) => new(user.Id, user.Username, user.FullName, role, user.GradeId, user.Email, user.Phone, user.IsActive, user.MustChangePassword, user.CreatedAt);
    private static void ApplyProfile(User user, string fullName, string? email, string? phone) { user.FullName = fullName.Trim(); user.Email = Normalize(email); user.Phone = Normalize(phone); user.UpdatedAt = DateTimeOffset.UtcNow; }
    private async Task SetStatusAsync(User user, bool isActive, CancellationToken ct) { user.IsActive = isActive; user.UpdatedAt = DateTimeOffset.UtcNow; if (!isActive) RevokeTokens(user); await dbContext.SaveChangesAsync(ct); }
    private async Task<string> ResetPasswordAsync(User user, CancellationToken ct) { var password = GenerateTemporaryPassword(); user.PasswordHash = passwordHasher.HashPassword(user, password); user.MustChangePassword = true; user.UpdatedAt = DateTimeOffset.UtcNow; RevokeTokens(user); await dbContext.SaveChangesAsync(ct); return password; }
    private static void RevokeTokens(User user) { var now = DateTimeOffset.UtcNow; foreach (var token in user.RefreshTokens.Where(x => x.RevokedAt is null)) token.RevokedAt = now; }
    private static string GenerateTemporaryPassword() { const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%"; var bytes = RandomNumberGenerator.GetBytes(20); return string.Concat(bytes.Select(x => alphabet[x % alphabet.Length])); }
}
