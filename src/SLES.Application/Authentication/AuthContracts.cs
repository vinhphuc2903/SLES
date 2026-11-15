namespace SLES.Application.Authentication;

public sealed record LoginRequest(string Username, string Password);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
public sealed record CurrentUserResponse(Guid Id, string Username, string FullName, string Role, Guid? GradeId, bool MustChangePassword);
public sealed record AuthResponse(string AccessToken, DateTimeOffset AccessTokenExpiresAt, CurrentUserResponse User);

public sealed record AuthSession(AuthResponse Response, string RefreshToken, DateTimeOffset RefreshTokenExpiresAt);

public enum LoginFailure
{
    InvalidCredentials,
    InactiveAccount,
    InvalidRefreshToken
}

public sealed record LoginResult(AuthSession? Session, LoginFailure? Failure)
{
    public static LoginResult Success(AuthSession session) => new(session, null);
    public static LoginResult Failed(LoginFailure failure) => new(null, failure);
}

public interface IAuthService
{
    Task<LoginResult> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent, CancellationToken cancellationToken);
    Task<LoginResult> RefreshAsync(string refreshToken, string? ipAddress, string? userAgent, CancellationToken cancellationToken);
    Task LogoutAsync(string refreshToken, CancellationToken cancellationToken);
    Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId, CancellationToken cancellationToken);
    Task<bool> ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken cancellationToken);
}
