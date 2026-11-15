using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SLES.Api.Controllers;
using SLES.Application.ChapterManagement;
using SLES.Domain.Entities;
using SLES.Infrastructure.ChapterManagement;
using SLES.Infrastructure.Persistence;

namespace SLES.UnitTests.ChapterManagement;

public sealed class AdminSubjectEndpointsTests
{
    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("ADMIN", HttpStatusCode.Forbidden)]
    [InlineData("STUDENT", HttpStatusCode.Forbidden)]
    [InlineData("TEACHER", HttpStatusCode.NotFound)]
    public async Task Difficulty_bulk_and_blueprint_are_teacher_scoped(string? role, HttpStatusCode expected)
    {
        await using var app=await CreateAppAsync();using var client=app.GetTestClient();
        if(role is not null)client.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Test",role);
        var id=Guid.NewGuid();
        Assert.Equal(expected,(await client.PatchAsJsonAsync("/api/teacher/questions/"+id+"/difficulty",new {difficulty=0})).StatusCode);
        Assert.Equal(expected,(await client.PostAsJsonAsync("/api/teacher/chapters/"+id+"/questions/bulk-publish",new {requestId=Guid.NewGuid(),allEligible=true,questionIds=Array.Empty<Guid>()})).StatusCode);
        Assert.Equal(expected,(await client.GetAsync("/api/teacher/chapters/"+id+"/exam-blueprint")).StatusCode);
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("ADMIN", HttpStatusCode.Forbidden)]
    [InlineData("STUDENT", HttpStatusCode.Forbidden)]
    [InlineData("TEACHER", HttpStatusCode.OK)]
    public async Task Excel_import_endpoints_require_teacher(string? role, HttpStatusCode expected)
    {
        await using var app = await CreateAppAsync(); using var client = app.GetTestClient();
        if (role is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", role);
        var template = await client.GetAsync("/api/teacher/questions/import/template"); Assert.Equal(expected, template.StatusCode);
        var path = "/api/teacher/chapters/" + Guid.NewGuid() + "/questions/import";
        using var body = new MultipartFormDataContent(); body.Add(new ByteArrayContent(new byte[] {1,2,3}), "file", "test.xlsx");
        var unavailable = role == "TEACHER" ? HttpStatusCode.NotFound : expected;
        Assert.Equal(unavailable, (await client.PostAsync(path + "/preview", body)).StatusCode);
        Assert.Equal(unavailable, (await client.PostAsJsonAsync(path + "/confirm", new { token = "unknown" })).StatusCode);
        Assert.Equal(unavailable, (await client.GetAsync(path + "/status?token=unknown")).StatusCode);
        if (role == "TEACHER") Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", template.Content.Headers.ContentType!.MediaType);
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("ADMIN", HttpStatusCode.Forbidden)]
    [InlineData("TEACHER", HttpStatusCode.Forbidden)]
    [InlineData("STUDENT", HttpStatusCode.NotFound)]
    public async Task Student_exam_reads_require_student_and_own_identity(string? role, HttpStatusCode expected)
    {
        await using var app = await CreateAppAsync(); using var client = app.GetTestClient();
        if (role is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", role);
        foreach (var path in new[] { "/api/student/exams", "/api/student/exams/history", "/api/student/exams/" + Guid.NewGuid() })
            Assert.Equal(expected, (await client.GetAsync(path)).StatusCode);
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("ADMIN", HttpStatusCode.Forbidden)]
    [InlineData("TEACHER", HttpStatusCode.Forbidden)]
    [InlineData("STUDENT", HttpStatusCode.OK)]
    public async Task Student_subject_lookup_requires_student(string? role, HttpStatusCode expected)
    {
        await using var app = await CreateAppAsync();
        using var client = app.GetTestClient();
        if (role is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", role);
        Assert.Equal(expected, (await client.GetAsync("/api/student/subjects")).StatusCode);
        Assert.Equal(role == "STUDENT" ? HttpStatusCode.NotFound : expected, (await client.GetAsync("/api/student/subjects/" + Guid.NewGuid())).StatusCode);
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("ADMIN", HttpStatusCode.Forbidden)]
    [InlineData("STUDENT", HttpStatusCode.Forbidden)]
    [InlineData("TEACHER", HttpStatusCode.NotFound)]
    public async Task Question_progress_requires_teacher_and_owned_chapter(string? role, HttpStatusCode expected)
    {
        await using var app = await CreateAppAsync();
        using var client = app.GetTestClient();
        if (role is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", role);
        Assert.Equal(expected, (await client.GetAsync("/api/teacher/chapters/" + Guid.NewGuid() + "/questions/progress")).StatusCode);
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("ADMIN", HttpStatusCode.Forbidden)]
    [InlineData("STUDENT", HttpStatusCode.Forbidden)]
    public async Task Grade_lookup_requires_teacher(string? role, HttpStatusCode expected)
    {
        await using var app = await CreateAppAsync();
        using var client = app.GetTestClient();
        if (role is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", role);
        Assert.Equal(expected, (await client.GetAsync("/api/teacher/grades")).StatusCode);
    }

    [Fact]
    public async Task Teacher_grade_lookup_returns_only_active_grades_in_display_order()
    {
        await using var app = await CreateAppAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", "TEACHER");
        var grades = await client.GetFromJsonAsync<GradeLookupResponse[]>("/api/teacher/grades");
        Assert.NotNull(grades);
        Assert.Equal(new[] { "G10", "G11" }, grades.Select(x => x.Code));
        Assert.All(grades, grade => Assert.NotEqual(Guid.Empty, grade.Id));
    }

    [Theory]
    [InlineData(null, HttpStatusCode.Unauthorized)]
    [InlineData("TEACHER", HttpStatusCode.Forbidden)]
    [InlineData("STUDENT", HttpStatusCode.Forbidden)]
    public async Task Admin_subject_reads_require_admin(string? role, HttpStatusCode expected)
    {
        await using var app = await CreateAppAsync();
        using var client = app.GetTestClient();
        if (role is not null) client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", role);
        Assert.Equal(expected, (await client.GetAsync("/api/admin/subjects")).StatusCode);
        Assert.Equal(expected, (await client.GetAsync("/api/admin/subjects/" + InactiveId)).StatusCode);
    }

    [Fact]
    public async Task Admin_list_counts_all_rows_before_pagination_and_supports_inactive_filter_search_and_detail()
    {
        await using var app = await CreateAppAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", "ADMIN");
        var all = await client.GetFromJsonAsync<PagedResult<SubjectResponse>>("/api/admin/subjects?pageSize=1");
        Assert.Equal(3, all!.TotalCount);
        Assert.Single(all.Items);
        var filtered = await client.GetFromJsonAsync<PagedResult<SubjectResponse>>("/api/admin/subjects?isActive=false&search=HIS");
        Assert.Equal(1, filtered!.TotalCount);
        Assert.Equal(InactiveId, Assert.Single(filtered.Items).Id);
        var detail = await client.GetFromJsonAsync<SubjectResponse>("/api/admin/subjects/" + InactiveId);
        Assert.False(detail!.IsActive);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/admin/subjects/" + Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/subjects?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/subjects?pageSize=101")).StatusCode);
    }

    [Fact]
    public async Task Existing_public_subject_list_remains_active_only()
    {
        await using var app = await CreateAppAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Test", "STUDENT");
        var subjects = await client.GetFromJsonAsync<PagedResult<SubjectResponse>>("/api/subjects?isActive=false");
        Assert.Equal(2, subjects!.TotalCount);
        Assert.All(subjects.Items, item => Assert.True(item.IsActive));
    }

    private static readonly Guid InactiveId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static async Task<WebApplication> CreateAppAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var database = Guid.NewGuid().ToString();
        builder.Services.AddScoped<SlesDbContext>(_ => new TestDbContext(
            new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(database).Options));
        builder.Services.AddScoped<SLES.Application.ExamManagement.IExamManagementService, SLES.Infrastructure.ExamManagement.ExamManagementService>();
        builder.Services.AddScoped<IChapterPublicationValidator, ChapterPublicationValidator>();
        builder.Services.AddSingleton<SLES.Infrastructure.QuestionImport.ImportPreviewStore>();
        builder.Services.AddSingleton<SLES.Infrastructure.QuestionImport.ExcelQuestionReader>();
        builder.Services.AddScoped<SLES.Application.QuestionBank.IQuestionImportService, SLES.Infrastructure.QuestionImport.QuestionImportService>();
        builder.Services.AddScoped<ISubjectManagementService, SubjectManagementService>();
        builder.Services.AddScoped<IGradeLookupService, GradeLookupService>();
        builder.Services.AddScoped<IStudentLearningService, StudentLearningService>();
        builder.Services.AddScoped<SLES.Application.QuestionBank.IQuestionBankService, SLES.Infrastructure.QuestionBank.QuestionBankService>();
        builder.Services.AddControllers().AddApplicationPart(typeof(AdminSubjectsController).Assembly);
        builder.Services.AddAuthentication("Test").AddScheme<AuthenticationSchemeOptions, RoleHandler>("Test", _ => { });
        builder.Services.AddAuthorization();
        var app = builder.Build();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SlesDbContext>();
            db.Grades.AddRange(
                new Grade { Code = "G11", Name = "Khối 11", DisplayOrder = 2 },
                new Grade { Code = "G10", Name = "Khối 10", DisplayOrder = 1 },
                new Grade { Code = "OLD", Name = "Inactive", DisplayOrder = 3, IsActive = false });
            db.Subjects.AddRange(
                new Subject { Code = "MATH", Name = "Math", IsActive = true },
                new Subject { Code = "BIO", Name = "Biology", IsActive = true },
                new Subject { Id = InactiveId, Code = "HISTORY", Name = "History", IsActive = false });
            await db.SaveChangesAsync();
        }
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();
        await app.StartAsync();
        return app;
    }

    private sealed class TestDbContext(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Ignore<AuditLog>();
            modelBuilder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot);
        }
    }

    private sealed class RoleHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var header = Request.Headers.Authorization.ToString();
            if (!header.StartsWith("Test ", StringComparison.Ordinal)) return Task.FromResult(AuthenticateResult.NoResult());
            var principal = new ClaimsPrincipal(new ClaimsIdentity(new[] {
                new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
                new Claim(ClaimTypes.Role, header[5..]),
            }, Scheme.Name));
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name)));
        }
    }
}
