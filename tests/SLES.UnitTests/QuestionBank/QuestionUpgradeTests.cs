using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SLES.Application.QuestionBank;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.QuestionBank;
using SLES.Infrastructure.Persistence;
using System.Text.Json;

namespace SLES.UnitTests.QuestionBank;
public sealed class QuestionUpgradeTests
{
    [Theory]
    [InlineData(QuestionDifficulty.RECOGNITION)]
    [InlineData(QuestionDifficulty.COMPREHENSION)]
    [InlineData(QuestionDifficulty.LOW_APPLICATION)]
    [InlineData(QuestionDifficulty.HIGH_APPLICATION)]
    public async Task Difficulty_persists_and_filters(QuestionDifficulty difficulty)
    {
        await using var f = await Fixture.Create();
        var created = (await f.Service.CreateAsync(f.Teacher.Id, f.Chapter.Id, new("Question", Options(), difficulty), default)).Value!;
        Assert.Equal(difficulty, created.Question.Difficulty);
        Assert.Single((await f.Service.ListAsync(f.Teacher.Id, f.Chapter.Id, new(Difficulty: difficulty), default)).Value!.Items);
        var updated = await f.Service.UpdateAsync(f.Teacher.Id, created.Question.Id, new("Edited", Options(), QuestionDifficulty.HIGH_APPLICATION), default);
        Assert.Equal(QuestionDifficulty.HIGH_APPLICATION, updated.Value!.Question.Difficulty);
    }
    [Fact]
    public async Task Missing_invalid_difficulty_rejected_and_legacy_classification_is_metadata_only()
    {
        await using var f = await Fixture.Create();
        foreach (var d in new QuestionDifficulty?[] { null, (QuestionDifficulty)99 }) Assert.Equal(QuestionFailure.InvalidDifficulty, (await f.Service.CreateAsync(f.Teacher.Id, f.Chapter.Id, new("Q", Options(), d), default)).Failure);
        var q = await f.Add(null); Assert.Equal(QuestionFailure.InvalidDifficulty, (await f.Service.PublishAsync(f.Teacher.Id, q.Id, default)).Failure);
        q.Status = QuestionStatus.Published; await f.Db.SaveChangesAsync();
        Assert.Single((await f.Service.ListAsync(f.Teacher.Id, f.Chapter.Id, new(Unclassified: true), default)).Value!.Items);
        Assert.Equal(QuestionFailure.NotFound, (await f.Service.ClassifyAsync(Guid.NewGuid(), q.Id, new(QuestionDifficulty.COMPREHENSION), default)).Failure);
        var oldIds = q.Options.Select(o => o.Id).ToArray();
        Assert.Null((await f.Service.ClassifyAsync(f.Teacher.Id, q.Id, new(QuestionDifficulty.COMPREHENSION), default)).Failure);
        Assert.Equal(oldIds, q.Options.Select(o => o.Id)); Assert.Equal("Q", q.Content); Assert.Equal(QuestionStatus.Published, q.Status);
        Assert.Equal(QuestionFailure.NotEditable, (await f.Service.ClassifyAsync(f.Teacher.Id, q.Id, new(QuestionDifficulty.RECOGNITION), default)).Failure);
    }
    [Fact]
    public async Task Selected_is_atomic_all_reports_excluded_and_receipts_are_durable()
    {
        await using var f = await Fixture.Create(); var good = await f.Add(QuestionDifficulty.RECOGNITION); var bad = await f.Add(null);
        var fail = await f.Service.BulkPublishAsync(f.Teacher.Id, f.Chapter.Id, new(Guid.NewGuid(), false, [good.Id, bad.Id, Guid.NewGuid()]), default);
        Assert.Equal(0, fail.Value!.PublishedCount); Assert.Equal(2, fail.Value.Errors.Count); Assert.Equal(QuestionStatus.Draft, good.Status);
        var request = new BulkPublishRequest(Guid.NewGuid(), true, []);
        var success = await f.Service.BulkPublishAsync(f.Teacher.Id, f.Chapter.Id, request, default);
        Assert.Equal((2, 1, 1), (success.Value!.RequestedCount, success.Value.PublishedCount, success.Value.SkippedCount));
        f.Db.ChangeTracker.Clear(); var again = await new QuestionBankService(f.Db).BulkPublishAsync(f.Teacher.Id, f.Chapter.Id, request, default);
        Assert.Equal(1, again.Value!.PublishedCount); Assert.Single(await f.Db.AuditLogs.ToListAsync());
        Assert.Equal(QuestionFailure.Conflict, (await f.Service.BulkPublishAsync(f.Teacher.Id, f.Chapter.Id, request with { AllEligible = false, QuestionIds = [good.Id] }, default)).Failure);
        Assert.Equal(QuestionFailure.NotFound, (await f.Service.BulkPublishAsync(Guid.NewGuid(), f.Chapter.Id, request, default)).Failure);
    }
    [Fact]
    public async Task Bulk_failure_rolls_back_statuses_and_receipt()
    {
        await using var f = await Fixture.Create(); var good = await f.Add(QuestionDifficulty.RECOGNITION); f.Db.FailAfterSave = true;
        var request = new BulkPublishRequest(Guid.NewGuid(), false, [good.Id]);
        var result = await f.Service.BulkPublishAsync(f.Teacher.Id, f.Chapter.Id, request, default);
        Assert.Equal(QuestionFailure.Conflict, result.Failure); f.Db.ChangeTracker.Clear();
        Assert.Equal(QuestionStatus.Draft, (await f.Db.Questions.SingleAsync()).Status); Assert.Empty(await f.Db.AuditLogs.ToListAsync());
    }
    private static QuestionOptionRequest[] Options() => [new("A", true), new("B", false), new("C", false), new("D", false)];
    private sealed class Fixture(SqliteConnection connection, TestDb db, User teacher, Chapter chapter) : IAsyncDisposable
    {
        public TestDb Db = db; public User Teacher = teacher; public Chapter Chapter = chapter;
        public QuestionBankService Service = new(db);
        public async Task<Question> Add(QuestionDifficulty? difficulty) { var q = new Question { ChapterId = Chapter.Id, Content = "Q", Difficulty = difficulty, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow }; foreach (var (o,i) in Options().Select((o,i)=>(o,i))) q.Options.Add(new() { Label = ((char)('A'+i)).ToString(), Content = o.Content, IsCorrect = o.IsCorrect, DisplayOrder = (short)(i+1) }); Db.Add(q); await Db.SaveChangesAsync(); return q; }
        public static async Task<Fixture> Create()
        {
            var conn = new SqliteConnection("Data Source=:memory:"); await conn.OpenAsync(); var db = new TestDb(new DbContextOptionsBuilder<SlesDbContext>().UseSqlite(conn).Options); await db.Database.EnsureCreatedAsync();
            var role = new Role { Code="TEACHER",Name="Teacher" }; var t = new User { Role=role,Username="test",FullName="Teacher",PasswordHash="test" }; var g=new Grade {Code="G",Name="Grade"};var s=new Subject{Code="S",Name="Subject"};var c=new Chapter{TeacherId=t.Id,GradeId=g.Id,SubjectId=s.Id,Name="Chapter"};db.AddRange(role,t,g,s,c);await db.SaveChangesAsync();return new(conn,db,t,c);
        }
        public async ValueTask DisposeAsync(){await Db.DisposeAsync();await connection.DisposeAsync();}
    }
    private sealed class TestDb(DbContextOptions<SlesDbContext> options):SlesDbContext(options)
    {
        public bool FailAfterSave;
        protected override void OnModelCreating(ModelBuilder b){base.OnModelCreating(b);foreach(var entity in b.Model.GetEntityTypes().ToArray()) foreach(var property in entity.GetProperties().Where(p=>p.ClrType==typeof(DateTimeOffset)).ToArray()) b.Entity(entity.ClrType).Property<DateTimeOffset>(property.Name).HasConversion(v=>v.UtcTicks,v=>new DateTimeOffset(v,TimeSpan.Zero));b.Entity<ExamAttemptQuestion>().Ignore(q=>q.QuestionSnapshot);b.Entity<AuditLog>().Property(a=>a.NewValues).HasConversion(v=>v==null?null:v.RootElement.GetRawText(),v=>v==null?null:JsonDocument.Parse(v,default(JsonDocumentOptions)));b.Entity<AuditLog>().Property(a=>a.OldValues).HasConversion(v=>v==null?null:v.RootElement.GetRawText(),v=>v==null?null:JsonDocument.Parse(v,default(JsonDocumentOptions)));}
        public override async Task<int> SaveChangesAsync(CancellationToken ct=default){var count=await base.SaveChangesAsync(ct);if(FailAfterSave)throw new DbUpdateException("Test failure after updates");return count;}
    }
}
