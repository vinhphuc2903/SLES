using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SLES.Api.Controllers;
using SLES.Application.BulkManagement;

namespace SLES.UnitTests.BulkManagement;

public sealed class BulkEndpointsTests
{
    public static IEnumerable<object[]> Routes => new[] {
        new object[] { "/api/teacher/questions/bulk-delete", "TEACHER" },
        new object[] { "/api/teacher/chapters/bulk-delete", "TEACHER" },
        new object[] { "/api/teacher/students/bulk-deactivate", "TEACHER" },
        new object[] { "/api/admin/teachers/bulk-deactivate", "ADMIN" },
        new object[] { "/api/teacher/exams/bulk-close", "TEACHER" } };

    [Theory, MemberData(nameof(Routes))]
    public async Task Every_route_enforces_roles_validates_payload_and_uses_bulk_contract(string route, string allowed)
    {
        await using var f = new BulkManagementTests.Fixture();
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddSingleton<IBulkManagementService>(f.Service);
        builder.Services.AddControllers().AddApplicationPart(typeof(BulkManagementController).Assembly);
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, Handler>("Test", _ => { });
        builder.Services.AddAuthorization();
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapControllers(); await app.StartAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(route, new { ids = new[] { Guid.NewGuid() } })).StatusCode);
        foreach (var role in new[] { "ADMIN", "TEACHER", "STUDENT" })
        {
            client.DefaultRequestHeaders.Remove("X-Role"); client.DefaultRequestHeaders.Add("X-Role", role);
            client.DefaultRequestHeaders.Remove("X-Actor"); client.DefaultRequestHeaders.Add("X-Actor", (role == "ADMIN" ? f.Admin.Id : f.Teacher.Id).ToString());
            var response = await client.PostAsJsonAsync(route, new { ids = new[] { Guid.NewGuid() } });
            Assert.Equal(role == allowed ? HttpStatusCode.OK : HttpStatusCode.Forbidden, response.StatusCode);
        }
        client.DefaultRequestHeaders.Remove("X-Role"); client.DefaultRequestHeaders.Add("X-Role", allowed);
        client.DefaultRequestHeaders.Remove("X-Actor"); client.DefaultRequestHeaders.Add("X-Actor", (allowed == "ADMIN" ? f.Admin.Id : f.Teacher.Id).ToString());
        foreach (var ids in new[] { Array.Empty<string>(), new[] { "bad" }, new[] { Guid.Empty.ToString() }, Enumerable.Range(0, 101).Select(_ => Guid.NewGuid().ToString()).ToArray() })
        {
            var response = await client.PostAsJsonAsync(route, new { ids }); Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains("invalid_request", await response.Content.ReadAsStringAsync());
        }
    }
    private sealed class Handler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Role", out var role)) return Task.FromResult(AuthenticateResult.NoResult());
            var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.Role, role.ToString()), new Claim(ClaimTypes.NameIdentifier, Request.Headers["X-Actor"].ToString()) }, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
