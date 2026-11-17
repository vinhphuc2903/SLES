using SLES.Api.Hosting;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;


using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Text.Json.Serialization;
using SLES.Application.Authentication;
using SLES.Domain.Entities;
using SLES.Infrastructure.Authentication;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.UserManagement;
using SLES.Application.UserManagement;
using SLES.Application.ChapterManagement;
using SLES.Infrastructure.ChapterManagement;
using SLES.Application.QuestionBank;
using SLES.Infrastructure.QuestionBank;
using SLES.Application.Practice;
using SLES.Infrastructure.Practice;
using SLES.Application.ExamManagement;
using SLES.Infrastructure.ExamManagement;

// Runtime image needs no shell/curl package for Docker readiness probes.
if (args.Contains("--health-check"))
{
    try
    {
        using var probe = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        Environment.ExitCode = (await probe.GetAsync("http://127.0.0.1:8080/health/ready")).IsSuccessStatusCode ? 0 : 1;
    }
    catch { Environment.ExitCode = 1; }
    return;
}

var builder = WebApplication.CreateBuilder(args);
if (Environment.GetEnvironmentVariable("SLES_CONFIG_FILE") is { Length: > 0 } secretFile)
    builder.Configuration.AddJsonFile(secretFile, optional: false, reloadOnChange: false).AddEnvironmentVariables();
builder.Services.AddDeploymentHosting(builder.Configuration, builder.Environment.IsDevelopment());

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("JWT configuration is missing.");
if (string.IsNullOrWhiteSpace(jwtOptions.SigningKey) || jwtOptions.SigningKey.Length < 32 ||
    string.IsNullOrWhiteSpace(jwtOptions.Issuer) || string.IsNullOrWhiteSpace(jwtOptions.Audience))
{
    throw new InvalidOperationException("JWT Issuer, Audience, and a SigningKey of at least 32 characters must be configured through User Secrets or environment variables.");
}

// ==========================================
// 1. Database Configuration
// ==========================================

var connectionString = builder.Configuration
    .GetConnectionString("DefaultConnection");

if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Database connection string 'DefaultConnection' is missing.");
}

builder.Services.AddDbContext<SlesDbContext>(options =>
    options.UseNpgsql(connectionString));
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<ITokenService, TokenService>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IUserManagementService, UserManagementService>();
builder.Services.AddScoped<SLES.Application.BulkManagement.IBulkManagementService, SLES.Infrastructure.BulkManagement.BulkManagementService>();
builder.Services.AddScoped<ISubjectManagementService, SubjectManagementService>();
builder.Services.AddScoped<IGradeLookupService, GradeLookupService>();
builder.Services.AddScoped<IStudentLearningService, StudentLearningService>();
builder.Services.AddScoped<IChapterManagementService, ChapterManagementService>();
builder.Services.AddScoped<IChapterPublicationValidator, ChapterPublicationValidator>();
builder.Services.AddScoped<IQuestionBankService, QuestionBankService>();
builder.Services.AddSingleton<SLES.Infrastructure.QuestionImport.ImportPreviewStore>();
builder.Services.AddSingleton<SLES.Infrastructure.QuestionImport.ExcelQuestionReader>();
builder.Services.AddScoped<IQuestionImportService, SLES.Infrastructure.QuestionImport.QuestionImportService>();
builder.Services.AddScoped<IPracticeService, PracticeService>();
builder.Services.AddScoped<IExamManagementService, ExamManagementService>();
builder.Services.AddHostedService<AdminBootstrapService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SigningKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
            NameClaimType = JwtRegisteredClaimNames.UniqueName,
            RoleClaimType = "role"
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy => policy.RequireRole("ADMIN"));
    options.AddPolicy("Teacher", policy => policy.RequireRole("TEACHER"));
    options.AddPolicy("Student", policy => policy.RequireRole("STUDENT"));
});

// ==========================================
// 2. API Services
// ==========================================

builder.Services.AddControllers().AddJsonOptions(options => options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();

// ==========================================
// 3. Build Application
// ==========================================

var app = builder.Build();

// ==========================================
// 4. HTTP Request Pipeline
// ==========================================

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseForwardedHeaders();
app.Use(async (context, next) =>
{
    // Server-generated identifier; never log arbitrary request headers or credentials.
    var correlationId = Guid.NewGuid().ToString("N");
    context.Response.Headers["X-Correlation-ID"] = correlationId;
    using var scope = app.Logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId });
    try { await next(context); }
    catch (Exception exception) when (!app.Environment.IsDevelopment() && !context.Response.HasStarted)
    {
        app.Logger.LogError(exception, "Unhandled request error ({CorrelationId})", correlationId);
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { error = new { code = "server_error", message = "Request failed.", correlationId } });
    }
});
// Nginx owns the HTTP redirect; internal health probes must not redirect.
app.UseWhen(context => !context.Request.Path.StartsWithSegments("/health"), branch => branch.UseHttpsRedirection());
app.UseRateLimiter();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
