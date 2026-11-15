using System.Text.Json;
using System.Security.Cryptography;
using System.Data;
using Microsoft.EntityFrameworkCore;
using SLES.Application.ChapterManagement;
using SLES.Application.ExamManagement;
using SLES.Application.Practice;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.ExamManagement;

public sealed partial class ExamManagementService(SlesDbContext dbContext, IChapterPublicationValidator publicationValidator) : IExamManagementService
{
    public async Task<ExamResult<ExamResponse>> CreateAsync(Guid teacherId, CreateExamRequest request, CancellationToken ct)
    {
        if (!ValidConfiguration(request.Name, request.DurationMinutes, request.StartAt, request.EndAt)) return ExamResult<ExamResponse>.Fail(ExamFailure.InvalidSchedule, "Name, duration, or time window is invalid.");
        var chapter = await OwnedPublishedChapterAsync(teacherId, request.ChapterId, ct); if (chapter is null) return ExamResult<ExamResponse>.Fail(ExamFailure.NotFound);
        var validation = await publicationValidator.ValidateAsync(chapter.Id, ct); if (!validation.IsReady) return ExamResult<ExamResponse>.Fail(ExamFailure.ChapterHasInvalidQuestionCount, validation.Detail);
        var now = DateTimeOffset.UtcNow;
        var exam = new Exam { TeacherId = teacherId, ChapterId = chapter.Id, Name = request.Name.Trim(), Description = CleanOptional(request.Description), QuestionCount = 10, DurationMinutes = request.DurationMinutes, StartAt = request.StartAt, EndAt = request.EndAt, Status = ExamStatus.Draft, CreatedAt = now, UpdatedAt = now };
        dbContext.Exams.Add(exam); await dbContext.SaveChangesAsync(ct); return ExamResult<ExamResponse>.Success(ToExamResponse(exam, 0, 0));
    }

    public async Task<ExamResult<SLES.Application.Practice.PagedResult<ExamResponse>>> ListAsync(Guid teacherId, ExamListQuery query, CancellationToken ct)
    {
        if (!ValidPage(query.Page, query.PageSize)) return ExamResult<SLES.Application.Practice.PagedResult<ExamResponse>>.Fail(ExamFailure.InvalidRequest);
        var exams = dbContext.Exams.AsNoTracking().Where(x => x.TeacherId == teacherId);
        if (query.Status.HasValue) exams = exams.Where(x => x.Status == query.Status.Value);
        if (query.ChapterId.HasValue) exams = exams.Where(x => x.ChapterId == query.ChapterId.Value);
        if (!string.IsNullOrWhiteSpace(query.Keyword)) { var keyword = query.Keyword.Trim(); exams = exams.Where(x => x.Name.Contains(keyword)); }
        var total = await exams.CountAsync(ct);
        var items = await exams.OrderByDescending(x => x.CreatedAt).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(x => new ExamResponse(x.Id, x.ChapterId, x.Name, x.Description, x.QuestionCount, x.DurationMinutes, x.StartAt, x.EndAt, x.Status, x.OpenedAt, x.ClosedAt, x.CreatedAt, x.UpdatedAt, x.Permissions.Count, x.Attempts.Count)).ToListAsync(ct);
        return ExamResult<SLES.Application.Practice.PagedResult<ExamResponse>>.Success(new SLES.Application.Practice.PagedResult<ExamResponse>(items, query.Page, query.PageSize, total));
    }

    public async Task<ExamResult<ExamResponse>> GetAsync(Guid teacherId, Guid examId, CancellationToken ct)
    {
        var exam = await OwnedExamAsync(teacherId, examId, ct); return exam is null ? ExamResult<ExamResponse>.Fail(ExamFailure.NotFound) : ExamResult<ExamResponse>.Success(ToExamResponse(exam, await dbContext.ExamPermissions.CountAsync(x => x.ExamId == examId, ct), await dbContext.ExamAttempts.CountAsync(x => x.ExamId == examId, ct)));
    }

