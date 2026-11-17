using Microsoft.EntityFrameworkCore;
using SLES.Application.BulkManagement;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.BulkManagement;
using SLES.Infrastructure.Persistence;

namespace SLES.UnitTests.BulkManagement;

public sealed class BulkManagementTests
{
    public static IEnumerable<object[]> Resources => Enum.GetValues<BulkResource>().Select(x => new object[] { x });

    [Theory, MemberData(nameof(Resources))]
    public async Task Validates_request_and_actor_for_every_resource(BulkResource resource)
    {
        await using var f = new Fixture();
        foreach (var ids in new string[]?[] { null, [], ["bad-uuid"], [Guid.Empty.ToString()], Enumerable.Repeat(Guid.NewGuid().ToString(), 101).ToArray() })
            Assert.Equal("invalid_request", (await f.Run(resource, ids)).Error);
        Assert.Equal("forbidden", (await f.Service.ExecuteAsync(f.Student.Id, resource, new([Guid.NewGuid().ToString()]), default)).Error);
        Assert.Equal("forbidden", (await f.Service.ExecuteAsync(Guid.NewGuid(), resource, new([Guid.NewGuid().ToString()]), default)).Error);
    }

    [Theory, MemberData(nameof(Resources))]
    public async Task Deduplicates_mixed_selection_preserves_other_owners_and_is_repeatable(BulkResource resource)
    {
        await using var f = new Fixture();
        var (valid, other) = f.Targets(resource);
        var missing = Guid.NewGuid();
        var response = (await f.Run(resource, [valid.ToString(), valid.ToString(), other.ToString(), missing.ToString()])).Value!;
        Assert.Equal(3, response.RequestedCount);
        Assert.Equal(1, response.SuccessCount);
        Assert.Equal(2, response.FailedCount);
        Assert.All(response.Results.Where(x => !x.Success), x => Assert.Equal("not_found", x.Code));
        Assert.Equal(response.Results[1].Message, response.Results[2].Message);
        Assert.True((await f.Run(resource, [valid.ToString()])).Value!.Results.Single().Success);
        if (resource == BulkResource.Questions) { Assert.NotNull(f.Question.DeletedAt); Assert.Null(f.OtherQuestion.DeletedAt); }
        if (resource == BulkResource.Chapters) { Assert.NotNull(f.EmptyChapter.DeletedAt); Assert.Null(f.OtherChapter.DeletedAt); }
        if (resource == BulkResource.Students) { Assert.False(f.Student.IsActive); Assert.True(f.OtherStudent.IsActive); }
        if (resource == BulkResource.Teachers) { Assert.False(f.Teacher.IsActive); Assert.True(f.OtherTeacher.IsActive); }
        if (resource == BulkResource.Exams) { Assert.Equal(ExamStatus.Closed, f.Exam.Status); Assert.Equal(ExamStatus.Draft, f.OtherExam.Status); }
    }

    [Fact]
    public async Task Questions_preserve_referenced_and_published_records_and_options()
    {
        await using var f = new Fixture();
        f.Db.PracticeAnswers.Add(new PracticeAnswer { QuestionId = f.Question.Id, PracticeAttemptId = Guid.NewGuid() });
        var snapshot = new Question { Chapter = f.Chapter, Content = "Snapshot source", Status = QuestionStatus.Draft };
        var published = new Question { Chapter = f.Chapter, Content = "Published", Status = QuestionStatus.Published };
        var archived = new Question { Chapter = f.Chapter, Content = "Archived", Status = QuestionStatus.Archived };
        f.Db.AddRange(snapshot, published, archived);
        f.Db.ExamAttemptQuestions.Add(new ExamAttemptQuestion { SourceQuestionId = snapshot.Id, ExamAttemptId = Guid.NewGuid(), QuestionSnapshot = System.Text.Json.JsonDocument.Parse("{}") });
        await f.SaveAsync();
        var response = (await f.Run(BulkResource.Questions, new[] { f.Question.Id, snapshot.Id, published.Id, archived.Id }.Select(x => x.ToString()).ToArray())).Value!;
        Assert.Equal(4, response.FailedCount);
        Assert.Equal(new[] { "has_dependencies", "has_dependencies", "invalid_transition", "invalid_transition" }, response.Results.Select(x => x.Code));
        Assert.Null(f.Question.DeletedAt); Assert.Null(snapshot.DeletedAt);
        Assert.Single(await f.Db.PracticeAnswers.ToListAsync()); Assert.Single(await f.Db.ExamAttemptQuestions.ToListAsync());
    }

    [Fact]
    public async Task Chapters_block_all_dependents_including_deleted_questions_and_non_draft()
    {
        await using var f = new Fixture();
        f.Question.DeletedAt = DateTimeOffset.UtcNow;
        var published = new Chapter { Teacher = f.Teacher, Status = ChapterStatus.Published };
        var archived = new Chapter { Teacher = f.Teacher, Status = ChapterStatus.Archived };
        var practice = new Chapter { Teacher = f.Teacher };
        f.Db.AddRange(published, archived, practice);
        f.Db.PracticeAttempts.Add(new PracticeAttempt { ChapterId = practice.Id, TeacherId = f.Teacher.Id, StudentId = f.Student.Id });
        await f.SaveAsync();
        var response = (await f.Run(BulkResource.Chapters, new[] { f.Chapter.Id, published.Id, archived.Id, practice.Id, f.EmptyChapter.Id }.Select(x => x.ToString()).ToArray())).Value!;
        Assert.Equal(1, response.SuccessCount); Assert.Equal(4, response.FailedCount);
        Assert.Null(f.Chapter.DeletedAt); Assert.NotNull(f.EmptyChapter.DeletedAt);
        Assert.Equal(2, await f.Db.Exams.CountAsync());
    }

