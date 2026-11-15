using Microsoft.EntityFrameworkCore;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.ChapterManagement;
using SLES.Infrastructure.Persistence;

namespace SLES.UnitTests.ChapterManagement;

public sealed class ChapterManagementServiceTests
{
    [Fact]
    public async Task Teacher_creates_draft_chapter_with_markdown_content_version_one()
    {
        await using var fixture = await Fixture.CreateAsync();
        var result = await fixture.Service.CreateAsync(fixture.Teacher.Id, new CreateChapterRequest(fixture.Grade.Id, fixture.Subject.Id, "Introduction", "Desc", 1), CancellationToken.None);
        var chapter = Assert.IsType<ChapterResponse>(result.Value);
        var content = await fixture.Db.ChapterContents.SingleAsync(x => x.ChapterId == chapter.Id);
        Assert.Equal(fixture.Teacher.Id, chapter.TeacherId); Assert.Equal(ChapterStatus.Draft, chapter.Status);
        Assert.Equal(ContentFormat.Markdown, content.ContentFormat); Assert.Equal(1, content.Version); Assert.Equal(string.Empty, content.Content);
    }

    [Fact]
    public async Task Inactive_subject_or_grade_cannot_be_used_for_new_chapter()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Subject.IsActive = false; await fixture.Db.SaveChangesAsync(CancellationToken.None);
        Assert.Equal(ChapterFailure.InvalidSubject, (await fixture.Service.CreateAsync(fixture.Teacher.Id, new CreateChapterRequest(fixture.Grade.Id, fixture.Subject.Id, "Chapter", null, 1), CancellationToken.None)).Failure);
        fixture.Subject.IsActive = true; fixture.Grade.IsActive = false; await fixture.Db.SaveChangesAsync(CancellationToken.None);
        Assert.Equal(ChapterFailure.InvalidGrade, (await fixture.Service.CreateAsync(fixture.Teacher.Id, new CreateChapterRequest(fixture.Grade.Id, fixture.Subject.Id, "Chapter", null, 1), CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Teacher_cannot_read_or_edit_another_teachers_chapter()
    {
        await using var fixture = await Fixture.CreateAsync();
        var chapter = await fixture.CreateChapterAsync(fixture.OtherTeacher.Id, ChapterStatus.Draft, "# Other");
        var actor = new ChapterActor(fixture.Teacher.Id, RoleCodes.Teacher);
        Assert.Equal(ChapterFailure.NotFound, (await fixture.Service.GetAsync(actor, chapter.Id, CancellationToken.None)).Failure);
        Assert.Equal(ChapterFailure.NotFound, (await fixture.Service.UpdateContentAsync(fixture.Teacher.Id, chapter.Id, new UpdateChapterContentRequest("changed"), CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Student_only_reads_published_chapter_of_own_teacher_and_grade()
    {
        await using var fixture = await Fixture.CreateAsync();
        var published = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Published, "# Published");
        var draft = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Draft, "# Draft");
        var otherTeacher = await fixture.CreateChapterAsync(fixture.OtherTeacher.Id, ChapterStatus.Published, "# Other");
        var otherGrade = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Published, "# Grade", fixture.OtherGrade.Id);
        var student = new ChapterActor(fixture.Student.Id, RoleCodes.Student);
        Assert.NotNull((await fixture.Service.GetAsync(student, published.Id, CancellationToken.None)).Value);
        Assert.Equal(ChapterFailure.NotFound, (await fixture.Service.GetAsync(student, draft.Id, CancellationToken.None)).Failure);
        Assert.Equal(ChapterFailure.NotFound, (await fixture.Service.GetAsync(student, otherTeacher.Id, CancellationToken.None)).Failure);
        Assert.Equal(ChapterFailure.NotFound, (await fixture.Service.GetAsync(student, otherGrade.Id, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Markdown_is_stored_unchanged_and_version_changes_only_when_content_changes()
    {
        await using var fixture = await Fixture.CreateAsync();
        var chapter = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Draft, string.Empty);
        const string markdown = "# Title\n\n**bold**\n\n- item";
        var saved = await fixture.Service.UpdateContentAsync(fixture.Teacher.Id, chapter.Id, new UpdateChapterContentRequest(markdown), CancellationToken.None);
        var unchanged = await fixture.Service.UpdateContentAsync(fixture.Teacher.Id, chapter.Id, new UpdateChapterContentRequest(markdown), CancellationToken.None);
        Assert.Equal(markdown, saved.Value!.Content); Assert.Equal(ContentFormat.Markdown, saved.Value.ContentFormat); Assert.Equal(2, saved.Value.Version); Assert.Equal(2, unchanged.Value!.Version);
    }

    [Fact]
    public async Task Published_content_is_not_editable_and_publish_is_blocked_while_question_validation_is_pending()
    {
        await using var fixture = await Fixture.CreateAsync();
        var draft = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Draft, "# Ready");
        var publish = await fixture.Service.PublishAsync(fixture.Teacher.Id, draft.Id, CancellationToken.None);
        Assert.Equal(ChapterFailure.PublicationValidationPending, publish.Failure);
        var published = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Published, "# Published");
        Assert.Equal(ChapterFailure.InvalidTransition, (await fixture.Service.UpdateContentAsync(fixture.Teacher.Id, published.Id, new UpdateChapterContentRequest("no"), CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Draft_can_archive_and_only_eligible_draft_can_soft_delete()
    {
        await using var fixture = await Fixture.CreateAsync();
        var draft = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Draft, "# Draft");
        Assert.True((await fixture.Service.ArchiveAsync(fixture.Teacher.Id, draft.Id, CancellationToken.None)).Value);
        Assert.Equal(ChapterFailure.InvalidTransition, (await fixture.Service.DeleteAsync(fixture.Teacher.Id, draft.Id, CancellationToken.None)).Failure);
        var deletable = await fixture.CreateChapterAsync(fixture.Teacher.Id, ChapterStatus.Draft, "");
        Assert.True((await fixture.Service.DeleteAsync(fixture.Teacher.Id, deletable.Id, CancellationToken.None)).Value);
        Assert.NotNull((await fixture.Db.Chapters.SingleAsync(x => x.Id == deletable.Id)).DeletedAt);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private Fixture(TestDbContext db, ChapterManagementService service, User teacher, User otherTeacher, User student, Grade grade, Grade otherGrade, Subject subject)
        { Db = db; Service = service; Teacher = teacher; OtherTeacher = otherTeacher; Student = student; Grade = grade; OtherGrade = otherGrade; Subject = subject; }
        public TestDbContext Db { get; } public ChapterManagementService Service { get; } public User Teacher { get; } public User OtherTeacher { get; } public User Student { get; } public Grade Grade { get; } public Grade OtherGrade { get; } public Subject Subject { get; }
        public static async Task<Fixture> CreateAsync()
        {
            var db = new TestDbContext(new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
            var teacherRole = new Role { Code = RoleCodes.Teacher, Name = "Teacher", CreatedAt = DateTimeOffset.UtcNow }; var studentRole = new Role { Code = RoleCodes.Student, Name = "Student", CreatedAt = DateTimeOffset.UtcNow };
            var grade = new Grade { Code = "G10", Name = "Grade 10", DisplayOrder = 1, IsActive = true }; var otherGrade = new Grade { Code = "G11", Name = "Grade 11", DisplayOrder = 2, IsActive = true }; var subject = new Subject { Code = "MATH", Name = "Math", IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            var teacher = User(teacherRole, "teacher"); var otherTeacher = User(teacherRole, "other"); var student = User(studentRole, "student", teacher.Id, grade.Id);
            db.AddRange(teacherRole, studentRole, grade, otherGrade, subject, teacher, otherTeacher, student); await db.SaveChangesAsync(CancellationToken.None);
            return new Fixture(db, new ChapterManagementService(db, new ChapterPublicationValidator(db)), teacher, otherTeacher, student, grade, otherGrade, subject);
        }
        public async Task<Chapter> CreateChapterAsync(Guid teacherId, ChapterStatus status, string content, Guid? gradeId = null)
        {
            var now = DateTimeOffset.UtcNow; var chapter = new Chapter { TeacherId = teacherId, GradeId = gradeId ?? Grade.Id, SubjectId = Subject.Id, Name = Guid.NewGuid().ToString(), DisplayOrder = 1, Status = status, PublishedAt = status == ChapterStatus.Published ? now : null, CreatedAt = now, UpdatedAt = now };
            Db.Chapters.Add(chapter); Db.ChapterContents.Add(new ChapterContent { Chapter = chapter, Content = content, ContentFormat = ContentFormat.Markdown, Version = 1, UpdatedBy = teacherId, CreatedAt = now, UpdatedAt = now }); await Db.SaveChangesAsync(CancellationToken.None); return chapter;
        }
        private static User User(Role role, string username, Guid? owner = null, Guid? grade = null) => new() { Role = role, RoleId = role.Id, Username = username, FullName = username, PasswordHash = "test", CreatedByTeacherId = owner, GradeId = grade, IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
    private sealed class TestDbContext(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder) { base.OnModelCreating(modelBuilder); modelBuilder.Ignore<AuditLog>(); modelBuilder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot); }
    }
}