    public async Task<ExamResult<ExamResponse>> UpdateAsync(Guid teacherId, Guid examId, UpdateExamRequest request, CancellationToken ct)
    {
        if (!ValidConfiguration(request.Name, request.DurationMinutes, request.StartAt, request.EndAt)) return ExamResult<ExamResponse>.Fail(ExamFailure.InvalidSchedule, "Name, duration, or time window is invalid.");
        var exam = await OwnedExamAsync(teacherId, examId, ct); if (exam is null) return ExamResult<ExamResponse>.Fail(ExamFailure.NotFound);
        if (exam.Status != ExamStatus.Draft) return ExamResult<ExamResponse>.Fail(ExamFailure.InvalidLifecycle, "Only draft exams can be edited.");
        if (await dbContext.ExamAttempts.AnyAsync(x => x.ExamId == examId, ct)) return ExamResult<ExamResponse>.Fail(ExamFailure.Conflict, "An exam with attempts cannot be edited.");
        exam.Name = request.Name.Trim(); exam.Description = CleanOptional(request.Description); exam.DurationMinutes = request.DurationMinutes; exam.StartAt = request.StartAt; exam.EndAt = request.EndAt; exam.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(ct); return ExamResult<ExamResponse>.Success(ToExamResponse(exam, await dbContext.ExamPermissions.CountAsync(x => x.ExamId == examId, ct), 0));
    }

    public async Task<ExamResult<ExamResponse>> PublishAsync(Guid teacherId, Guid examId, CancellationToken ct)
    {
        var exam = await OwnedExamAsync(teacherId, examId, ct); if (exam is null) return ExamResult<ExamResponse>.Fail(ExamFailure.NotFound);
        if (exam.Status != ExamStatus.Draft) return ExamResult<ExamResponse>.Fail(ExamFailure.InvalidLifecycle, "Only draft exams can be published.");
        if (!ValidConfiguration(exam.Name, exam.DurationMinutes, exam.StartAt, exam.EndAt)) return ExamResult<ExamResponse>.Fail(ExamFailure.InvalidSchedule);
        var chapter = await OwnedPublishedChapterAsync(teacherId, exam.ChapterId, ct); if (chapter is null) return ExamResult<ExamResponse>.Fail(ExamFailure.InvalidLifecycle, "The exam chapter is no longer published.");
        var validation = await publicationValidator.ValidateAsync(exam.ChapterId, ct); if (!validation.IsReady) return ExamResult<ExamResponse>.Fail(ExamFailure.ChapterHasInvalidQuestionCount, validation.Detail);
        var blueprint = await BlueprintAsync(exam.ChapterId, ct);
        if (!blueprint.Ready) return BlueprintFailure<ExamResponse>(blueprint);
        var now = DateTimeOffset.UtcNow; exam.Status = exam.StartAt.HasValue && exam.StartAt > now ? ExamStatus.Scheduled : ExamStatus.Active; if (exam.Status == ExamStatus.Active) exam.OpenedAt = now; exam.UpdatedAt = now;
        await dbContext.SaveChangesAsync(ct); return ExamResult<ExamResponse>.Success(ToExamResponse(exam, await dbContext.ExamPermissions.CountAsync(x => x.ExamId == examId, ct), 0));
    }

    public async Task<ExamResult<ExamResponse>> CloseAsync(Guid teacherId, Guid examId, CancellationToken ct)
    {
        var exam = await OwnedExamAsync(teacherId, examId, ct); if (exam is null) return ExamResult<ExamResponse>.Fail(ExamFailure.NotFound);
        if (exam.Status is ExamStatus.Closed or ExamStatus.Cancelled) return ExamResult<ExamResponse>.Fail(ExamFailure.InvalidLifecycle);
        exam.Status = ExamStatus.Closed; exam.ClosedAt = exam.UpdatedAt = DateTimeOffset.UtcNow; await dbContext.SaveChangesAsync(ct);
        return ExamResult<ExamResponse>.Success(ToExamResponse(exam, await dbContext.ExamPermissions.CountAsync(x => x.ExamId == examId, ct), await dbContext.ExamAttempts.CountAsync(x => x.ExamId == examId, ct)));
    }

    public async Task<ExamResult<ExamPermissionResponse>> GrantPermissionAsync(Guid teacherId, Guid examId, GrantExamPermissionRequest request, CancellationToken ct)
    {
        var exam = await OwnedExamAsync(teacherId, examId, ct); if (exam is null) return ExamResult<ExamPermissionResponse>.Fail(ExamFailure.NotFound);
        var result = await GrantCoreAsync(teacherId, exam, request.StudentId, ct);
        if (result.Failure is not null) return ExamResult<ExamPermissionResponse>.Fail(result.Failure.Value, result.Detail);
        await dbContext.SaveChangesAsync(ct); return ExamResult<ExamPermissionResponse>.Success((await PermissionResponseAsync(examId, request.StudentId, ct))!);
    }

