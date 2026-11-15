using Microsoft.EntityFrameworkCore;
using SLES.Application.ExamManagement;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.ChapterManagement;
using SLES.Infrastructure.ExamManagement;
using SLES.Infrastructure.Persistence;

namespace SLES.UnitTests.ExamManagement;

public sealed class ExamManagementServiceTests
{
    [Fact]
    public void Student_discovery_and_detail_translate_to_postgresql_without_client_filtering()
    {
        using var db = new SlesDbContext(new DbContextOptionsBuilder<SlesDbContext>().UseNpgsql("Host=localhost;Database=translation_only;Username=unused").Options);
        var service = new ExamManagementService(db, new ChapterPublicationValidator(db));
        var method = typeof(ExamManagementService).GetMethod("StudentExams", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        var query = (IQueryable<StudentExamResponse>)method.Invoke(service, new object?[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), null })!;
        Assert.Contains("LIMIT", query.Skip(20).Take(20).ToQueryString());
        var id = Guid.NewGuid();
        var detail = (IQueryable<StudentExamResponse>)method.Invoke(service, new object[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), id })!;
        Assert.Contains("WHERE", detail.Take(1).ToQueryString());
    }

    [Fact]
    public async Task Teacher_attempt_review_includes_identity_and_start_time_only_after_ownership_check()
    {
        await using var f = await Fixture.CreateAsync();
        var exam = await f.CreatePublishedExamAsync();
        await f.Service.GrantPermissionAsync(f.Teacher.Id, exam.Id, new GrantExamPermissionRequest(f.Student.Id), CancellationToken.None);
        var attempt = (await f.Service.StartAsync(f.Student.Id, exam.Id, CancellationToken.None)).Value!;
        Assert.Equal(ExamFailure.ResultUnavailable, (await f.Service.GetTeacherAttemptAsync(f.Teacher.Id, exam.Id, attempt.AttemptId, CancellationToken.None)).Failure);
        await f.Service.SubmitAsync(f.Student.Id, attempt.AttemptId, CancellationToken.None);
        var review = (await f.Service.GetTeacherAttemptAsync(f.Teacher.Id, exam.Id, attempt.AttemptId, CancellationToken.None)).Value!;
        Assert.Equal(f.Student.Id, review.StudentId);
        Assert.Equal(f.Student.Username, review.StudentUsername);
        Assert.Equal(f.Student.FullName, review.StudentFullName);
        Assert.Equal(attempt.StartedAt, review.StartedAt);
        Assert.Equal(10, review.Questions.Count);
        Assert.Equal(ExamFailure.NotFound, (await f.Service.GetTeacherAttemptAsync(Guid.NewGuid(), exam.Id, attempt.AttemptId, CancellationToken.None)).Failure);
        Assert.Equal(ExamFailure.NotFound, (await f.Service.GetTeacherAttemptAsync(f.Teacher.Id, Guid.NewGuid(), attempt.AttemptId, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Student_receives_a_private_ten_question_snapshot_and_server_scores_it()
    {
        await using var fixture = await Fixture.CreateAsync();
        var exam = await fixture.CreatePublishedExamAsync();
        Assert.Null((await fixture.Service.GrantPermissionAsync(fixture.Teacher.Id, exam.Id, new GrantExamPermissionRequest(fixture.Student.Id), CancellationToken.None)).Failure);

        var attempt = Assert.IsType<ExamAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, exam.Id, CancellationToken.None)).Value);
        Assert.Equal(10, attempt.Questions.Count); Assert.Equal(10, attempt.Questions.Select(x => x.Id).Distinct().Count());
        Assert.All(attempt.Questions, x => Assert.Equal(4, x.Options.Count));
        Assert.DoesNotContain(attempt.Questions.SelectMany(x => x.Options).SelectMany(x => x.GetType().GetProperties()), x => x.Name == "IsCorrect");

        var first = attempt.Questions[0]; var correct = await fixture.Db.ExamAttemptOptions.SingleAsync(x => x.ExamAttemptQuestionId == first.Id && x.IsCorrect);
        Assert.True((await fixture.Service.SaveAnswerAsync(fixture.Student.Id, attempt.AttemptId, first.Id, new SaveExamAnswerRequest(correct.Id), CancellationToken.None)).Value);
        var result = Assert.IsType<ExamResultResponse>((await fixture.Service.SubmitAsync(fixture.Student.Id, attempt.AttemptId, CancellationToken.None)).Value);
        Assert.Equal(1, result.CorrectAnswers); Assert.Equal(1, result.Score); Assert.Equal(10m, result.Percentage); Assert.Equal(ExamAttemptStatus.Submitted, result.Status);
    }

    [Fact]
    public async Task Permission_requires_owned_student_matching_chapter_grade_and_attempt_is_idempotent()
    {
        await using var fixture = await Fixture.CreateAsync(); var exam = await fixture.CreatePublishedExamAsync();
        Assert.Equal(ExamFailure.PermissionInvalid, (await fixture.Service.GrantPermissionAsync(fixture.Teacher.Id, exam.Id, new GrantExamPermissionRequest(fixture.OtherStudent.Id), CancellationToken.None)).Failure);
        await fixture.Service.GrantPermissionAsync(fixture.Teacher.Id, exam.Id, new GrantExamPermissionRequest(fixture.Student.Id), CancellationToken.None);
        var first = Assert.IsType<ExamAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, exam.Id, CancellationToken.None)).Value);
        var retry = Assert.IsType<ExamAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, exam.Id, CancellationToken.None)).Value);
        Assert.Equal(first.AttemptId, retry.AttemptId); Assert.Single(fixture.Db.ExamAttempts);
    }

    [Fact]
    public async Task Expired_attempt_is_lazily_auto_submitted_and_cannot_be_changed()
    {
        await using var fixture = await Fixture.CreateAsync(); var exam = await fixture.CreatePublishedExamAsync();
        await fixture.Service.GrantPermissionAsync(fixture.Teacher.Id, exam.Id, new GrantExamPermissionRequest(fixture.Student.Id), CancellationToken.None);
        var attempt = Assert.IsType<ExamAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, exam.Id, CancellationToken.None)).Value);
        var stored = await fixture.Db.ExamAttempts.SingleAsync(); stored.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1); await fixture.Db.SaveChangesAsync();
        Assert.Equal(ExamFailure.AttemptExpired, (await fixture.Service.SaveAnswerAsync(fixture.Student.Id, attempt.AttemptId, attempt.Questions[0].Id, new SaveExamAnswerRequest(attempt.Questions[0].Options[0].Id), CancellationToken.None)).Failure);
        var result = Assert.IsType<ExamResultResponse>((await fixture.Service.GetResultAsync(fixture.Student.Id, attempt.AttemptId, CancellationToken.None)).Value);
        Assert.Equal(ExamAttemptStatus.AutoSubmitted, result.Status); Assert.Equal(0, result.Score);
    }

    [Fact]
    public async Task Discovery_includes_scheduled_exams_but_enforces_permission_grade_and_start_window()
    {
        await using var f = await Fixture.CreateAsync();
        var e = await f.CreatePublishedExamAsync();
        Assert.Empty((await f.Service.ListStudentExamsAsync(f.Student.Id, 1, 20, default)).Value!.Items);
        await f.Service.GrantPermissionAsync(f.Teacher.Id, e.Id, new(f.Student.Id), default);
        var stored = await f.Db.Exams.SingleAsync(); stored.StartAt = DateTimeOffset.UtcNow.AddMinutes(10); stored.Status = ExamStatus.Scheduled; await f.Db.SaveChangesAsync();
        var list = (await f.Service.ListStudentExamsAsync(f.Student.Id, 1, 1, default)).Value!;
        Assert.Equal(1, list.TotalCount); Assert.False(Assert.Single(list.Items).CanStart);
        Assert.Equal("Math", list.Items[0].SubjectName);
        Assert.Equal(ExamFailure.NotFound, (await f.Service.StartAsync(f.Student.Id, e.Id, default)).Failure);
        Assert.Equal(ExamFailure.NotFound, (await f.Service.GetStudentExamAsync(f.OtherStudent.Id, e.Id, default)).Failure);
        Assert.Empty((await f.Service.ListStudentExamsAsync(f.OtherStudent.Id, 1, 20, default)).Value!.Items);
        stored.StartAt = DateTimeOffset.UtcNow.AddMinutes(-1); await f.Db.SaveChangesAsync();
        Assert.True((await f.Service.GetStudentExamAsync(f.Student.Id, e.Id, default)).Value!.CanStart);
        await f.Service.RevokePermissionAsync(f.Teacher.Id, e.Id, f.Student.Id, default);
        Assert.Equal(ExamFailure.NotFound, (await f.Service.GetStudentExamAsync(f.Student.Id, e.Id, default)).Failure);
        Assert.Equal(ExamFailure.InvalidRequest, (await f.Service.ListStudentExamsAsync(f.Student.Id, 0, 20, default)).Failure);
    }

    [Fact]
    public async Task History_is_owned_paged_and_finalizes_expired_attempts_even_after_exam_closed()
    {
        await using var f = await Fixture.CreateAsync(); var e = await f.CreatePublishedExamAsync();
        await f.Service.GrantPermissionAsync(f.Teacher.Id, e.Id, new(f.Student.Id), default);
        var a = (await f.Service.StartAsync(f.Student.Id, e.Id, default)).Value!;
        Assert.True(a.ServerNow >= a.StartedAt); Assert.True(a.ServerNow <= DateTimeOffset.UtcNow);
        Assert.Equal(a.StartedAt.AddMinutes(30), a.ExpiresAt);
        var detail = (await f.Service.GetStudentExamAsync(f.Student.Id, e.Id, default)).Value!;
        Assert.Equal(a.AttemptId, detail.AttemptId); Assert.False(detail.CanStart);
        await f.Service.CloseAsync(f.Teacher.Id, e.Id, default);
        Assert.Equal(ExamAttemptStatus.InProgress, (await f.Service.GetAttemptAsync(f.Student.Id, a.AttemptId, default)).Value!.Status);
        var stored = await f.Db.ExamAttempts.SingleAsync(); stored.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(-1); await f.Db.SaveChangesAsync();
        var page = (await f.Service.GetStudentHistoryAsync(f.Student.Id, 1, 1, default)).Value!;
        Assert.Equal(1, page.TotalCount); var row = Assert.Single(page.Items);
        Assert.Equal(ExamAttemptStatus.AutoSubmitted, row.Status); Assert.Equal(0m, row.Score); Assert.NotNull(row.SubmittedAt);
        Assert.Empty((await f.Service.GetStudentHistoryAsync(f.Student.Id, 2, 1, default)).Value!.Items);
        Assert.Empty((await f.Service.GetStudentHistoryAsync(f.OtherStudent.Id, 1, 20, default)).Value!.Items);
        Assert.Equal(ExamFailure.NotFound, (await f.Service.GetAttemptAsync(f.OtherStudent.Id, a.AttemptId, default)).Failure);
        Assert.Equal(ExamFailure.NotFound, (await f.Service.GetResultAsync(f.OtherStudent.Id, a.AttemptId, default)).Failure);
        Assert.Equal(ExamFailure.InvalidRequest, (await f.Service.GetStudentHistoryAsync(f.Student.Id, 1, 101, default)).Failure);
    }

    [Fact]
    public async Task Deadline_is_capped_by_end_and_review_preserves_snapshot_and_order()
    {
        await using var f = await Fixture.CreateAsync(); var e = await f.CreatePublishedExamAsync();
        var stored = await f.Db.Exams.SingleAsync(); stored.EndAt = DateTimeOffset.UtcNow.AddMinutes(2); await f.Db.SaveChangesAsync();
        await f.Service.GrantPermissionAsync(f.Teacher.Id, e.Id, new(f.Student.Id), default);
        var a = (await f.Service.StartAsync(f.Student.Id, e.Id, default)).Value!;
        Assert.Equal(stored.EndAt, a.ExpiresAt);
        Assert.Equal(ExamFailure.ResultUnavailable, (await f.Service.GetResultAsync(f.Student.Id, a.AttemptId, default)).Failure);
        var snapshot = await f.Db.ExamAttemptQuestions.FirstAsync(); var source = await f.Db.Questions.SingleAsync(q => q.Id == snapshot.SourceQuestionId); source.Content = "Changed source"; await f.Db.SaveChangesAsync();
        var r = (await f.Service.SubmitAsync(f.Student.Id, a.AttemptId, default)).Value!;
        Assert.Equal(a.StartedAt, r.StartedAt); Assert.Equal(a.Questions.Select(q => q.Id), r.Questions.Select(q => q.Id));
        Assert.Equal(a.Questions.Select(q => q.Content), r.Questions.Select(q => q.Content));
        Assert.Equal(a.Questions.SelectMany(q => q.Options).Select(o => o.Id), r.Questions.SelectMany(q => q.Options).Select(o => o.Id));
        var again = (await f.Service.SubmitAsync(f.Student.Id, a.AttemptId, default)).Value!;
        Assert.Equal(r.SubmittedAt, again.SubmittedAt); Assert.Equal(r.Score, again.Score); Assert.Equal(r.AttemptId, again.AttemptId);
    }
    [Theory]
    [InlineData(QuestionDifficulty.RECOGNITION)]
    [InlineData(QuestionDifficulty.COMPREHENSION)]
    [InlineData(QuestionDifficulty.LOW_APPLICATION)]
    [InlineData(QuestionDifficulty.HIGH_APPLICATION)]
    public async Task Blueprint_blocks_publish_and_start_when_a_level_is_insufficient(QuestionDifficulty missing)
    {
        await using var f = await Fixture.CreateAsync(); var exam = await f.CreatePublishedExamAsync();
        await f.Service.GrantPermissionAsync(f.Teacher.Id, exam.Id, new(f.Student.Id), default);
        foreach (var q in await f.Db.Questions.Where(q => q.Difficulty == missing).ToListAsync()) q.Difficulty = null;
        await f.Db.SaveChangesAsync();
        Assert.False((await f.Service.GetBlueprintAsync(f.Teacher.Id, f.Chapter.Id, default)).Value!.Ready);
        var start = await f.Service.StartAsync(f.Student.Id, exam.Id, default); Assert.Equal(ExamFailure.InsufficientBlueprint, start.Failure); Assert.Empty(await f.Db.ExamAttempts.ToListAsync());
        var stored = await f.Db.Exams.SingleAsync(); stored.Status = ExamStatus.Draft; await f.Db.SaveChangesAsync();
        Assert.Equal(ExamFailure.InsufficientBlueprint, (await f.Service.PublishAsync(f.Teacher.Id, exam.Id, default)).Failure);
    }
    [Fact]
    public async Task New_snapshot_contains_exact_blueprint_and_legacy_snapshots_remain_readable()
    {
        await using var f = await Fixture.CreateAsync(); var e = await f.CreatePublishedExamAsync();
        await f.Service.GrantPermissionAsync(f.Teacher.Id, e.Id, new(f.Student.Id), default);
        var a = (await f.Service.StartAsync(f.Student.Id, e.Id, default)).Value!;
        var snapshot = await f.Db.ExamAttemptQuestions.OrderBy(q => q.DisplayOrder).ToListAsync();
        var counts = snapshot.GroupBy(q => q.QuestionSnapshot.RootElement.GetProperty("difficulty").GetString()).ToDictionary(g => g.Key!, g => g.Count());
        Assert.Equal(3, counts["RECOGNITION"]); Assert.Equal(3, counts["COMPREHENSION"]); Assert.Equal(2, counts["LOW_APPLICATION"]); Assert.Equal(2, counts["HIGH_APPLICATION"]);
        Assert.Equal(10, snapshot.Select(q => q.SourceQuestionId).Distinct().Count());
        snapshot[0].QuestionSnapshot = System.Text.Json.JsonSerializer.SerializeToDocument(new {content="Legacy snapshot"});
        await f.Db.SaveChangesAsync();
        var again = (await f.Service.StartAsync(f.Student.Id, e.Id, default)).Value!; Assert.Equal(a.AttemptId, again.AttemptId); Assert.Equal("Legacy snapshot", again.Questions[0].Content);
        Assert.DoesNotContain(System.Text.Json.JsonSerializer.Serialize(again), "IsCorrect");
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private Fixture(TestDbContext db, ExamManagementService service, User teacher, User student, User otherStudent, Chapter chapter) { Db = db; Service = service; Teacher = teacher; Student = student; OtherStudent = otherStudent; Chapter = chapter; }
        public TestDbContext Db { get; } public ExamManagementService Service { get; } public User Teacher { get; } public User Student { get; } public User OtherStudent { get; } public Chapter Chapter { get; }
        public static async Task<Fixture> CreateAsync()
        {
            var db = new TestDbContext(new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options); var now = DateTimeOffset.UtcNow;
            var teacherRole = new Role { Code = RoleCodes.Teacher, Name = "Teacher", CreatedAt = now }; var studentRole = new Role { Code = RoleCodes.Student, Name = "Student", CreatedAt = now }; var grade = new Grade { Code = "G10", Name = "Grade", DisplayOrder = 1, IsActive = true }; var otherGrade = new Grade { Code = "G11", Name = "Other", DisplayOrder = 2, IsActive = true }; var subject = new Subject { Code = "M", Name = "Math", IsActive = true, CreatedAt = now, UpdatedAt = now };
            var teacher = User(teacherRole, "teacher"); var student = User(studentRole, "student", teacher.Id, grade.Id); var other = User(studentRole, "other", teacher.Id, otherGrade.Id); var chapter = new Chapter { TeacherId = teacher.Id, GradeId = grade.Id, SubjectId = subject.Id, Name = "Chapter", Status = ChapterStatus.Published, DisplayOrder = 1, PublishedAt = now, CreatedAt = now, UpdatedAt = now };
            db.AddRange(teacherRole, studentRole, grade, otherGrade, subject, teacher, student, other, chapter);
            for (var i = 0; i < 200; i++) { var q = new Question { ChapterId = chapter.Id, Content = $"Q{i}", Status = QuestionStatus.Published, Difficulty = (QuestionDifficulty)(i % 4), CreatedAt = now, UpdatedAt = now }; q.Options.Add(new QuestionOption { Label = "A", Content = "A", IsCorrect = true, DisplayOrder = 1 }); q.Options.Add(new QuestionOption { Label = "B", Content = "B", IsCorrect = false, DisplayOrder = 2 }); q.Options.Add(new QuestionOption { Label = "C", Content = "C", IsCorrect = false, DisplayOrder = 3 }); q.Options.Add(new QuestionOption { Label = "D", Content = "D", IsCorrect = false, DisplayOrder = 4 }); db.Questions.Add(q); }
            await db.SaveChangesAsync(); return new Fixture(db, new ExamManagementService(db, new ChapterPublicationValidator(db)), teacher, student, other, chapter);
        }
        public async Task<ExamResponse> CreatePublishedExamAsync()
        {
            var created = Assert.IsType<ExamResponse>((await Service.CreateAsync(Teacher.Id, new CreateExamRequest(Chapter.Id, "Midterm", null, 30, null, DateTimeOffset.UtcNow.AddHours(2)), CancellationToken.None)).Value);
            return Assert.IsType<ExamResponse>((await Service.PublishAsync(Teacher.Id, created.Id, CancellationToken.None)).Value);
        }
        private static User User(Role role, string username, Guid? owner = null, Guid? grade = null) => new() { Role = role, RoleId = role.Id, Username = username, FullName = username, PasswordHash = "test", CreatedByTeacherId = owner, GradeId = grade, IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
    private sealed class TestDbContext(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder) { base.OnModelCreating(modelBuilder); modelBuilder.Ignore<AuditLog>(); modelBuilder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot); }
    }
}
