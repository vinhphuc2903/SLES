using System.Security.Claims;
using System.Net.Http.Headers;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SLES.Domain.Constants;

namespace SLES.UnitTests.Authentication;

public sealed class AuthorizationPipelineTests
{
    [Fact]
    public async Task Protected_endpoint_returns_401_without_an_authenticated_user()
    {
        await using var app = await CreateApplicationAsync();

        var response = await app.GetTestClient().GetAsync("/admin-only");

        Assert.Equal(StatusCodes.Status401Unauthorized, (int)response.StatusCode);
    }

    [Fact]
    public async Task Protected_endpoint_returns_403_for_the_wrong_role()
    {
        await using var app = await CreateApplicationAsync();
        var request = new HttpRequestMessage(HttpMethod.Get, "/admin-only");
        request.Headers.Authorization = new AuthenticationHeaderValue("Test", RoleCodes.Student);

        var response = await app.GetTestClient().SendAsync(request);

        Assert.Equal(StatusCodes.Status403Forbidden, (int)response.StatusCode);
    }

    private static async Task<WebApplication> CreateApplicationAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>("Test", _ => { });
        builder.Services.AddAuthorization(options => options.AddPolicy("Admin", policy => policy.RequireRole(RoleCodes.Admin)));
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGet("/admin-only", () => Results.NoContent()).RequireAuthorization("Admin");
        await app.StartAsync();
        return app;
    }

    private sealed class TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var value = Request.Headers.Authorization.ToString();
            if (!value.StartsWith("Test ", StringComparison.Ordinal))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            var role = value[5..];
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()), new Claim(ClaimTypes.Role, role) }, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
