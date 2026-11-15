using Microsoft.EntityFrameworkCore;
using SLES.Application.Practice;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.Practice;
using SLES.Application.ChapterManagement;
using SLES.Infrastructure.ChapterManagement;

namespace SLES.UnitTests.Practice;

public sealed class PracticeServiceTests
{
    [Fact]
    public async Task Learning_subjects_are_scoped_to_student_teacher_grade_and_published_active_content()
    {
        await using var f = await Fixture.CreateAsync(0);
        var service = new StudentLearningService(f.Db);
        var now = DateTimeOffset.UtcNow;
        f.Db.Chapters.AddRange(
            new Chapter { TeacherId = f.OtherStudent.CreatedByTeacherId!.Value, GradeId = f.Chapter.GradeId, SubjectId = f.Chapter.SubjectId, Name = "Other teacher", DisplayOrder = 2, Status = ChapterStatus.Published, CreatedAt = now, UpdatedAt = now },
            new Chapter { TeacherId = f.Chapter.TeacherId, GradeId = f.Chapter.GradeId, SubjectId = f.Chapter.SubjectId, Name = "Draft", DisplayOrder = 3, Status = ChapterStatus.Draft, CreatedAt = now, UpdatedAt = now },
            new Chapter { TeacherId = f.Chapter.TeacherId, GradeId = f.Chapter.GradeId, SubjectId = f.Chapter.SubjectId, Name = "Deleted", DisplayOrder = 4, Status = ChapterStatus.Published, DeletedAt = now, CreatedAt = now, UpdatedAt = now });
        await f.Db.SaveChangesAsync();
        var rows = (await service.ListSubjectsAsync(f.Student.Id, new SubjectListQuery(PageSize: 1), CancellationToken.None)).Value!;
        Assert.Equal(1, rows.TotalCount);
        Assert.Equal(1, Assert.Single(rows.Items).ChapterCount);
        Assert.Equal(ChapterFailure.NotFound, (await service.GetSubjectAsync(Guid.NewGuid(), f.Chapter.SubjectId, CancellationToken.None)).Failure);
        Assert.Empty((await service.ListSubjectsAsync(f.Student.Id, new SubjectListQuery(Search: "not matched"), CancellationToken.None)).Value!.Items);
        Assert.Equal(ChapterFailure.InvalidRequest, (await service.ListSubjectsAsync(f.Student.Id, new SubjectListQuery(Page: 0), CancellationToken.None)).Failure);
        var subject = await f.Db.Subjects.SingleAsync(); subject.IsActive = false; await f.Db.SaveChangesAsync();
        Assert.Empty((await service.ListSubjectsAsync(f.Student.Id, new SubjectListQuery(), CancellationToken.None)).Value!.Items);
        Assert.Equal(ChapterFailure.NotFound, (await service.GetSubjectAsync(f.Student.Id, subject.Id, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Disabled_subject_or_grade_hides_student_chapters_and_prevents_new_practice()
    {
        await using var f = await Fixture.CreateAsync(200);
        f.Db.ChapterContents.Add(new ChapterContent { ChapterId = f.Chapter.Id, Content = "Theory", ContentFormat = ContentFormat.Markdown, Version = 1, UpdatedBy = f.Chapter.TeacherId });
        await f.Db.SaveChangesAsync();
        var service = new ChapterManagementService(f.Db, new ChapterPublicationValidator(f.Db));
        var actor = new ChapterActor(f.Student.Id, RoleCodes.Student);
        Assert.Null((await service.GetAsync(actor, f.Chapter.Id, CancellationToken.None)).Failure);
        var subject = await f.Db.Subjects.SingleAsync(); subject.IsActive = false; await f.Db.SaveChangesAsync();
        Assert.Empty((await service.ListAsync(actor, new ChapterListQuery(), CancellationToken.None)).Value!.Items);
        Assert.Equal(ChapterFailure.NotFound, (await service.GetAsync(actor, f.Chapter.Id, CancellationToken.None)).Failure);
        Assert.Equal(PracticeFailure.NotFound, (await f.Service.StartAsync(f.Student.Id, f.Chapter.Id, CancellationToken.None)).Failure);
        subject.IsActive = true; var grade = await f.Db.Grades.SingleAsync(x => x.Id == f.Chapter.GradeId); grade.IsActive = false; await f.Db.SaveChangesAsync();
        Assert.Equal(ChapterFailure.NotFound, (await service.GetAsync(actor, f.Chapter.Id, CancellationToken.None)).Failure);
        Assert.Equal(PracticeFailure.NotFound, (await f.Service.StartAsync(f.Student.Id, f.Chapter.Id, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Review_metadata_is_owned_post_submission_and_survives_archival()
    {
        await using var f = await Fixture.CreateAsync(200);
        var attempt = (await f.Service.StartAsync(f.Student.Id, f.Chapter.Id, CancellationToken.None)).Value!;
        Assert.Equal(PracticeFailure.ResultUnavailable, (await f.Service.GetResultAsync(f.Student.Id, attempt.AttemptId, CancellationToken.None)).Failure);
        await f.Service.SubmitAsync(f.Student.Id, attempt.AttemptId, CancellationToken.None);
        f.Chapter.Status = ChapterStatus.Archived; await f.Db.SaveChangesAsync();
        var result = (await f.Service.GetResultAsync(f.Student.Id, attempt.AttemptId, CancellationToken.None)).Value!;
        Assert.Equal(f.Chapter.Id, result.ChapterId); Assert.Equal(f.Chapter.Name, result.ChapterName);
        Assert.Equal("Math", result.SubjectName); Assert.NotEqual(default, result.StartedAt);
        Assert.Equal(200, result.Questions.Count);
        Assert.Equal(PracticeFailure.NotFound, (await f.Service.GetResultAsync(f.OtherStudent.Id, attempt.AttemptId, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Student_starts_independent_200_question_attempt_with_stable_server_order()
    {
        await using var fixture = await Fixture.CreateAsync(200);
        var first = Assert.IsType<PracticeAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, fixture.Chapter.Id, CancellationToken.None)).Value);
        var reloaded = Assert.IsType<PracticeAttemptResponse>((await fixture.Service.GetAttemptAsync(fixture.Student.Id, first.AttemptId, CancellationToken.None)).Value);
        var retry = Assert.IsType<PracticeAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, fixture.Chapter.Id, CancellationToken.None)).Value);
        Assert.Equal(200, first.TotalQuestions); Assert.Equal(200, first.Questions.Select(x => x.Id).Distinct().Count()); Assert.All(first.Questions, x => Assert.Equal(4, x.Options.Count));
        Assert.Equal(first.Questions.Select(x => x.Id), reloaded.Questions.Select(x => x.Id)); Assert.Equal(first.AttemptId, reloaded.AttemptId); Assert.NotEqual(first.AttemptId, retry.AttemptId);
        Assert.DoesNotContain(first.Questions.SelectMany(x => x.Options).SelectMany(x => x.GetType().GetProperties()), x => x.Name == "IsCorrect");
    }

    [Fact]
    public async Task Start_rejects_wrong_scope_and_chapter_without_exactly_200_questions()
    {
        await using var insufficient = await Fixture.CreateAsync(199);
        Assert.Equal(PracticeFailure.ChapterHasInvalidQuestionCount, (await insufficient.Service.StartAsync(insufficient.Student.Id, insufficient.Chapter.Id, CancellationToken.None)).Failure);
        await using var fixture = await Fixture.CreateAsync(200);
        Assert.Equal(PracticeFailure.NotFound, (await fixture.Service.StartAsync(fixture.OtherStudent.Id, fixture.Chapter.Id, CancellationToken.None)).Failure);
        fixture.Chapter.Status = ChapterStatus.Draft; await fixture.Db.SaveChangesAsync(CancellationToken.None);
        Assert.Equal(PracticeFailure.NotFound, (await fixture.Service.StartAsync(fixture.Student.Id, fixture.Chapter.Id, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Answer_can_change_while_in_progress_and_submit_scores_only_database_correctness()
    {
        await using var fixture = await Fixture.CreateAsync(200);
        var attempt = Assert.IsType<PracticeAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, fixture.Chapter.Id, CancellationToken.None)).Value);
        var first = attempt.Questions[0]; var second = attempt.Questions[1];
        var wrong = first.Options.First(x => x.Label != "A"); var correct = first.Options.Single(x => x.Label == "A");
        Assert.True((await fixture.Service.SaveAnswerAsync(fixture.Student.Id, attempt.AttemptId, first.Id, new SavePracticeAnswerRequest(wrong.Id), CancellationToken.None)).Value);
        Assert.True((await fixture.Service.SaveAnswerAsync(fixture.Student.Id, attempt.AttemptId, first.Id, new SavePracticeAnswerRequest(correct.Id), CancellationToken.None)).Value);
        Assert.True((await fixture.Service.SaveAnswerAsync(fixture.Student.Id, attempt.AttemptId, second.Id, new SavePracticeAnswerRequest(second.Options.First(x => x.Label != "A").Id), CancellationToken.None)).Value);
        var submitted = Assert.IsType<PracticeResultResponse>((await fixture.Service.SubmitAsync(fixture.Student.Id, attempt.AttemptId, CancellationToken.None)).Value);
        Assert.Equal(1, submitted.CorrectAnswers); Assert.Equal(1, submitted.IncorrectAnswers); Assert.Equal(198, submitted.UnansweredQuestions); Assert.Equal(0.05m, submitted.Score); Assert.Equal(0.50m, submitted.Percentage);
        Assert.Equal(PracticeFailure.AttemptSubmitted, (await fixture.Service.SaveAnswerAsync(fixture.Student.Id, attempt.AttemptId, first.Id, new SavePracticeAnswerRequest(correct.Id), CancellationToken.None)).Failure);
        Assert.Equal(PracticeFailure.AttemptSubmitted, (await fixture.Service.SubmitAsync(fixture.Student.Id, attempt.AttemptId, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Student_cannot_answer_or_view_another_students_attempt()
    {
        await using var fixture = await Fixture.CreateAsync(200);
        var attempt = Assert.IsType<PracticeAttemptResponse>((await fixture.Service.StartAsync(fixture.Student.Id, fixture.Chapter.Id, CancellationToken.None)).Value);
        Assert.Equal(PracticeFailure.NotFound, (await fixture.Service.GetAttemptAsync(fixture.OtherStudent.Id, attempt.AttemptId, CancellationToken.None)).Failure);
        Assert.Equal(PracticeFailure.NotFound, (await fixture.Service.SaveAnswerAsync(fixture.OtherStudent.Id, attempt.AttemptId, attempt.Questions[0].Id, new SavePracticeAnswerRequest(attempt.Questions[0].Options[0].Id), CancellationToken.None)).Failure);
        Assert.Equal(PracticeFailure.QuestionNotInAttempt, (await fixture.Service.SaveAnswerAsync(fixture.Student.Id, attempt.AttemptId, Guid.NewGuid(), new SavePracticeAnswerRequest(attempt.Questions[0].Options[0].Id), CancellationToken.None)).Failure);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private Fixture(TestDbContext db, PracticeService service, User student, User otherStudent, Chapter chapter) { Db = db; Service = service; Student = student; OtherStudent = otherStudent; Chapter = chapter; }
        public TestDbContext Db { get; } public PracticeService Service { get; } public User Student { get; } public User OtherStudent { get; } public Chapter Chapter { get; }
        public static async Task<Fixture> CreateAsync(int questionCount)
        {
            var db = new TestDbContext(new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options); var teacherRole = new Role { Code = RoleCodes.Teacher, Name = "Teacher", CreatedAt = DateTimeOffset.UtcNow }; var studentRole = new Role { Code = RoleCodes.Student, Name = "Student", CreatedAt = DateTimeOffset.UtcNow }; var grade = new Grade { Code = "G10", Name = "Grade", DisplayOrder = 1, IsActive = true }; var otherGrade = new Grade { Code = "G11", Name = "Other", DisplayOrder = 2, IsActive = true }; var subject = new Subject { Code = "M", Name = "Math", IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            var teacher = User(teacherRole, "teacher"); var otherTeacher = User(teacherRole, "other"); var student = User(studentRole, "student", teacher.Id, grade.Id); var otherStudent = User(studentRole, "other-student", otherTeacher.Id, grade.Id); var now = DateTimeOffset.UtcNow; var chapter = new Chapter { TeacherId = teacher.Id, GradeId = grade.Id, SubjectId = subject.Id, Name = "Practice", DisplayOrder = 1, Status = ChapterStatus.Published, CreatedAt = now, UpdatedAt = now, PublishedAt = now };
            db.AddRange(teacherRole, studentRole, grade, otherGrade, subject, teacher, otherTeacher, student, otherStudent, chapter);
            for (var i = 0; i < questionCount; i++) { var question = new Question { ChapterId = chapter.Id, Content = $"Q{i}", Status = QuestionStatus.Published, Difficulty = null, CreatedAt = now, UpdatedAt = now }; question.Options.Add(new QuestionOption { Label = "A", Content = "A", IsCorrect = true, DisplayOrder = 1 }); question.Options.Add(new QuestionOption { Label = "B", Content = "B", IsCorrect = false, DisplayOrder = 2 }); question.Options.Add(new QuestionOption { Label = "C", Content = "C", IsCorrect = false, DisplayOrder = 3 }); question.Options.Add(new QuestionOption { Label = "D", Content = "D", IsCorrect = false, DisplayOrder = 4 }); db.Questions.Add(question); }
            await db.SaveChangesAsync(CancellationToken.None); return new Fixture(db, new PracticeService(db), student, otherStudent, chapter);
        }
        private static User User(Role role, string username, Guid? owner = null, Guid? grade = null) => new() { Role = role, RoleId = role.Id, Username = username, FullName = username, PasswordHash = "test", CreatedByTeacherId = owner, GradeId = grade, IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
    private sealed class TestDbContext(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder) { base.OnModelCreating(modelBuilder); modelBuilder.Ignore<AuditLog>(); modelBuilder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot); }
    }
}