    [Theory]
    [InlineData(BulkResource.Students)]
    [InlineData(BulkResource.Teachers)]
    public async Task Deactivation_revokes_refresh_sessions_without_deleting_accounts_or_history(BulkResource resource)
    {
        await using var f = new Fixture();
        var user = resource == BulkResource.Students ? f.Student : f.Teacher;
        var token = new RefreshToken { UserId = user.Id, TokenHash = "test-hash", ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) };
        f.Db.Add(token); f.Db.PracticeAttempts.Add(new PracticeAttempt { StudentId = f.Student.Id, TeacherId = f.Teacher.Id, ChapterId = f.Chapter.Id, Score = 7 });
        await f.SaveAsync();
        Assert.Equal(1, (await f.Run(resource, [user.Id.ToString()])).Value!.SuccessCount);
        Assert.False(user.IsActive); Assert.Null(user.DeletedAt); Assert.NotNull(token.RevokedAt);
        Assert.Equal(7, (await f.Db.PracticeAttempts.SingleAsync()).Score);
        Assert.True(await f.Db.Users.AnyAsync(x => x.Id == user.Id)); Assert.Equal(2, await f.Db.Exams.CountAsync());
    }

    [Fact]
    public async Task Closing_preserves_attempts_grants_results_and_blocks_cancelled_exams()
    {
        await using var f = new Fixture();
        f.Exam.Status = ExamStatus.Active;
        var cancelled = new Exam { TeacherId = f.Teacher.Id, ChapterId = f.Chapter.Id, Status = ExamStatus.Cancelled };
        f.Db.Add(cancelled);
        f.Db.ExamAttempts.Add(new ExamAttempt { ExamId = f.Exam.Id, StudentId = f.Student.Id, TeacherId = f.Teacher.Id, Score = 8, Status = ExamAttemptStatus.Submitted });
        f.Db.ExamPermissions.Add(new ExamPermission { ExamId = f.Exam.Id, StudentId = f.Student.Id, TeacherId = f.Teacher.Id });
        await f.SaveAsync();
        var result = (await f.Run(BulkResource.Exams, [f.Exam.Id.ToString(), cancelled.Id.ToString()])).Value!;
        Assert.Equal(1, result.SuccessCount); Assert.Equal("invalid_transition", result.Results[1].Code);
        Assert.Equal(8, (await f.Db.ExamAttempts.SingleAsync()).Score); Assert.Single(await f.Db.ExamPermissions.ToListAsync());
        Assert.Equal(ExamStatus.Cancelled, cancelled.Status);
    }

    internal sealed class Fixture : IAsyncDisposable
    {
        public SlesDbContext Db { get; } = new TestDb(new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        public BulkManagementService Service { get; }
        public User Admin = new(), Teacher = new(), OtherTeacher = new(), Student = new(), OtherStudent = new();
        public Chapter Chapter = new(), EmptyChapter = new(), OtherChapter = new();
        public Question Question = new(), OtherQuestion = new();
        public Exam Exam = new(), OtherExam = new();
        public Fixture()
        {
            var admin = new Role { Code = "ADMIN" }; var teacher = new Role { Code = "TEACHER" }; var student = new Role { Code = "STUDENT" };
            Admin.Role = admin; Teacher.Role = OtherTeacher.Role = teacher; Student.Role = OtherStudent.Role = student;
            foreach (var user in new[] { Admin, Teacher, OtherTeacher, Student, OtherStudent }) { user.IsActive = true; user.Username = user.Id.ToString(); }
            Student.CreatedByTeacherId = Teacher.Id; OtherStudent.CreatedByTeacherId = OtherTeacher.Id;
            Chapter.Teacher = EmptyChapter.Teacher = Teacher; OtherChapter.Teacher = OtherTeacher;
            Question.Chapter = Chapter; OtherQuestion.Chapter = OtherChapter;
            Exam.TeacherId = Teacher.Id; Exam.ChapterId = Chapter.Id;
            OtherExam.TeacherId = OtherTeacher.Id; OtherExam.ChapterId = OtherChapter.Id;
            Db.AddRange(Admin, Teacher, OtherTeacher, Student, OtherStudent, Chapter, EmptyChapter, OtherChapter, Question, OtherQuestion, Exam, OtherExam);
            SaveAsync().GetAwaiter().GetResult(); Service = new(Db);
        }
        public (Guid, Guid) Targets(BulkResource resource) => resource switch
        {
            BulkResource.Questions => (Question.Id, OtherQuestion.Id), BulkResource.Chapters => (EmptyChapter.Id, OtherChapter.Id),
            BulkResource.Students => (Student.Id, OtherStudent.Id), BulkResource.Teachers => (Teacher.Id, Student.Id), _ => (Exam.Id, OtherExam.Id)
        };
        public Task<BulkManagementResult> Run(BulkResource resource, IReadOnlyList<string>? ids) => Service.ExecuteAsync(resource == BulkResource.Teachers ? Admin.Id : Teacher.Id, resource, new(ids), default);
        public async Task SaveAsync()
        {
            foreach (var entry in Db.ChangeTracker.Entries())
                foreach (var property in entry.Properties.Where(p => p.Metadata.ClrType == typeof(string) && p.CurrentValue is null && !p.Metadata.IsNullable))
                    property.CurrentValue = "fixture-" + Guid.NewGuid();
            await Db.SaveChangesAsync();
        }
        private sealed class TestDb(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
        {
            protected override void OnModelCreating(ModelBuilder builder)
            {
                base.OnModelCreating(builder); builder.Ignore<AuditLog>();
                builder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot);
            }
        }
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
}
