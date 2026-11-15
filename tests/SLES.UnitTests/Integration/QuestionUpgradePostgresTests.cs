using Microsoft.EntityFrameworkCore;
using Npgsql;
using SLES.Application.QuestionBank;
using SLES.Application.ExamManagement;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.QuestionBank;
using SLES.Infrastructure.ChapterManagement;
using SLES.Infrastructure.ExamManagement;

namespace SLES.UnitTests.Integration;
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute(){if(string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SLES_TEST_POSTGRES_ADMIN")))Skip="Set SLES_TEST_POSTGRES_ADMIN to run isolated real PostgreSQL database tests.";}
}
public sealed class QuestionUpgradePostgresTests
{
    [PostgresFact]
    public async Task Migration_rollback_bulk_concurrency_and_blueprint_work_on_real_schema()
    {
        var adminConnection = Environment.GetEnvironmentVariable("SLES_TEST_POSTGRES_ADMIN")!;
        var name = "sles_upgrade_test_"+Guid.NewGuid().ToString("N");
        await using var admin=new NpgsqlConnection(adminConnection);await admin.OpenAsync();
        await new NpgsqlCommand($"CREATE DATABASE {name}",admin).ExecuteNonQueryAsync();
        var builder=new NpgsqlConnectionStringBuilder(adminConnection){Database=name,Pooling=false};
        var root=new DirectoryInfo(AppContext.BaseDirectory);while(root is not null&&!File.Exists(Path.Combine(root.FullName,"SLES.slnx")))root=root.Parent;
        var source=root!.FullName;
        try
        {
            await using var connection=new NpgsqlConnection(builder.ConnectionString);await connection.OpenAsync();
            async Task Sql(string text)=>await new NpgsqlCommand(text,connection).ExecuteNonQueryAsync();
            async Task Run(string path)=>await Sql(await File.ReadAllTextAsync(Path.Combine(source,path)));
            await Run("database/SLES_Database_v1_2.sql");
            var options=new DbContextOptionsBuilder<SlesDbContext>().UseNpgsql(builder.ConnectionString).Options;
            await using var db=new SlesDbContext(options);
            var now=DateTimeOffset.UtcNow;
            var teacher=new User{RoleId=(await db.Roles.SingleAsync(r=>r.Code=="TEACHER")).Id,Username="teacher-test",FullName="Teacher",PasswordHash="test",IsActive=true,CreatedAt=now,UpdatedAt=now};
            var grade=(await db.Grades.FirstAsync()).Id;var subject=(await db.Subjects.FirstAsync()).Id;
            var student=new User{RoleId=(await db.Roles.SingleAsync(r=>r.Code=="STUDENT")).Id,Username="student-test",FullName="Student",PasswordHash="test",IsActive=true,CreatedByTeacherId=teacher.Id,GradeId=grade,CreatedAt=now,UpdatedAt=now};
            var chapter=new Chapter{TeacherId=teacher.Id,GradeId=grade,SubjectId=subject,Name="Test chapter",CreatedAt=now,UpdatedAt=now};db.AddRange(teacher,student,chapter);await db.SaveChangesAsync();
            var legacy=Guid.NewGuid();await Sql($"INSERT INTO questions(id,chapter_id,content,difficulty) VALUES ('{legacy}','{chapter.Id}','Legacy question','HARD')");
            await Run("database/001_question_difficulty_up.sql");await Run("database/001_question_difficulty_up.sql");
            Assert.Null((await db.Questions.SingleAsync(q=>q.Id==legacy)).Difficulty);
            await Sql($"UPDATE questions SET difficulty='COMPREHENSION' WHERE id='{legacy}'");
            await Run("database/001_question_difficulty_down.sql");
            Assert.Equal("HARD",await new NpgsqlCommand($"SELECT difficulty FROM questions WHERE id='{legacy}'",connection).ExecuteScalarAsync());
            await Run("database/001_question_difficulty_up.sql");db.ChangeTracker.Clear();
            Assert.Equal(QuestionDifficulty.COMPREHENSION,(await db.Questions.SingleAsync(q=>q.Id==legacy)).Difficulty);
            await Assert.ThrowsAsync<PostgresException>(()=>Sql($"UPDATE questions SET difficulty='BAD' WHERE id='{legacy}'"));
            var questions=Enumerable.Range(0,200).Select(i=>{
                var q=new Question{ChapterId=chapter.Id,Content="Q"+i,Difficulty=(QuestionDifficulty)(i%4),CreatedAt=now,UpdatedAt=now};
                for(short j=0;j<4;j++)q.Options.Add(new(){Label=((char)('A'+j)).ToString(),Content="Option"+j,IsCorrect=j==0,DisplayOrder=(short)(j+1)});return q;
            }).ToArray();db.AddRange(questions);await db.SaveChangesAsync();db.ChangeTracker.Clear();
            var request=new BulkPublishRequest(Guid.NewGuid(),false,questions.Select(q=>q.Id).ToArray());
            await using var db2=new SlesDbContext(options);
            var results=await Task.WhenAll(new QuestionBankService(db).BulkPublishAsync(teacher.Id,chapter.Id,request,default),new QuestionBankService(db2).BulkPublishAsync(teacher.Id,chapter.Id,request,default));
            Assert.Contains(results,r=>r.Value?.PublishedCount==200);
            db.ChangeTracker.Clear();Assert.Equal(200,await db.Questions.CountAsync(q=>q.Status==QuestionStatus.Published));Assert.Equal(1,await db.AuditLogs.CountAsync());
            Assert.Equal(200,(await new QuestionBankService(db).BulkPublishAsync(teacher.Id,chapter.Id,request,default)).Value!.PublishedCount);
            // Force failure at COMMIT after status updates and receipt INSERT have executed.
            var draft=(await new QuestionBankService(db).CreateAsync(teacher.Id,chapter.Id,new("Rollback candidate",[new("A",true),new("B",false),new("C",false),new("D",false)],QuestionDifficulty.RECOGNITION),default)).Value!;
            await Sql("CREATE FUNCTION test_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced deferred failure'; END $$; CREATE CONSTRAINT TRIGGER test_fail_commit AFTER INSERT ON audit_logs DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION test_reject_receipt();");
            var rejectedId=Guid.NewGuid();var rejected=await new QuestionBankService(db).BulkPublishAsync(teacher.Id,chapter.Id,new(rejectedId,false,[draft.Question.Id]),default);
            Assert.Equal(QuestionFailure.Conflict,rejected.Failure);db.ChangeTracker.Clear();
            Assert.Equal(QuestionStatus.Draft,(await db.Questions.SingleAsync(q=>q.Id==draft.Question.Id)).Status);Assert.False(await db.AuditLogs.AnyAsync(a=>a.Id==rejectedId));
            await Sql("DROP TRIGGER test_fail_commit ON audit_logs; DROP FUNCTION test_reject_receipt();");
            await Sql($"UPDATE chapters SET status='PUBLISHED' WHERE id='{chapter.Id}'");db.ChangeTracker.Clear();
            var service=new ExamManagementService(db,new ChapterPublicationValidator(db));
            var e=(await service.CreateAsync(teacher.Id,new(chapter.Id,"Blueprint",null,30,null,now.AddHours(2)),default)).Value!;
            Assert.Null((await service.PublishAsync(teacher.Id,e.Id,default)).Failure);
            await service.GrantPermissionAsync(teacher.Id,e.Id,new(student.Id),default);
            var available = await service.GetAvailableAsync(student.Id,1,20,default);
            Assert.Null(available.Failure);Assert.Equal(e.Id,Assert.Single(available.Value!.Items).Id);
            await using var competing = new SlesDbContext(options);
            var concurrent = await Task.WhenAll(service.StartAsync(student.Id,e.Id,default), new ExamManagementService(competing,new ChapterPublicationValidator(competing)).StartAsync(student.Id,e.Id,default));
            Assert.All(concurrent, r => Assert.Null(r.Failure));
            Assert.Equal(concurrent[0].Value!.AttemptId, concurrent[1].Value!.AttemptId);
            var attempt=concurrent[0];Assert.Equal(10,attempt.Value!.Questions.Count);
            var questionId = attempt.Value.Questions[0].Id;
            var wrongOptions = await db.ExamAttemptOptions.Where(o => o.ExamAttemptQuestionId == questionId && !o.IsCorrect).Select(o => o.Id).ToListAsync();
            db.ChangeTracker.Clear();competing.ChangeTracker.Clear();
            var writes = await Task.WhenAll(service.SaveAnswerAsync(student.Id,attempt.Value.AttemptId,questionId,new(wrongOptions[0]),default),new ExamManagementService(competing,new ChapterPublicationValidator(competing)).SaveAnswerAsync(student.Id,attempt.Value.AttemptId,questionId,new(wrongOptions[1]),default));
            Assert.All(writes,r => Assert.True(r.Failure is null or ExamFailure.Conflict));
            Assert.Contains(writes,r => r.Failure is null);
            Assert.Equal(1,await db.ExamAnswers.CountAsync(a => a.ExamAttemptQuestionId == questionId));
            db.ChangeTracker.Clear();
            var permissions = (await service.ListPermissionsAsync(teacher.Id,e.Id,1,20,null,default)).Value!;
            Assert.True(Assert.Single(permissions.Items).HasAttempt);
            Assert.Equal(ExamAttemptStatus.InProgress, Assert.Single(permissions.Items).AttemptStatus);
            Assert.Equal(ExamFailure.Conflict,(await service.RevokePermissionAsync(teacher.Id,e.Id,student.Id,default)).Failure);
            var snapshots=await db.ExamAttemptQuestions.ToListAsync();var groups=snapshots.GroupBy(q=>q.QuestionSnapshot.RootElement.GetProperty("difficulty").GetString()).ToDictionary(g=>g.Key!,g=>g.Count());
            Assert.Equal(3,groups["RECOGNITION"]);Assert.Equal(3,groups["COMPREHENSION"]);Assert.Equal(2,groups["LOW_APPLICATION"]);Assert.Equal(2,groups["HIGH_APPLICATION"]);
            var result=await service.SubmitAsync(student.Id,attempt.Value.AttemptId,default);Assert.Null(result.Failure);Assert.Equal(0,result.Value!.Score);
        }
        finally { await new NpgsqlCommand($"DROP DATABASE {name} WITH (FORCE)",admin).ExecuteNonQueryAsync(); }
    }
}