    public async Task<ExamResult<IReadOnlyList<BulkPermissionItem>>> GrantPermissionsAsync(Guid teacherId, Guid examId, BulkGrantExamPermissionRequest request, CancellationToken ct)
    {
        if (request.StudentIds is null || request.StudentIds.Count == 0) return ExamResult<IReadOnlyList<BulkPermissionItem>>.Fail(ExamFailure.InvalidRequest);
        var exam = await OwnedExamAsync(teacherId, examId, ct); if (exam is null) return ExamResult<IReadOnlyList<BulkPermissionItem>>.Fail(ExamFailure.NotFound);
        var items = new List<BulkPermissionItem>();
        foreach (var studentId in request.StudentIds.Distinct()) { var r = await GrantCoreAsync(teacherId, exam, studentId, ct); items.Add(new BulkPermissionItem(studentId, r.Failure is null, r.Detail)); }
        await dbContext.SaveChangesAsync(ct); return ExamResult<IReadOnlyList<BulkPermissionItem>>.Success(items);
    }

    public async Task<ExamResult<SLES.Application.Practice.PagedResult<ExamPermissionResponse>>> ListPermissionsAsync(Guid teacherId, Guid examId, int page, int pageSize, PermissionStatus? status, CancellationToken ct)
    {
        if (!ValidPage(page, pageSize)) return ExamResult<SLES.Application.Practice.PagedResult<ExamPermissionResponse>>.Fail(ExamFailure.InvalidRequest);
        if (await OwnedExamAsync(teacherId, examId, ct) is null) return ExamResult<SLES.Application.Practice.PagedResult<ExamPermissionResponse>>.Fail(ExamFailure.NotFound);
        var permissions = dbContext.ExamPermissions.AsNoTracking().Where(x => x.ExamId == examId); if (status.HasValue) permissions = permissions.Where(x => x.Status == status.Value);
        var total = await permissions.CountAsync(ct);
        var rows = from permission in permissions
                   join student in dbContext.Users.AsNoTracking() on permission.StudentId equals student.Id
                   select new { permission, student };
        // Order and page SQL columns before constructing the response record.
        var items = await rows.OrderBy(x => x.student.FullName).ThenBy(x => x.student.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new ExamPermissionResponse(x.student.Id, x.student.Username, x.student.FullName,
                x.permission.Status, x.permission.GrantedAt, x.permission.RevokedAt,
                dbContext.ExamAttempts.Any(a => a.ExamId == examId && a.StudentId == x.student.Id))
            {
                GradeId = x.student.GradeId,
                GradeName = x.student.Grade == null ? null : x.student.Grade.Name,
                AttemptStatus = dbContext.ExamAttempts.Where(a => a.ExamId == examId && a.StudentId == x.student.Id)
                    .Select(a => (ExamAttemptStatus?)a.Status).FirstOrDefault()
            }).ToListAsync(ct);
        return ExamResult<SLES.Application.Practice.PagedResult<ExamPermissionResponse>>.Success(new SLES.Application.Practice.PagedResult<ExamPermissionResponse>(items, page, pageSize, total));
    }

    public async Task<ExamResult<bool>> RevokePermissionAsync(Guid teacherId, Guid examId, Guid studentId, CancellationToken ct)
    {
        if (await OwnedExamAsync(teacherId, examId, ct) is null) return ExamResult<bool>.Fail(ExamFailure.NotFound);
        var permission = await dbContext.ExamPermissions.SingleOrDefaultAsync(x => x.ExamId == examId && x.StudentId == studentId, ct); if (permission is null) return ExamResult<bool>.Fail(ExamFailure.NotFound);
        if (await dbContext.ExamAttempts.AnyAsync(x => x.ExamId == examId && x.StudentId == studentId, ct)) return ExamResult<bool>.Fail(ExamFailure.Conflict, "Permission cannot be revoked after an attempt has started.");
        if (permission.Status == PermissionStatus.Revoked) return ExamResult<bool>.Success(true);
        permission.Status = PermissionStatus.Revoked; permission.RevokedAt = DateTimeOffset.UtcNow; await dbContext.SaveChangesAsync(ct); return ExamResult<bool>.Success(true);
    }

