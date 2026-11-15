using System.Net;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using SLES.Infrastructure.Persistence;

namespace SLES.Api.Hosting;

public static class DeploymentHosting
{
    public static IServiceCollection AddDeploymentHosting(this IServiceCollection services, IConfiguration config, bool development)
    {
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear(); options.KnownProxies.Clear();
            // With empty allowlists the middleware trusts everyone. Default to loopback only.
            var proxies = config.GetSection("ReverseProxy:KnownProxies").Get<string[]>() ?? [];
            options.KnownProxies.Add(IPAddress.Loopback); options.KnownProxies.Add(IPAddress.IPv6Loopback);
            foreach (var proxy in proxies) options.KnownProxies.Add(IPAddress.Parse(proxy));
        });
        services.AddHealthChecks().AddCheck<DatabaseReadiness>("database", tags: ["ready"]);
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("authentication", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = config.GetValue("AuthenticationRateLimit:PermitLimit", development ? 1000 : 30), Window = TimeSpan.FromMinutes(1), QueueLimit = 0, AutoReplenishment = true }));
        });
        return services;
    }
}

public sealed class DatabaseReadiness(SlesDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            // Also verifies the required application schema is present and readable by the app role.
            await db.Database.ExecuteSqlRawAsync("SELECT difficulty, legacy_difficulty FROM questions LIMIT 0", cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested)
        {
            return HealthCheckResult.Unhealthy(); // Never expose connection/SQL/credentials to probes.
        }
    }
}
