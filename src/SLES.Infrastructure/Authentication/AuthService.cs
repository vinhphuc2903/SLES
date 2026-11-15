using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Net;
using SLES.Application.Authentication;
using SLES.Domain.Entities;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.Authentication;

public sealed class AuthService(
    SlesDbContext dbContext,
    IPasswordHasher<User> passwordHasher,
    ITokenService tokenService,
    JwtOptions options) : IAuthService
{
    public async Task<LoginResult> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent, CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.Include(x => x.Role)
            .SingleOrDefaultAsync(x => x.Username == request.Username && x.DeletedAt == null, cancellationToken);

        if (user is null || passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
        {
            return LoginResult.Failed(LoginFailure.InvalidCredentials);
        }

        if (!user.IsActive)
        {
            return LoginResult.Failed(LoginFailure.InactiveAccount);
        }

        user.LastLoginAt = DateTimeOffset.UtcNow;
        return await CreateSessionAsync(user, user.Role.Code, ipAddress, userAgent, cancellationToken);
    }

    public async Task<LoginResult> RefreshAsync(string refreshToken, string? ipAddress, string? userAgent, CancellationToken cancellationToken)
    {
        var hash = tokenService.HashRefreshToken(refreshToken);
        var existing = await dbContext.RefreshTokens.Include(x => x.User).ThenInclude(x => x.Role)
            .SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);

        if (existing is null || existing.RevokedAt is not null || existing.ExpiresAt <= DateTimeOffset.UtcNow ||
            existing.User.DeletedAt is not null || !existing.User.IsActive)
        {
            return LoginResult.Failed(LoginFailure.InvalidRefreshToken);
        }

        existing.RevokedAt = DateTimeOffset.UtcNow;
        return await CreateSessionAsync(existing.User, existing.User.Role.Code, ipAddress, userAgent, cancellationToken);
    }

    public async Task LogoutAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var hash = tokenService.HashRefreshToken(refreshToken);
        var token = await dbContext.RefreshTokens.SingleOrDefaultAsync(x => x.TokenHash == hash, cancellationToken);
        if (token is not null && token.RevokedAt is null)
        {
            token.RevokedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<CurrentUserResponse?> GetCurrentUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        return await dbContext.Users.AsNoTracking().Include(x => x.Role)
            .Where(x => x.Id == userId && x.DeletedAt == null && x.IsActive)
            .Select(x => new CurrentUserResponse(x.Id, x.Username, x.FullName, x.Role.Code, x.GradeId, x.MustChangePassword))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.SingleOrDefaultAsync(x => x.Id == userId && x.DeletedAt == null && x.IsActive, cancellationToken);
        if (user is null || passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            return false;
        }

        user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword);
        user.MustChangePassword = false;
        var now = DateTimeOffset.UtcNow;
        await dbContext.RefreshTokens.Where(x => x.UserId == userId && x.RevokedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(x => x.RevokedAt, now), cancellationToken);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task<LoginResult> CreateSessionAsync(User user, string roleCode, string? ipAddress, string? userAgent, CancellationToken cancellationToken)
    {
        var refreshToken = tokenService.CreateRefreshToken();
        var refreshExpiresAt = DateTimeOffset.UtcNow.AddDays(options.RefreshTokenExpirationDays);
        dbContext.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = tokenService.HashRefreshToken(refreshToken),
            ExpiresAt = refreshExpiresAt,
            CreatedAt = DateTimeOffset.UtcNow,
            CreatedIp = IPAddress.TryParse(ipAddress, out var parsedIp) ? parsedIp : null,
            UserAgent = userAgent
        });
        var (accessToken, accessExpiresAt) = tokenService.CreateAccessToken(user, roleCode);
        await dbContext.SaveChangesAsync(cancellationToken);
        var profile = new CurrentUserResponse(user.Id, user.Username, user.FullName, roleCode, user.GradeId, user.MustChangePassword);
        return LoginResult.Success(new AuthSession(new AuthResponse(accessToken, accessExpiresAt, profile), refreshToken, refreshExpiresAt));
    }
}
