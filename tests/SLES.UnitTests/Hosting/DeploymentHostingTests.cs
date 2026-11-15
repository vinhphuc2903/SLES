using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using SLES.Api.Hosting;

namespace SLES.UnitTests.Hosting;

public sealed class DeploymentHostingTests
{
    [Theory]
    [InlineData("10.20.0.2", "https|198.51.100.10")]
    [InlineData("203.0.113.9", "http|203.0.113.9")]
    public async Task Forwarded_headers_only_trust_configured_proxy(string remote, string expected)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string,string?> { ["ReverseProxy:KnownProxies:0"] = "10.20.0.2" });
        builder.Services.AddDeploymentHosting(builder.Configuration, development: false);
        await using var app = builder.Build();
        app.Use(async (context,next) => { context.Connection.RemoteIpAddress=IPAddress.Parse(remote);await next(context); });
        app.UseForwardedHeaders();
        app.MapGet("/", (Microsoft.AspNetCore.Http.HttpContext context) => context.Request.Scheme+"|"+context.Connection.RemoteIpAddress);
        await app.StartAsync();using var client=app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Forwarded-For","198.51.100.10");
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto","https");
        Assert.Equal(expected,await client.GetStringAsync("/"));
    }
}