    public async Task<ExamResult<SLES.Application.Practice.PagedResult<TeacherExamResultItem>>> GetTeacherResultsAsync(Guid teacherId, Guid examId, TeacherExamResultsQuery query, CancellationToken ct)
    {
        if (!ValidPage(query.Page, query.PageSize)) return ExamResult<SLES.Application.Practice.PagedResult<TeacherExamResultItem>>.Fail(ExamFailure.InvalidRequest);
        if (await OwnedExamAsync(teacherId, examId, ct) is null) return ExamResult<SLES.Application.Practice.PagedResult<TeacherExamResultItem>>.Fail(ExamFailure.NotFound);
        var rows = from permission in dbContext.ExamPermissions.AsNoTracking().Where(x => x.ExamId == examId)
                   join student in dbContext.Users.AsNoTracking() on permission.StudentId equals student.Id
                   join attempt in dbContext.ExamAttempts.AsNoTracking().Where(x => x.ExamId == examId) on student.Id equals attempt.StudentId into attempts
                   from attempt in attempts.DefaultIfEmpty()
                   select new { permission, student, attempt };
        if (!string.IsNullOrWhiteSpace(query.StudentKeyword)) { var keyword = query.StudentKeyword.Trim(); rows = rows.Where(x => x.student.Username.Contains(keyword) || x.student.FullName.Contains(keyword)); }
        var total = await rows.CountAsync(ct);
        var items = await rows.OrderBy(x => x.student.FullName).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(x => new TeacherExamResultItem(x.student.Id, x.student.Username, x.student.FullName, x.permission.Status, x.attempt == null ? null : x.attempt.Id, x.attempt == null ? null : x.attempt.Status, x.attempt == null ? null : x.attempt.Score, x.attempt == null ? null : (int?)x.attempt.CorrectCount, x.attempt == null ? null : (int?)x.attempt.WrongCount, x.attempt == null ? null : (int?)(x.attempt.TotalQuestions - x.attempt.CorrectCount - x.attempt.WrongCount), x.attempt == null || x.attempt.Score == null ? null : x.attempt.Score * 10m, x.attempt == null ? null : x.attempt.SubmittedAt)).ToListAsync(ct);
        return ExamResult<SLES.Application.Practice.PagedResult<TeacherExamResultItem>>.Success(new SLES.Application.Practice.PagedResult<TeacherExamResultItem>(items, query.Page, query.PageSize, total));
    }

    public async Task<ExamResult<ExamResultResponse>> GetTeacherAttemptAsync(Guid teacherId, Guid examId, Guid attemptId, CancellationToken ct)
    {
        if (await OwnedExamAsync(teacherId, examId, ct) is null) return ExamResult<ExamResultResponse>.Fail(ExamFailure.NotFound);
        var attempt = await AttemptGraphAsync(x => x.Id == attemptId && x.ExamId == examId, ct); if (attempt is null) return ExamResult<ExamResultResponse>.Fail(ExamFailure.NotFound);
        await FinalizeIfExpiredAsync(attempt, ct); if (attempt.Status == ExamAttemptStatus.InProgress) return ExamResult<ExamResultResponse>.Fail(ExamFailure.ResultUnavailable);
        var student = await dbContext.Users.AsNoTracking().SingleAsync(x => x.Id == attempt.StudentId, ct);
        return ExamResult<ExamResultResponse>.Success(ToResultResponse(attempt) with
        {
            StudentId = student.Id, StudentUsername = student.Username,
            StudentFullName = student.FullName, StartedAt = attempt.StartedAt
        });
    }

    public async Task<ExamResult<SLES.Application.Practice.PagedResult<StudentAvailableExamResponse>>> GetAvailableAsync(Guid studentId, int page, int pageSize, CancellationToken ct)
    {
        if (!ValidPage(page, pageSize)) return ExamResult<SLES.Application.Practice.PagedResult<StudentAvailableExamResponse>>.Fail(ExamFailure.InvalidRequest);
        var student = await StudentAsync(studentId, ct); if (student?.CreatedByTeacherId is not { } teacherId || student.GradeId is not { } gradeId) return ExamResult<SLES.Application.Practice.PagedResult<StudentAvailableExamResponse>>.Fail(ExamFailure.NotFound);
        var now = DateTimeOffset.UtcNow;
        var exams = from permission in dbContext.ExamPermissions.AsNoTracking()
                    join exam in dbContext.Exams.AsNoTracking() on permission.ExamId equals exam.Id
                    join chapter in dbContext.Chapters.AsNoTracking() on exam.ChapterId equals chapter.Id
                    where permission.StudentId == studentId && permission.Status == PermissionStatus.Granted && exam.TeacherId == teacherId && chapter.GradeId == gradeId && chapter.Status == ChapterStatus.Published && chapter.DeletedAt == null && (exam.Status == ExamStatus.Active || exam.Status == ExamStatus.Scheduled) && (!exam.StartAt.HasValue || exam.StartAt <= now) && (!exam.EndAt.HasValue || exam.EndAt > now)
                    select new { exam, chapter };
        var total = await exams.CountAsync(ct);
        var items = await exams.OrderBy(x => x.exam.StartAt).ThenBy(x => x.exam.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new StudentAvailableExamResponse(x.exam.Id, x.exam.Name, x.exam.Description, x.chapter.Id, x.chapter.Name, x.exam.DurationMinutes, x.exam.StartAt, x.exam.EndAt, x.exam.Status)).ToListAsync(ct);
        return ExamResult<SLES.Application.Practice.PagedResult<StudentAvailableExamResponse>>.Success(new SLES.Application.Practice.PagedResult<StudentAvailableExamResponse>(items, page, pageSize, total));
    }

