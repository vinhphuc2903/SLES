using Microsoft.EntityFrameworkCore;
using SLES.Application.QuestionBank;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.ChapterManagement;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.QuestionBank;

namespace SLES.UnitTests.QuestionBank;

public sealed class QuestionBankServiceTests
{
    [Theory]
    [InlineData(199)]
    [InlineData(200)]
    [InlineData(201)]
    public async Task Progress_counts_valid_published_questions_and_enforces_ownership(int count)
    {
        await using var f = await Fixture.CreateAsync();
        await f.AddPublishedQuestionsAsync(count);
        await f.Service.CreateAsync(f.Teacher.Id, f.Chapter.Id, ValidRequest("Draft"), CancellationToken.None);
        var invalid = new Question { ChapterId = f.Chapter.Id, Content = "Invalid", Status = QuestionStatus.Published };
        var archived = new Question { ChapterId = f.Chapter.Id, Content = "Archived", Status = QuestionStatus.Archived };
        var deleted = new Question { ChapterId = f.Chapter.Id, Content = "Deleted", Status = QuestionStatus.Published, DeletedAt = DateTimeOffset.UtcNow };
        f.Db.AddRange(invalid, archived, deleted); await f.Db.SaveChangesAsync();
        var result = await f.Service.ProgressAsync(f.Teacher.Id, f.Chapter.Id, CancellationToken.None);
        Assert.Equal((1, count + 1, 1, count), (result.Value!.Draft, result.Value.Published, result.Value.Archived, result.Value.ValidPublished));
        Assert.Equal(QuestionFailure.NotFound, (await f.Service.ProgressAsync(f.OtherTeacher.Id, f.Chapter.Id, CancellationToken.None)).Failure);
        Assert.Equal(QuestionFailure.NotFound, (await f.Service.ProgressAsync(f.Teacher.Id, Guid.NewGuid(), CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Teacher_creates_valid_draft_question_with_exactly_four_options()
    {
        await using var fixture = await Fixture.CreateAsync();
        var result = await fixture.Service.CreateAsync(fixture.Teacher.Id, fixture.Chapter.Id, ValidRequest("Question?"), CancellationToken.None);
        var detail = Assert.IsType<QuestionDetailResponse>(result.Value);
        Assert.Equal(QuestionStatus.Draft, detail.Question.Status); Assert.Equal(4, detail.Options.Count); Assert.Single(detail.Options, x => x.IsCorrect);
    }

    [Fact]
    public async Task Question_creation_rejects_invalid_options_and_other_teachers_chapter()
    {
        await using var fixture = await Fixture.CreateAsync();
        var threeOptions = new CreateQuestionRequest("Question", ValidOptions()[..3]);
        Assert.Equal(QuestionFailure.MustHaveFourOptions, (await fixture.Service.CreateAsync(fixture.Teacher.Id, fixture.Chapter.Id, threeOptions, CancellationToken.None)).Failure);
        var multipleCorrect = new CreateQuestionRequest("Question", new[] { new QuestionOptionRequest("A", true), new QuestionOptionRequest("B", true), new QuestionOptionRequest("C", false), new QuestionOptionRequest("D", false) });
        Assert.Equal(QuestionFailure.MustHaveExactlyOneCorrectAnswer, (await fixture.Service.CreateAsync(fixture.Teacher.Id, fixture.Chapter.Id, multipleCorrect, CancellationToken.None)).Failure);
        Assert.Equal(QuestionFailure.NotFound, (await fixture.Service.CreateAsync(fixture.OtherTeacher.Id, fixture.Chapter.Id, ValidRequest("Question"), CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Draft_question_can_update_publish_archive_and_history_blocks_delete()
    {
        await using var fixture = await Fixture.CreateAsync();
        var created = Assert.IsType<QuestionDetailResponse>((await fixture.Service.CreateAsync(fixture.Teacher.Id, fixture.Chapter.Id, ValidRequest("Original"), CancellationToken.None)).Value);
        var updated = await fixture.Service.UpdateAsync(fixture.Teacher.Id, created.Question.Id, new UpdateQuestionRequest("Updated", ValidOptions(), QuestionDifficulty.COMPREHENSION), CancellationToken.None);
        Assert.Equal("Updated", updated.Value!.Question.Content);
        Assert.True((await fixture.Service.PublishAsync(fixture.Teacher.Id, created.Question.Id, CancellationToken.None)).Value);
        Assert.Equal(QuestionFailure.NotEditable, (await fixture.Service.UpdateAsync(fixture.Teacher.Id, created.Question.Id, new UpdateQuestionRequest("No", ValidOptions(), QuestionDifficulty.COMPREHENSION), CancellationToken.None)).Failure);
        Assert.True((await fixture.Service.ArchiveAsync(fixture.Teacher.Id, created.Question.Id, CancellationToken.None)).Value);
        var draft = Assert.IsType<QuestionDetailResponse>((await fixture.Service.CreateAsync(fixture.Teacher.Id, fixture.Chapter.Id, ValidRequest("History"), CancellationToken.None)).Value);
        fixture.Db.PracticeAnswers.Add(new PracticeAnswer { PracticeAttemptId = Guid.NewGuid(), QuestionId = draft.Question.Id, AnsweredAt = DateTimeOffset.UtcNow }); await fixture.Db.SaveChangesAsync(CancellationToken.None);
        Assert.Equal(QuestionFailure.HasLearningHistory, (await fixture.Service.DeleteAsync(fixture.Teacher.Id, draft.Question.Id, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Student_published_read_never_returns_correctness()
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.AddPublishedQuestionsAsync(1);
        fixture.Chapter.Status = ChapterStatus.Published; await fixture.Db.SaveChangesAsync(CancellationToken.None);
        var result = await fixture.Service.GetStudentQuestionsAsync(fixture.Student.Id, fixture.Chapter.Id, CancellationToken.None);
        var item = Assert.Single(Assert.IsAssignableFrom<IReadOnlyList<StudentQuestionResponse>>(result.Value));
        Assert.Equal(4, item.Options.Count);
        Assert.DoesNotContain(item.Options.SelectMany(x => x.GetType().GetProperties()), x => x.Name == "IsCorrect");
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(199, false)]
    [InlineData(200, true)]
    [InlineData(201, false)]
    public async Task Publication_validator_requires_exactly_200_valid_published_questions(int count, bool expected)
    {
        await using var fixture = await Fixture.CreateAsync();
        await fixture.AddPublishedQuestionsAsync(count);
        var result = await new ChapterPublicationValidator(fixture.Db).ValidateAsync(fixture.Chapter.Id, CancellationToken.None);
        Assert.Equal(expected, result.IsReady);
    }

    private static CreateQuestionRequest ValidRequest(string content) => new(content, ValidOptions(), QuestionDifficulty.RECOGNITION);
    private static QuestionOptionRequest[] ValidOptions() => new[] { new QuestionOptionRequest("A", true), new QuestionOptionRequest("B", false), new QuestionOptionRequest("C", false), new QuestionOptionRequest("D", false) };

    private sealed class Fixture : IAsyncDisposable
    {
        private Fixture(TestDbContext db, QuestionBankService service, User teacher, User otherTeacher, User student, Chapter chapter) { Db = db; Service = service; Teacher = teacher; OtherTeacher = otherTeacher; Student = student; Chapter = chapter; }
        public TestDbContext Db { get; } public QuestionBankService Service { get; } public User Teacher { get; } public User OtherTeacher { get; } public User Student { get; } public Chapter Chapter { get; }
        public static async Task<Fixture> CreateAsync()
        {
            var db = new TestDbContext(new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
            var teacherRole = new Role { Code = RoleCodes.Teacher, Name = "Teacher", CreatedAt = DateTimeOffset.UtcNow }; var studentRole = new Role { Code = RoleCodes.Student, Name = "Student", CreatedAt = DateTimeOffset.UtcNow }; var grade = new Grade { Code = "G10", Name = "Grade", DisplayOrder = 1, IsActive = true }; var subject = new Subject { Code = "SUB", Name = "Subject", IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            var teacher = User(teacherRole, "teacher"); var otherTeacher = User(teacherRole, "other"); var student = User(studentRole, "student", teacher.Id, grade.Id); var now = DateTimeOffset.UtcNow; var chapter = new Chapter { TeacherId = teacher.Id, GradeId = grade.Id, SubjectId = subject.Id, Name = "Chapter", DisplayOrder = 1, Status = ChapterStatus.Draft, CreatedAt = now, UpdatedAt = now };
            db.AddRange(teacherRole, studentRole, grade, subject, teacher, otherTeacher, student, chapter); await db.SaveChangesAsync(CancellationToken.None);
            return new Fixture(db, new QuestionBankService(db), teacher, otherTeacher, student, chapter);
        }
        public async Task AddPublishedQuestionsAsync(int count)
        {
            var now = DateTimeOffset.UtcNow;
            for (var index = 0; index < count; index++)
            {
                var question = new Question { ChapterId = Chapter.Id, Content = $"Question {index}", Status = QuestionStatus.Published, Difficulty = QuestionDifficulty.RECOGNITION, CreatedAt = now, UpdatedAt = now };
                question.Options.Add(new QuestionOption { Label = "A", Content = "A", IsCorrect = true, DisplayOrder = 1 }); question.Options.Add(new QuestionOption { Label = "B", Content = "B", IsCorrect = false, DisplayOrder = 2 }); question.Options.Add(new QuestionOption { Label = "C", Content = "C", IsCorrect = false, DisplayOrder = 3 }); question.Options.Add(new QuestionOption { Label = "D", Content = "D", IsCorrect = false, DisplayOrder = 4 }); Db.Questions.Add(question);
            }
            await Db.SaveChangesAsync(CancellationToken.None);
        }
        private static User User(Role role, string username, Guid? owner = null, Guid? grade = null) => new() { Role = role, RoleId = role.Id, Username = username, FullName = username, PasswordHash = "test", CreatedByTeacherId = owner, GradeId = grade, IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }
    private sealed class TestDbContext(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder) { base.OnModelCreating(modelBuilder); modelBuilder.Ignore<AuditLog>(); modelBuilder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot); }
    }
}
