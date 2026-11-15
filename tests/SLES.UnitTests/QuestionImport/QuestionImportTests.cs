using System.IO.Compression;
using System.Xml.Linq;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SLES.Application.QuestionBank;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.QuestionImport;

namespace SLES.UnitTests.QuestionImport;

public sealed class QuestionImportTests
{
    private static byte[] Template()
    {
        using var input = typeof(QuestionImportService).Assembly.GetManifestResourceStream("SLES.Infrastructure.QuestionImport.Template.xlsx")!;
        using var output = new MemoryStream(); input.CopyTo(output); return output.ToArray();
    }
    private static byte[] Edit(string part, Action<XDocument> edit)
    {
        using var output = new MemoryStream(); output.Write(Template());
        using (var zip = new ZipArchive(output, ZipArchiveMode.Update, true))
        {
            var entry = zip.GetEntry(part)!; XDocument xml;
            using (var input = entry.Open()) xml = XDocument.Load(input);
            edit(xml); entry.Delete(); using var writer = zip.CreateEntry(part).Open(); xml.Save(writer);
        }
        return output.ToArray();
    }
    private static readonly XNamespace Ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static byte[] Cell(string address, string value) => Edit("xl/worksheets/sheet1.xml", x => x.Descendants(Ns + "c").Single(c => (string?)c.Attribute("r") == address).Element(Ns + "v")!.Value = value);
    [Fact]
    public void Supplied_template_has_five_valid_examples_and_preserves_explanation()
    {
        var rows = new ExcelQuestionReader().Read(Template()); Assert.Equal(5, rows.Length);
        Assert.All(rows, r => Assert.Empty(r.Errors)); Assert.Equal(2, rows[0].RowNumber);
        Assert.Equal("RECOGNITION", rows[0].Difficulty); Assert.Equal("B", rows[0].CorrectAnswer); Assert.Equal("Proton mang điện tích +1.", rows[0].Explanation);
    }
    [Theory]
    [InlineData("A2", "", "QuestionText")]
    [InlineData("B2", "", "OptionA")]
    [InlineData("C2", "", "OptionB")]
    [InlineData("F2", "E", "CorrectAnswer")]
    [InlineData("F2", "AB", "CorrectAnswer")]
    [InlineData("F2", "", "CorrectAnswer")]
    [InlineData("G2", "", "Difficulty")]
    [InlineData("G2", "UNKNOWN", "Difficulty")]
    public void Invalid_rows_report_excel_row_numbers(string cell, string value, string field)
    {
        var rows = new ExcelQuestionReader().Read(Cell(cell, value)); Assert.Contains(rows[0].Errors, e => e.Contains(field));
        Assert.Equal(2, rows[0].RowNumber); Assert.All(rows.Skip(1), r => Assert.Empty(r.Errors));
    }
    [Fact]
    public void Headers_lengths_and_resource_limits_are_enforced()
    {
        Assert.Throws<InvalidDataException>(() => new ExcelQuestionReader().Read(Cell("A1", "Wrong")));
        Assert.NotEmpty(new ExcelQuestionReader().Read(Cell("A2", new string('x', 32768)))[0].Errors);
        Assert.Throws<InvalidDataException>(() => new ExcelQuestionReader().Read(new byte[ExcelQuestionReader.MaxBytes + 1]));
        Assert.Throws<InvalidDataException>(() => new ExcelQuestionReader().Read([1, 2, 3]));
    }
    [Theory]
    [InlineData("formula")]
    [InlineData("external")]
    [InlineData("macro")]
    [InlineData("definedName")]
    public void Unsafe_workbooks_are_rejected(string kind)
    {
        byte[] file = kind switch
        {
            "formula" => Edit("xl/worksheets/sheet1.xml", x => x.Descendants(Ns + "c").First().Add(new XElement(Ns + "f", "1+1"))),
            "external" => Edit("xl/_rels/workbook.xml.rels", x => x.Root!.Elements().First().SetAttributeValue("TargetMode", "External")),
            "macro" => Edit("[Content_Types].xml", x => x.Root!.Elements().First().SetAttributeValue("ContentType", "application/vnd.ms-excel.sheet.macroEnabled.main+xml")),
            _ => Edit("xl/workbook.xml", x => x.Root!.Add(new XElement(Ns + "definedName", "http://example.invalid")))
        };
        Assert.Throws<InvalidDataException>(() => new ExcelQuestionReader().Read(file));
    }
    [Fact]
    public void More_than_200_rows_are_allowed_but_more_than_1000_are_rejected()
    {
        byte[] File(int count) => Edit("xl/worksheets/sheet1.xml", x => {
            var data = x.Descendants(Ns + "sheetData").Single(); var example = new XElement(data.Elements().Skip(1).First());
            data.Elements().Skip(1).Remove();
            for (var i = 2; i <= count + 1; i++) { var row = new XElement(example); row.SetAttributeValue("r", i); foreach (var c in row.Elements(Ns + "c")) c.SetAttributeValue("r", ((string)c.Attribute("r")!)[0] + i.ToString()); data.Add(row); }
        });
        Assert.Equal(201, new ExcelQuestionReader().Read(File(201)).Length);
        Assert.Throws<InvalidDataException>(() => new ExcelQuestionReader().Read(File(1001)));
    }
    [Fact]
    public async Task Valid_import_is_draft_and_duplicate_confirmation_replays_without_inserts()
    {
        await using var f = await Fixture.Create(); var preview = await f.Preview(Template());
        Assert.NotNull(preview.Token); Assert.Equal(5, preview.ValidRows);
        var result = await f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, preview.Token!, default);
        Assert.Equal("Completed", result.Value!.State); Assert.Equal(5, result.Value.ImportedCount);
        Assert.Equal(result.Value, (await f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, preview.Token!, default)).Value);
        f.Db.ChangeTracker.Clear(); var questions = await f.Db.Questions.Include(q => q.Options).ToListAsync();
        Assert.Equal(5, questions.Count); Assert.All(questions, q => { Assert.Equal(QuestionStatus.Draft, q.Status); Assert.Equal(4, q.Options.Count); Assert.Single(q.Options, o => o.IsCorrect); Assert.NotNull(q.Explanation); });
        Assert.Equal(ChapterStatus.Draft, (await f.Db.Chapters.SingleAsync()).Status);
    }
    [Fact]
    public async Task Concurrent_confirmation_executes_one_transaction()
    {
        await using var f = await Fixture.Create(); var preview = await f.Preview(Template());
        f.Db.Hold = new(TaskCreationOptions.RunContinuationsAsynchronously); f.Db.Entered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, preview.Token!, default); await f.Db.Entered.Task;
        var second = await f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, preview.Token!, default);
        Assert.Equal("Processing", second.Value!.State);
        f.Db.Hold.SetResult(); Assert.Equal("Completed", (await first).Value!.State);
        Assert.Equal(5, await f.Db.Questions.CountAsync());
    }
    [Fact]
    public async Task Failure_after_database_insert_rolls_back_all_rows_and_consumes_token()
    {
        await using var f = await Fixture.Create(); var preview = await f.Preview(Template()); f.Db.FailAfterSave = true;
        var result = await f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, preview.Token!, default);
        Assert.Equal("Failed", result.Value!.State); Assert.Equal(0, await f.Db.Questions.CountAsync()); Assert.Equal(0, await f.Db.QuestionOptions.CountAsync());
        f.Db.FailAfterSave = false;
        Assert.Equal("Failed", (await f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, preview.Token!, default)).Value!.State);
        Assert.Equal(0, await f.Db.Questions.CountAsync());
    }
    [Fact]
    public async Task Entire_invalid_workbook_gets_no_confirm_token()
    {
        await using var f = await Fixture.Create(); var p = await f.Preview(Cell("B2", ""));
        Assert.Null(p.Token); Assert.Equal(1, p.InvalidRows); Assert.Equal(4, p.ValidRows);
        Assert.Equal(QuestionFailure.NotFound, (await f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, "invented", default)).Failure);
        Assert.Equal(0, await f.Db.Questions.CountAsync());
    }
    [Fact]
    public async Task Ownership_and_chapter_lifecycle_are_rechecked_at_confirmation()
    {
        await using var f = await Fixture.Create(); var preview = await f.Preview(Template()); var wrong = Guid.NewGuid();
        Assert.Equal(QuestionFailure.NotFound, (await f.Service.PreviewAsync(wrong, f.Chapter.Id, "a.xlsx", new MemoryStream(Template()), default)).Failure);
        Assert.Equal(QuestionFailure.NotFound, (await f.Service.ConfirmAsync(wrong, f.Chapter.Id, preview.Token!, default)).Failure);
        Assert.Equal(QuestionFailure.NotFound, f.Service.Status(wrong, f.Chapter.Id, preview.Token!).Failure);
        f.Chapter.Status = ChapterStatus.Published; await f.Db.SaveChangesAsync();
        Assert.Equal(QuestionFailure.NotEditable, (await f.Service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, preview.Token!, default)).Failure);
        Assert.Equal(QuestionFailure.NotEditable, (await f.Service.PreviewAsync(f.Teacher.Id, f.Chapter.Id, "a.xlsx", new MemoryStream(Template()), default)).Failure);
        Assert.Equal(0, await f.Db.Questions.CountAsync());
    }
    [Fact]
    public async Task Extension_size_and_preview_capacity_are_bounded()
    {
        await using var f = await Fixture.Create();
        Assert.Equal(QuestionFailure.InvalidRequest, (await f.Service.PreviewAsync(f.Teacher.Id, f.Chapter.Id, "a.xls", new MemoryStream(Template()), default)).Failure);
        Assert.Equal(QuestionFailure.InvalidRequest, (await f.Service.PreviewAsync(f.Teacher.Id, f.Chapter.Id, "a.xlsx", new MemoryStream(new byte[ExcelQuestionReader.MaxBytes + 1]), default)).Failure);
        for (var i = 0; i < 3; i++) Assert.NotNull((await f.Preview(Template())).Token);
        Assert.Equal(QuestionFailure.Conflict, (await f.Service.PreviewAsync(f.Teacher.Id, f.Chapter.Id, "a.xlsx", new MemoryStream(Template()), default)).Failure);
    }
    [Fact]
    public async Task Expired_preview_cannot_insert_and_token_is_bound_to_chapter()
    {
        await using var f = await Fixture.Create(); var clock = new Clock();
        var service = new QuestionImportService(f.Db, new ImportPreviewStore(clock), new ExcelQuestionReader());
        var p = (await service.PreviewAsync(f.Teacher.Id, f.Chapter.Id, "a.xlsx", new MemoryStream(Template()), default)).Value!;
        Assert.Equal(QuestionFailure.NotFound, (await service.ConfirmAsync(f.Teacher.Id, Guid.NewGuid(), p.Token!, default)).Failure);
        clock.Now = clock.Now.AddMinutes(16);
        Assert.Equal(QuestionFailure.NotFound, (await service.ConfirmAsync(f.Teacher.Id, f.Chapter.Id, p.Token!, default)).Failure);
        Assert.Equal(0, await f.Db.Questions.CountAsync());
    }
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class Fixture(SqliteConnection connection, TestDb db, User teacher, Chapter chapter) : IAsyncDisposable
    {
        public TestDb Db { get; } = db; public User Teacher { get; } = teacher; public Chapter Chapter { get; } = chapter;
        public QuestionImportService Service { get; } = new(db, new ImportPreviewStore(), new ExcelQuestionReader());
        public async Task<ImportPreview> Preview(byte[] bytes) { var result = await Service.PreviewAsync(Teacher.Id, Chapter.Id, "test.xlsx", new MemoryStream(bytes), default); Assert.Null(result.Failure); return result.Value!; }
        public static async Task<Fixture> Create()
        {
            var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
            var db = new TestDb(new DbContextOptionsBuilder<SlesDbContext>().UseSqlite(connection).Options); await db.Database.EnsureCreatedAsync();
            var role = new Role { Code = "TEACHER", Name = "Teacher" }; var teacher = new User { Role = role, Username = "teacher", FullName = "Teacher", PasswordHash = "test", IsActive = true };
            var grade = new Grade { Code = "G10", Name = "Grade" }; var subject = new Subject { Code = "M", Name = "Math" };
            var chapter = new Chapter { TeacherId = teacher.Id, GradeId = grade.Id, SubjectId = subject.Id, Name = "Draft", Status = ChapterStatus.Draft };
            db.AddRange(role, teacher, grade, subject, chapter); await db.SaveChangesAsync(); return new(connection, db, teacher, chapter);
        }
        public async ValueTask DisposeAsync() { await Db.DisposeAsync(); await connection.DisposeAsync(); }
    }
    private sealed class TestDb(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        public bool FailAfterSave; public TaskCompletionSource? Hold, Entered;
        protected override void OnModelCreating(ModelBuilder b) { base.OnModelCreating(b); b.Ignore<AuditLog>(); b.Entity<ExamAttemptQuestion>().Ignore(q => q.QuestionSnapshot); }
        public override async Task<int> SaveChangesAsync(CancellationToken ct = default)
        {
            if (Hold is not null) { Entered!.TrySetResult(); await Hold.Task; }
            var count = await base.SaveChangesAsync(ct); if (FailAfterSave) throw new InvalidOperationException("Simulated failure after INSERT, before COMMIT"); return count;
        }
    }
}