    private async Task<ExamResult<ExamAttemptResponse>> StartCoreAsync(Guid studentId, Guid examId, CancellationToken ct)
    {
        var student = await StudentAsync(studentId, ct); if (student?.CreatedByTeacherId is not { } teacherId || student.GradeId is not { } gradeId) return ExamResult<ExamAttemptResponse>.Fail(ExamFailure.NotFound);
        var exam = await dbContext.Exams.SingleOrDefaultAsync(x => x.Id == examId && x.TeacherId == teacherId, ct); if (exam is null || !Available(exam, DateTimeOffset.UtcNow)) return ExamResult<ExamAttemptResponse>.Fail(ExamFailure.NotFound);
        var chapter = await dbContext.Chapters.AsNoTracking().SingleOrDefaultAsync(x => x.Id == exam.ChapterId && x.TeacherId == teacherId && x.GradeId == gradeId && x.Status == ChapterStatus.Published && x.DeletedAt == null, ct); if (chapter is null) return ExamResult<ExamAttemptResponse>.Fail(ExamFailure.NotFound);
        if (!await dbContext.ExamPermissions.AnyAsync(x => x.ExamId == examId && x.StudentId == studentId && x.Status == PermissionStatus.Granted, ct)) return ExamResult<ExamAttemptResponse>.Fail(ExamFailure.PermissionInvalid);
        var existing = await AttemptGraphAsync(x => x.ExamId == examId && x.StudentId == studentId, ct); if (existing is not null) { await FinalizeIfExpiredAsync(existing, ct); return ExamResult<ExamAttemptResponse>.Success(ToAttemptResponse(existing)); }
        var blueprint = await BlueprintAsync(chapter.Id, ct);
        if (!blueprint.Ready) return BlueprintFailure<ExamAttemptResponse>(blueprint);
        var pool = await EligibleQuestions(chapter.Id).Where(q => q.Difficulty != null).Select(q => new { q.Id, q.Difficulty }).ToListAsync(ct);
        var selectedIds = new List<Guid>();
        foreach (var level in blueprint.Levels)
        {
            var ids = pool.Where(q => q.Difficulty == level.Difficulty).Select(q => q.Id).ToArray();
            RandomNumberGenerator.Shuffle(ids.AsSpan()); selectedIds.AddRange(ids.Take(level.Required));
        }
        var order = selectedIds.ToArray(); RandomNumberGenerator.Shuffle(order.AsSpan());
        var selected = await dbContext.Questions.AsNoTracking().Include(q => q.Options).Where(q => selectedIds.Contains(q.Id)).ToListAsync(ct);
        var questions = order.Select(id => selected.Single(q => q.Id == id)).ToList();
        var now = DateTimeOffset.UtcNow; var expires = now.AddMinutes(exam.DurationMinutes); if (exam.EndAt.HasValue && exam.EndAt < expires) expires = exam.EndAt.Value; if (expires <= now) return ExamResult<ExamAttemptResponse>.Fail(ExamFailure.AttemptExpired);
        var attempt = new ExamAttempt { ExamId = exam.Id, StudentId = studentId, TeacherId = teacherId, Status = ExamAttemptStatus.InProgress, StartedAt = now, ExpiresAt = expires, TotalQuestions = 10, CreatedAt = now };
        dbContext.ExamAttempts.Add(attempt);
        foreach (var (question, index) in questions.Select((q, i) => (q, i)))
        {
            var snapshot = new ExamAttemptQuestion { SourceQuestionId = question.Id, QuestionSnapshot = JsonSerializer.SerializeToDocument(new { content = question.Content, difficulty = question.Difficulty!.Value.ToString() }), DisplayOrder = (short)(index + 1), CreatedAt = now };
            foreach (var (option, optionIndex) in question.Options.OrderBy(_ => Guid.NewGuid()).Select((o, i) => (o, i))) snapshot.Options.Add(new ExamAttemptOption { SourceOptionId = option.Id, Label = ((char)('A' + optionIndex)).ToString(), Content = option.Content, IsCorrect = option.IsCorrect, DisplayOrder = (short)(optionIndex + 1) });
            attempt.Questions.Add(snapshot);
        }
        await SaveTransactionalAsync(ct);
        return ExamResult<ExamAttemptResponse>.Success(ToAttemptResponse(attempt));
    }

