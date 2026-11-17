using Microsoft.EntityFrameworkCore;
using Npgsql;
using SLES.Application.BulkManagement;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.BulkManagement;
using SLES.Infrastructure.Persistence;

namespace SLES.UnitTests.Integration;

public sealed class BulkManagementPostgresTests
{
    [PostgresFact]
    public async Task Bulk_operations_preserve_relations_and_rollback_on_Postgres()
    {
        var connectionString = Environment.GetEnvironmentVariable("SLES_TEST_POSTGRES_ADMIN")!;
        var name = "sles_bulk_test_" + Guid.NewGuid().ToString("N");
        await using var admin = new NpgsqlConnection(connectionString); await admin.OpenAsync();
        await new NpgsqlCommand($"CREATE DATABASE {name}", admin).ExecuteNonQueryAsync();
        try
        {
            var local = new NpgsqlConnectionStringBuilder(connectionString) { Database = name, Pooling = false }.ConnectionString;
            await using var connection = new NpgsqlConnection(local); await connection.OpenAsync();
            async Task Sql(string sql) => await new NpgsqlCommand(sql, connection).ExecuteNonQueryAsync();
            var root = new DirectoryInfo(AppContext.BaseDirectory);
            while (root is not null && !File.Exists(Path.Combine(root.FullName, "SLES.slnx"))) root = root.Parent;
            foreach (var path in new[] { "database/SLES_Database_v1_2.sql", "database/001_question_difficulty_up.sql" })
                await Sql(await File.ReadAllTextAsync(Path.Combine(root!.FullName, path)));
            await using var db = new SlesDbContext(new DbContextOptionsBuilder<SlesDbContext>().UseNpgsql(local).Options);
            var now = DateTimeOffset.UtcNow;
            var roles = await db.Roles.ToDictionaryAsync(x => x.Code, x => x.Id);
            var grade = (await db.Grades.FirstAsync()).Id; var subject = (await db.Subjects.FirstAsync()).Id;
            User User(string role) => new() { RoleId = roles[role], Username = Guid.NewGuid().ToString(), FullName = role, PasswordHash = "fixture-hash", IsActive = true, CreatedAt = now, UpdatedAt = now };
            var owner = User("TEACHER"); var other = User("TEACHER"); var administrator = User("ADMIN"); var student = User("STUDENT");
            student.CreatedByTeacherId = owner.Id; student.GradeId = grade;
            Chapter Chapter(string label) => new() { TeacherId = owner.Id, GradeId = grade, SubjectId = subject, Name = label, DisplayOrder = 1, CreatedAt = now, UpdatedAt = now };
            var chapter = Chapter("Protected"); var empty = Chapter("Empty");
            var question = new Question { ChapterId = chapter.Id, Content = "Referenced", Difficulty = QuestionDifficulty.RECOGNITION, CreatedAt = now, UpdatedAt = now };
            var disposable = new Question { ChapterId = chapter.Id, Content = "Disposable", CreatedAt = now, UpdatedAt = now };
            var option = new QuestionOption { QuestionId = question.Id, Label = "A", Content = "A", DisplayOrder = 1, IsCorrect = true };
            var exam = new Exam { ChapterId = chapter.Id, TeacherId = owner.Id, Name = "History", DurationMinutes = 30, Status = ExamStatus.Active, CreatedAt = now, UpdatedAt = now };
            db.AddRange(owner, other, administrator, student, chapter, empty, question, disposable, option, exam); await db.SaveChangesAsync();
            var practice = new PracticeAttempt { StudentId = student.Id, TeacherId = owner.Id, ChapterId = chapter.Id, TotalQuestions = 200, StartedAt = now, CreatedAt = now };
            var attempt = new ExamAttempt { ExamId = exam.Id, TeacherId = owner.Id, StudentId = student.Id, StartedAt = now, ExpiresAt = now.AddMinutes(30), SubmittedAt = now.AddMinutes(1), Status = ExamAttemptStatus.Submitted, Score = 8, CreatedAt = now };
            await using (var seedTransaction = await db.Database.BeginTransactionAsync())
            {
            var sources = new List<Question> { question };
            for (var i = 1; i < 10; i++) sources.Add(new Question { ChapterId = chapter.Id, Content = "Snapshot source " + i, CreatedAt = now, UpdatedAt = now });
            db.AddRange(sources.Skip(1));
            db.AddRange(practice, attempt); await db.SaveChangesAsync();
            for (short i = 0; i < 10; i++)
            {
                var snapshot = new ExamAttemptQuestion { ExamAttemptId = attempt.Id, SourceQuestionId = sources[i].Id, QuestionSnapshot = System.Text.Json.JsonDocument.Parse("{\"content\":\"immutable\"}"), DisplayOrder = (short)(i + 1), CreatedAt = now };
                for (short j = 0; j < 4; j++) snapshot.Options.Add(new ExamAttemptOption { Label = ((char)('A' + j)).ToString(), Content = "Option", IsCorrect = j == 0, DisplayOrder = (short)(j + 1) });
                db.Add(snapshot);
            }
            db.AddRange(new PracticeAnswer { PracticeAttemptId = practice.Id, QuestionId = question.Id, SelectedOptionId = option.Id, AnsweredAt = now },
                new ExamPermission { ExamId = exam.Id, TeacherId = owner.Id, StudentId = student.Id, GrantedBy = owner.Id, GrantedAt = now },
                new RefreshToken { UserId = student.Id, TokenHash = Guid.NewGuid().ToString(), CreatedAt = now, ExpiresAt = now.AddDays(1) });
            await db.SaveChangesAsync();
            await seedTransaction.CommitAsync();
            }
            var service = new BulkManagementService(db);
            async Task<BulkManagementResult> Run(Guid actor, BulkResource resource, params Guid[] ids) => await service.ExecuteAsync(actor, resource, new(ids.Select(x => x.ToString()).ToArray()), default);
            Assert.Equal("not_found", (await Run(other.Id, BulkResource.Questions, question.Id)).Value!.Results[0].Code);
            var mixed = (await Run(owner.Id, BulkResource.Questions, question.Id, disposable.Id, disposable.Id, Guid.NewGuid())).Value!;
            Assert.Equal((3, 1, 2), (mixed.RequestedCount, mixed.SuccessCount, mixed.FailedCount));
            Assert.Equal("has_dependencies", mixed.Results[0].Code);
            var chapters = (await Run(owner.Id, BulkResource.Chapters, chapter.Id, empty.Id)).Value!;
            Assert.Equal(1, chapters.SuccessCount); Assert.Equal("has_dependencies", chapters.Results[0].Code);
            Assert.Equal(1, (await Run(owner.Id, BulkResource.Exams, exam.Id)).Value!.SuccessCount);
            Assert.Equal(1, (await Run(owner.Id, BulkResource.Exams, exam.Id)).Value!.SuccessCount);
            Assert.Equal(1, (await Run(owner.Id, BulkResource.Students, student.Id)).Value!.SuccessCount);
            Assert.Equal(1, (await Run(administrator.Id, BulkResource.Teachers, owner.Id)).Value!.SuccessCount);
            db.ChangeTracker.Clear();
            Assert.Equal(8, (await db.ExamAttempts.SingleAsync()).Score);
            Assert.Equal("immutable", (await db.ExamAttemptQuestions.OrderBy(x => x.DisplayOrder).FirstAsync()).QuestionSnapshot.RootElement.GetProperty("content").GetString());
            Assert.Single(await db.PracticeAnswers.ToListAsync()); Assert.Single(await db.QuestionOptions.ToListAsync()); Assert.Single(await db.ExamPermissions.ToListAsync());
            Assert.NotNull((await db.RefreshTokens.SingleAsync()).RevokedAt);
            Assert.Equal(11, await db.Questions.CountAsync()); Assert.Equal(2, await db.Chapters.CountAsync());
            Assert.False((await db.Users.FindAsync(student.Id))!.IsActive);
            Assert.False((await db.Users.FindAsync(owner.Id))!.IsActive);

            // Simulate a database write conflict after validation: no selected update may survive.
            var activeOwner = await db.Users.FindAsync(owner.Id); activeOwner!.IsActive = true;
            var first = new Question { ChapterId = chapter.Id, Content = "Rollback one", CreatedAt = now, UpdatedAt = now };
            var second = new Question { ChapterId = chapter.Id, Content = "Rollback two", CreatedAt = now, UpdatedAt = now };
            db.AddRange(first, second); await db.SaveChangesAsync();
            await Sql("CREATE FUNCTION reject_bulk_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated serialization conflict' USING ERRCODE='40001'; END $$; CREATE TRIGGER reject_bulk BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION reject_bulk_update();");
            Assert.Equal("conflict", (await Run(owner.Id, BulkResource.Questions, first.Id, second.Id)).Error);
            Assert.All(await db.Questions.Where(x => x.Id == first.Id || x.Id == second.Id).ToListAsync(), x => Assert.Null(x.DeletedAt));
            await Sql("DROP TRIGGER reject_bulk ON questions; DROP FUNCTION reject_bulk_update();");
            Assert.Equal(2, (await Run(owner.Id, BulkResource.Questions, first.Id, second.Id)).Value!.SuccessCount);
        }
        finally { await new NpgsqlCommand($"DROP DATABASE {name} WITH (FORCE)", admin).ExecuteNonQueryAsync(); }
    }
}
