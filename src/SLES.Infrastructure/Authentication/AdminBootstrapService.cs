using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.Authentication;

public sealed class AdminBootstrapService(IServiceScopeFactory scopeFactory, IConfiguration configuration, ILogger<AdminBootstrapService> logger) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var username = configuration["BootstrapAdmin:Username"];
        var password = configuration["BootstrapAdmin:Password"];
        var fullName = configuration["BootstrapAdmin:FullName"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password) || password.Length < 12 || string.IsNullOrWhiteSpace(fullName))
        {
            return;
        }

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SlesDbContext>();
        var adminRole = await db.Roles.SingleOrDefaultAsync(x => x.Code == RoleCodes.Admin, cancellationToken);
        if (adminRole is null)
        {
            logger.LogError("Admin bootstrap skipped because the ADMIN role does not exist.");
            return;
        }

        if (await db.Users.AnyAsync(x => x.RoleId == adminRole.Id && x.DeletedAt == null, cancellationToken))
        {
            return;
        }

        var user = new User
        {
            RoleId = adminRole.Id,
            Username = username.Trim(),
            FullName = fullName.Trim(),
            IsActive = true,
            MustChangePassword = true,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        user.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<User>>().HashPassword(user, password);
        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        logger.LogWarning("Bootstrap ADMIN account '{Username}' was created. Remove BootstrapAdmin secrets now.", user.Username);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