    public async Task<ExamResult<ExamAttemptResponse>> GetCurrentAttemptAsync(Guid studentId, Guid examId, CancellationToken ct)
    {
        var attempt = await AttemptGraphAsync(x => x.StudentId == studentId && x.ExamId == examId, ct); if (attempt is null) return ExamResult<ExamAttemptResponse>.Fail(ExamFailure.NotFound);
        await FinalizeIfExpiredAsync(attempt, ct); return ExamResult<ExamAttemptResponse>.Success(ToAttemptResponse(attempt));
    }
    public async Task<ExamResult<ExamAttemptResponse>> GetAttemptAsync(Guid studentId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await AttemptGraphAsync(x => x.StudentId == studentId && x.Id == attemptId, ct); if (attempt is null) return ExamResult<ExamAttemptResponse>.Fail(ExamFailure.NotFound);
        await FinalizeIfExpiredAsync(attempt, ct); return ExamResult<ExamAttemptResponse>.Success(ToAttemptResponse(attempt));
    }

    public async Task<ExamResult<bool>> SaveAnswerAsync(Guid studentId, Guid attemptId, Guid attemptQuestionId, SaveExamAnswerRequest request, CancellationToken ct)
    {
        var attempt = await AttemptGraphAsync(x => x.Id == attemptId && x.StudentId == studentId, ct); if (attempt is null) return ExamResult<bool>.Fail(ExamFailure.NotFound);
        await FinalizeIfExpiredAsync(attempt, ct); if (attempt.Status != ExamAttemptStatus.InProgress) return ExamResult<bool>.Fail(ExamFailure.AttemptExpired);
        var question = attempt.Questions.SingleOrDefault(x => x.Id == attemptQuestionId); if (question is null) return ExamResult<bool>.Fail(ExamFailure.QuestionNotInAttempt);
        if (request.SelectedOptionId.HasValue && !question.Options.Any(x => x.Id == request.SelectedOptionId.Value)) return ExamResult<bool>.Fail(ExamFailure.AnswerOptionInvalid);
        if (question.Answer is null) { var answer = new ExamAnswer { ExamAttemptQuestionId = question.Id, SelectedOptionId = request.SelectedOptionId, AnsweredAt = DateTimeOffset.UtcNow }; question.Answer = answer; dbContext.ExamAnswers.Add(answer); } else { question.Answer.SelectedOptionId = request.SelectedOptionId; question.Answer.IsCorrect = null; question.Answer.AnsweredAt = DateTimeOffset.UtcNow; }
        try { await dbContext.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is Npgsql.PostgresException { SqlState: "23505", ConstraintName: "exam_answers_exam_attempt_question_id_key" })
        {
            // A concurrent first answer already won the unique question constraint.
            // Keep that committed answer and let the caller reload/retry explicitly.
            dbContext.ChangeTracker.Clear();
            return ExamResult<bool>.Fail(ExamFailure.Conflict, "The answer changed concurrently. Reload and retry.");
        }
        return ExamResult<bool>.Success(true);
    }

    public async Task<ExamResult<ExamResultResponse>> SubmitAsync(Guid studentId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await AttemptGraphAsync(x => x.Id == attemptId && x.StudentId == studentId, ct); if (attempt is null) return ExamResult<ExamResultResponse>.Fail(ExamFailure.NotFound);
        if (attempt.Status == ExamAttemptStatus.InProgress) await SubmitCoreAsync(attempt, DateTimeOffset.UtcNow > attempt.ExpiresAt, ct);
        return ExamResult<ExamResultResponse>.Success(ToResultResponse(attempt));
    }

