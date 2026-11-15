using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SLES.Application.Authentication;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Infrastructure.Authentication;
using SLES.Infrastructure.Persistence;

namespace SLES.UnitTests.Authentication;

public sealed class AuthServiceTests
{
    [Fact]
    public async Task Login_with_valid_credentials_issues_tokens_and_role_claim()
    {
        await using var fixture = await AuthFixture.CreateAsync();

        var result = await fixture.Service.LoginAsync(new LoginRequest("teacher", "Correct-password-123"), "127.0.0.1", "test", CancellationToken.None);

        var session = Assert.IsType<AuthSession>(result.Session);
        Assert.NotEqual(session.RefreshToken, fixture.Db.RefreshTokens.Single().TokenHash);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(session.Response.AccessToken);
        Assert.Equal(RoleCodes.Teacher, jwt.Claims.Single(x => x.Type == "role").Value);
        Assert.Equal(fixture.User.Id.ToString(), jwt.Subject);
    }

    [Theory]
    [InlineData("teacher", "wrong-password")]
    [InlineData("missing-user", "Correct-password-123")]
    public async Task Login_with_invalid_credentials_returns_generic_failure(string username, string password)
    {
        await using var fixture = await AuthFixture.CreateAsync();

        var result = await fixture.Service.LoginAsync(new LoginRequest(username, password), null, null, CancellationToken.None);

        Assert.Null(result.Session);
        Assert.Equal(LoginFailure.InvalidCredentials, result.Failure);
    }

    [Fact]
    public async Task Login_rejects_inactive_or_deleted_accounts()
    {
        await using var inactive = await AuthFixture.CreateAsync(isActive: false);
        var inactiveResult = await inactive.Service.LoginAsync(new LoginRequest("teacher", "Correct-password-123"), null, null, CancellationToken.None);
        Assert.Equal(LoginFailure.InactiveAccount, inactiveResult.Failure);

        await using var deleted = await AuthFixture.CreateAsync(deleted: true);
        var deletedResult = await deleted.Service.LoginAsync(new LoginRequest("teacher", "Correct-password-123"), null, null, CancellationToken.None);
        Assert.Equal(LoginFailure.InvalidCredentials, deletedResult.Failure);
    }

    [Fact]
    public async Task Refresh_rotates_token_and_rejects_revoked_or_expired_tokens()
    {
        await using var fixture = await AuthFixture.CreateAsync();
        var initial = Assert.IsType<AuthSession>((await fixture.Service.LoginAsync(new LoginRequest("teacher", "Correct-password-123"), null, null, CancellationToken.None)).Session);

        var rotated = await fixture.Service.RefreshAsync(initial.RefreshToken, null, null, CancellationToken.None);
        Assert.NotNull(rotated.Session);
        Assert.NotEqual(initial.RefreshToken, rotated.Session!.RefreshToken);
        Assert.NotNull(fixture.Db.RefreshTokens.Single(x => x.TokenHash == fixture.Tokens.HashRefreshToken(initial.RefreshToken)).RevokedAt);

        var reuse = await fixture.Service.RefreshAsync(initial.RefreshToken, null, null, CancellationToken.None);
        Assert.Equal(LoginFailure.InvalidRefreshToken, reuse.Failure);

        fixture.Db.RefreshTokens.Add(new RefreshToken { UserId = fixture.User.Id, TokenHash = fixture.Tokens.HashRefreshToken("expired"), CreatedAt = DateTimeOffset.UtcNow.AddDays(-8), ExpiresAt = DateTimeOffset.UtcNow.AddDays(-1) });
        await fixture.Db.SaveChangesAsync(CancellationToken.None);
        var expired = await fixture.Service.RefreshAsync("expired", null, null, CancellationToken.None);
        Assert.Equal(LoginFailure.InvalidRefreshToken, expired.Failure);
    }

    [Fact]
    public async Task Logout_revokes_current_refresh_token()
    {
        await using var fixture = await AuthFixture.CreateAsync();
        var session = Assert.IsType<AuthSession>((await fixture.Service.LoginAsync(new LoginRequest("teacher", "Correct-password-123"), null, null, CancellationToken.None)).Session);

        await fixture.Service.LogoutAsync(session.RefreshToken, CancellationToken.None);

        Assert.NotNull(fixture.Db.RefreshTokens.Single().RevokedAt);
    }

    private sealed class AuthFixture : IAsyncDisposable
    {
        private AuthFixture(SlesDbContext db, User user, AuthService service, TokenService tokens)
        {
            Db = db;
            User = user;
            Service = service;
            Tokens = tokens;
        }

        public SlesDbContext Db { get; }
        public User User { get; }
        public AuthService Service { get; }
        public TokenService Tokens { get; }

        public static async Task<AuthFixture> CreateAsync(bool isActive = true, bool deleted = false)
        {
            var options = new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
            var db = new AuthTestDbContext(options);
            var role = new Role { Code = RoleCodes.Teacher, Name = "Teacher", CreatedAt = DateTimeOffset.UtcNow };
            var user = new User { Role = role, RoleId = role.Id, Username = "teacher", FullName = "Test Teacher", IsActive = isActive, DeletedAt = deleted ? DateTimeOffset.UtcNow : null, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            var hasher = new PasswordHasher<User>();
            user.PasswordHash = hasher.HashPassword(user, "Correct-password-123");
            db.Add(user);
            await db.SaveChangesAsync(CancellationToken.None);
            var jwtOptions = new JwtOptions { Issuer = "SLES.Tests", Audience = "SLES.Tests.Client", SigningKey = "test-signing-key-with-at-least-thirty-two-characters", AccessTokenExpirationMinutes = 15, RefreshTokenExpirationDays = 7 };
            var tokens = new TokenService(jwtOptions);
            return new AuthFixture(db, user, new AuthService(db, hasher, tokens, jwtOptions), tokens);
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private sealed class AuthTestDbContext(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Ignore<AuditLog>();
            modelBuilder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot);
        }
    }
}
