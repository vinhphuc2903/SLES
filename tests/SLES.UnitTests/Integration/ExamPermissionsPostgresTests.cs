using Microsoft.AspNetCore.Http;

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using SLES.Api.Controllers;
using SLES.Application.Authentication;
using SLES.Application.ChapterManagement;
using SLES.Application.ExamManagement;
using SLES.Application.UserManagement;
using SLES.Domain.Entities;
using SLES.Infrastructure.Authentication;
using SLES.Infrastructure.ChapterManagement;
using SLES.Infrastructure.ExamManagement;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.UserManagement;

namespace SLES.UnitTests.Integration;

public sealed class ExamPermissionsPostgresTests
{
    [PostgresFact]
    public async Task Authenticated_permissions_and_student_queries_work_on_Postgres()
    {
        var adminConnection = Environment.GetEnvironmentVariable("SLES_TEST_POSTGRES_ADMIN")!;
        var name = "sles_permissions_test_" + Guid.NewGuid().ToString("N");
        await using var admin = new NpgsqlConnection(adminConnection);
        await admin.OpenAsync();
        await new NpgsqlCommand($"CREATE DATABASE {name}", admin).ExecuteNonQueryAsync();
        try
        {
            var connectionString = new NpgsqlConnectionStringBuilder(adminConnection) { Database = name, Pooling = false }.ConnectionString;
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync();
            var root = new DirectoryInfo(AppContext.BaseDirectory);
            while (root is not null && !File.Exists(Path.Combine(root.FullName, "SLES.slnx"))) root = root.Parent;
            await new NpgsqlCommand(await File.ReadAllTextAsync(Path.Combine(root!.FullName, "database/SLES_Database_v1_2.sql")), connection).ExecuteNonQueryAsync();
            var jwt = new JwtOptions { Issuer = "permissions-test", Audience = "permissions-test", SigningKey = new string('x', 64) };
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseKestrel().UseUrls("http://127.0.0.1:0");
            builder.Services.AddDbContext<SlesDbContext>(o => o.UseNpgsql(connectionString));
            builder.Services.AddSingleton(jwt);
            builder.Services.AddSingleton<ITokenService, TokenService>();
            builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
            builder.Services.AddScoped<IAuthService, AuthService>();
            builder.Services.AddScoped<IUserManagementService, UserManagementService>();
            builder.Services.AddScoped<IExamManagementService, ExamManagementService>();
            builder.Services.AddScoped<IChapterPublicationValidator, ChapterPublicationValidator>();
            builder.Services.AddControllers().AddApplicationPart(typeof(TeacherExamsController).Assembly)
                .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o => {
                o.MapInboundClaims = false;
                o.TokenValidationParameters = new TokenValidationParameters { ValidateIssuer = true, ValidIssuer = jwt.Issuer, ValidateAudience = true, ValidAudience = jwt.Audience, ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)), ValidateLifetime = true, RoleClaimType = "role" };
            });
            builder.Services.AddAuthorization();
            await using var app = builder.Build();
            // Match production's 500 boundary while leaving exception details in the test failure.
            app.Use(async (ctx, next) => { try { await next(); } catch (Exception e) { ctx.Response.StatusCode = 500; await ctx.Response.WriteAsync(e.ToString()); } });
            app.UseAuthentication(); app.UseAuthorization(); app.MapControllers();
            await app.StartAsync();
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SlesDbContext>();
            var roles = await db.Roles.ToDictionaryAsync(r => r.Code, r => r.Id);
            var grades = await db.Grades.OrderBy(g => g.Code).ToListAsync();
            var password = "Permissions-test-123!";
            User User(string username, string role, Guid? teacher = null, Guid? grade = null, bool active = true) {
                var u = new User { Username = username, FullName = username, RoleId = roles[role], CreatedByTeacherId = teacher, GradeId = grade, IsActive = active };
                u.PasswordHash = new PasswordHasher<User>().HashPassword(u, password); return u;
            }
            var teacher = User("teacher-test", "TEACHER"); var other = User("other-teacher", "TEACHER");
            var first = User("student-alpha", "STUDENT", teacher.Id, grades[0].Id);
            var second = User("student-beta", "STUDENT", teacher.Id, grades[0].Id);
            var inactive = User("inactive", "STUDENT", teacher.Id, grades[0].Id, false);
            var wrongGrade = User("wrong-grade", "STUDENT", teacher.Id, grades[1].Id);
            var foreign = User("foreign-student", "STUDENT", other.Id, grades[0].Id);
            var chapter = new Chapter { TeacherId = teacher.Id, GradeId = grades[0].Id, SubjectId = (await db.Subjects.FirstAsync()).Id, Name = "Permissions chapter" };
            var exam = new Exam { TeacherId = teacher.Id, ChapterId = chapter.Id, Name = "Permissions exam", DurationMinutes = 30, QuestionCount = 10 };
            db.AddRange(teacher, other, first, second, inactive, wrongGrade, foreign, chapter, exam); await db.SaveChangesAsync();
            using var client = new HttpClient { BaseAddress = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single()) };
            var path = $"/api/teacher/exams/{exam.Id}/permissions";
            async Task<JsonElement> Ok(HttpResponseMessage response) {
                var body = await response.Content.ReadAsStringAsync(); Assert.True(response.IsSuccessStatusCode, $"HTTP {(int)response.StatusCode}: {body}");
                return JsonDocument.Parse(body).RootElement.Clone();
            }
            async Task Login(string username) {
                var result = await Ok(await client.PostAsJsonAsync("/api/auth/login", new { username, password }));
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", result.GetProperty("accessToken").GetString());
            }
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
            await Login(first.Username);
            Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
            await Login(other.Username);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync(path + "/" + first.Id)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(path, new { studentId = first.Id })).StatusCode);
            await Login(teacher.Username);
            var studentsPath = $"/api/teacher/students?isActive=true&gradeId={grades[0].Id}";
            var students = await Ok(await client.GetAsync(studentsPath));
            Assert.Equal(2, students.GetProperty("totalCount").GetInt32());
            Assert.Equal(1, (await Ok(await client.GetAsync(studentsPath + "&search=alpha"))).GetProperty("totalCount").GetInt32());
            Assert.Equal(0, (await Ok(await client.GetAsync(studentsPath + "&search=absent"))).GetProperty("totalCount").GetInt32());
            Assert.Equal(0, (await Ok(await client.GetAsync(path))).GetProperty("totalCount").GetInt32());
            await Ok(await client.PostAsJsonAsync(path, new { studentId = first.Id }));
            var list = await Ok(await client.GetAsync(path + "?page=1&pageSize=20"));
            Assert.Equal(1, list.GetProperty("totalCount").GetInt32());
            Assert.Equal(first.Username, list.GetProperty("items")[0].GetProperty("username").GetString());
            Assert.Equal(grades[0].Name, list.GetProperty("items")[0].GetProperty("gradeName").GetString());
            Assert.Equal(JsonValueKind.Null, list.GetProperty("items")[0].GetProperty("attemptStatus").ValueKind);
            await Ok(await client.GetAsync(path + "?page=1&pageSize=100&status=Granted"));
            foreach (var invalid in new[] { inactive, wrongGrade, foreign })
                Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path, new { studentId = invalid.Id })).StatusCode);
            var bulk = await Ok(await client.PostAsJsonAsync(path + "/bulk", new { studentIds = new[] { first.Id, second.Id, inactive.Id } }));
            Assert.Equal(2, bulk.EnumerateArray().Count(x => x.GetProperty("granted").GetBoolean()));
            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync(path + "/" + first.Id)).StatusCode);
            Assert.Equal(1, (await Ok(await client.GetAsync(path + "?status=Revoked"))).GetProperty("totalCount").GetInt32());
            await Ok(await client.PostAsJsonAsync(path, new { studentId = first.Id }));
            Assert.Equal(2, await db.ExamPermissions.CountAsync());
            var paged = await Ok(await client.GetAsync(path + "?page=2&pageSize=1"));
            Assert.Equal(2, paged.GetProperty("totalCount").GetInt32());
            Assert.Equal(second.Username, paged.GetProperty("items")[0].GetProperty("username").GetString());
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(path + "?page=0")).StatusCode);
        }
        finally { await new NpgsqlCommand($"DROP DATABASE {name} WITH (FORCE)", admin).ExecuteNonQueryAsync(); }
    }
}