    public async Task<ExamResult<ExamResultResponse>> GetResultAsync(Guid studentId, Guid attemptId, CancellationToken ct)
    {
        var attempt = await AttemptGraphAsync(x => x.Id == attemptId && x.StudentId == studentId, ct); if (attempt is null) return ExamResult<ExamResultResponse>.Fail(ExamFailure.NotFound);
        await FinalizeIfExpiredAsync(attempt, ct); return attempt.Status == ExamAttemptStatus.InProgress ? ExamResult<ExamResultResponse>.Fail(ExamFailure.ResultUnavailable) : ExamResult<ExamResultResponse>.Success(ToResultResponse(attempt));
    }

    private async Task FinalizeIfExpiredAsync(ExamAttempt attempt, CancellationToken ct) { if (attempt.Status == ExamAttemptStatus.InProgress && DateTimeOffset.UtcNow >= attempt.ExpiresAt) await SubmitCoreAsync(attempt, true, ct); }
    private async Task SubmitCoreAsync(ExamAttempt attempt, bool automatic, CancellationToken ct)
    {
        foreach (var question in attempt.Questions) { if (question.Answer is not null) question.Answer.IsCorrect = question.Answer.SelectedOptionId.HasValue && question.Options.Any(x => x.Id == question.Answer.SelectedOptionId && x.IsCorrect); }
        attempt.CorrectCount = (short)attempt.Questions.Count(x => x.Answer?.IsCorrect == true); attempt.WrongCount = (short)attempt.Questions.Count(x => x.Answer?.SelectedOptionId.HasValue == true && x.Answer.IsCorrect == false); attempt.Score = attempt.CorrectCount; attempt.Status = automatic ? ExamAttemptStatus.AutoSubmitted : ExamAttemptStatus.Submitted; attempt.SubmittedAt = DateTimeOffset.UtcNow;
        await SaveTransactionalAsync(ct);
    }

    private async Task<ExamResult<bool>> GrantCoreAsync(Guid teacherId, Exam exam, Guid studentId, CancellationToken ct)
    {
        if (exam.Status is ExamStatus.Closed or ExamStatus.Cancelled) return ExamResult<bool>.Fail(ExamFailure.InvalidLifecycle, "Closed exams cannot receive permissions.");
        var student = await StudentAsync(studentId, ct); var chapter = await dbContext.Chapters.AsNoTracking().SingleOrDefaultAsync(x => x.Id == exam.ChapterId, ct);
        if (student?.CreatedByTeacherId != teacherId || student.GradeId is null || chapter is null || student.GradeId != chapter.GradeId) return ExamResult<bool>.Fail(ExamFailure.PermissionInvalid, "Student must be active, owned by the teacher, and in the chapter grade.");
        var permission = await dbContext.ExamPermissions.SingleOrDefaultAsync(x => x.ExamId == exam.Id && x.StudentId == studentId, ct);
        if (permission is null) dbContext.ExamPermissions.Add(new ExamPermission { ExamId = exam.Id, TeacherId = teacherId, StudentId = studentId, GrantedBy = teacherId, Status = PermissionStatus.Granted, GrantedAt = DateTimeOffset.UtcNow });
        else if (permission.Status == PermissionStatus.Revoked) { permission.Status = PermissionStatus.Granted; permission.GrantedAt = DateTimeOffset.UtcNow; permission.RevokedAt = null; }
        return ExamResult<bool>.Success(true);
    }
    private async Task<ExamPermissionResponse?> PermissionResponseAsync(Guid examId, Guid studentId, CancellationToken ct) => await (from permission in dbContext.ExamPermissions.AsNoTracking() join student in dbContext.Users.AsNoTracking() on permission.StudentId equals student.Id where permission.ExamId == examId && permission.StudentId == studentId select new ExamPermissionResponse(student.Id, student.Username, student.FullName, permission.Status, permission.GrantedAt, permission.RevokedAt, dbContext.ExamAttempts.Any(x => x.ExamId == examId && x.StudentId == studentId)) {
        GradeId = student.GradeId, GradeName = student.Grade == null ? null : student.Grade.Name,
        AttemptStatus = dbContext.ExamAttempts.Where(a => a.ExamId == examId && a.StudentId == studentId).Select(a => (ExamAttemptStatus?)a.Status).FirstOrDefault()
    }).SingleOrDefaultAsync(ct);
    private Task<Exam?> OwnedExamAsync(Guid teacherId, Guid examId, CancellationToken ct) => dbContext.Exams.SingleOrDefaultAsync(x => x.Id == examId && x.TeacherId == teacherId, ct);
    private Task<Chapter?> OwnedPublishedChapterAsync(Guid teacherId, Guid chapterId, CancellationToken ct) => dbContext.Chapters.AsNoTracking().SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.Status == ChapterStatus.Published && x.DeletedAt == null, ct);
    private Task<User?> StudentAsync(Guid studentId, CancellationToken ct) => dbContext.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == studentId && x.IsActive && x.DeletedAt == null && x.Role.Code == RoleCodes.Student, ct);
    private Task<ExamAttempt?> AttemptGraphAsync(System.Linq.Expressions.Expression<Func<ExamAttempt, bool>> predicate, CancellationToken ct) => dbContext.ExamAttempts.Include(x => x.Questions).ThenInclude(x => x.Options).Include(x => x.Questions).ThenInclude(x => x.Answer).SingleOrDefaultAsync(predicate, ct);
    private async Task<List<Question>> ValidQuestionsAsync(Guid chapterId, CancellationToken ct) => await dbContext.Questions.AsNoTracking().Include(x => x.Options).Where(x => x.ChapterId == chapterId && x.DeletedAt == null && x.Status == QuestionStatus.Published && !string.IsNullOrWhiteSpace(x.Content) && x.Options.Count == 4 && x.Options.All(o => !string.IsNullOrWhiteSpace(o.Content)) && x.Options.Count(o => o.IsCorrect) == 1).ToListAsync(ct);
    private async Task SaveTransactionalAsync(CancellationToken ct) { if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null) { await dbContext.SaveChangesAsync(ct); return; } await using var tx = await dbContext.Database.BeginTransactionAsync(ct); await dbContext.SaveChangesAsync(ct); await tx.CommitAsync(ct); }
    private static bool Available(Exam exam, DateTimeOffset now) => (exam.Status is ExamStatus.Active or ExamStatus.Scheduled) && (!exam.StartAt.HasValue || exam.StartAt <= now) && (!exam.EndAt.HasValue || exam.EndAt > now);
    private static bool ValidConfiguration(string? name, int duration, DateTimeOffset? start, DateTimeOffset? end) => !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= 255 && duration > 0 && (!start.HasValue || !end.HasValue || end > start);
    private static bool ValidPage(int page, int pageSize) => page >= 1 && pageSize is >= 1 and <= 100;
    private static string? CleanOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ExamResponse ToExamResponse(Exam x, int permissions, int attempts) => new(x.Id, x.ChapterId, x.Name, x.Description, x.QuestionCount, x.DurationMinutes, x.StartAt, x.EndAt, x.Status, x.OpenedAt, x.ClosedAt, x.CreatedAt, x.UpdatedAt, permissions, attempts);
    private static string Content(ExamAttemptQuestion question) => question.QuestionSnapshot.RootElement.TryGetProperty("content", out var content) ? content.GetString() ?? string.Empty : string.Empty;
    private static ExamAttemptResponse ToAttemptResponse(ExamAttempt attempt) => new(attempt.Id, attempt.ExamId, attempt.Status, attempt.StartedAt, attempt.ExpiresAt, Math.Max(0, (int)Math.Ceiling((attempt.ExpiresAt - DateTimeOffset.UtcNow).TotalSeconds)), attempt.Questions.Count(x => x.Answer?.SelectedOptionId.HasValue == true), attempt.Questions.OrderBy(x => x.DisplayOrder).Select(x => new ExamQuestionResponse(x.Id, x.DisplayOrder, Content(x), x.Answer?.SelectedOptionId, x.Options.OrderBy(o => o.DisplayOrder).Select(o => new ExamOptionResponse(o.Id, o.Label, o.Content)).ToList())).ToList());
    private static ExamResultResponse ToResultResponse(ExamAttempt attempt) { var answered = attempt.Questions.Count(x => x.Answer?.SelectedOptionId.HasValue == true); return new ExamResultResponse(attempt.Id, attempt.ExamId, attempt.Status, attempt.TotalQuestions, answered, attempt.CorrectCount, attempt.WrongCount, attempt.TotalQuestions - attempt.CorrectCount - attempt.WrongCount, attempt.Score ?? 0, (attempt.Score ?? 0) * 10m, attempt.SubmittedAt!.Value, attempt.Questions.OrderBy(x => x.DisplayOrder).Select(x => new ExamResultQuestionResponse(x.Id, x.DisplayOrder, Content(x), x.Answer?.SelectedOptionId, x.Answer?.IsCorrect, x.Options.OrderBy(o => o.DisplayOrder).Select(o => new ExamResultOptionResponse(o.Id, o.Label, o.Content, o.IsCorrect)).ToList())).ToList()) { StartedAt = attempt.StartedAt }; }
}
