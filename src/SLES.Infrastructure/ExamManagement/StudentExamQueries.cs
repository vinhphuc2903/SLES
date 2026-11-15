using Microsoft.EntityFrameworkCore;
using SLES.Application.ExamManagement;
using SLES.Application.Practice;
using SLES.Domain.Enums;

namespace SLES.Infrastructure.ExamManagement;

public sealed partial class ExamManagementService
{
    // Discovery includes upcoming/closed authorized exams; the existing available API is unchanged.
    private IQueryable<StudentExamResponse> StudentExams(Guid studentId, Guid teacherId, Guid gradeId, Guid? examId = null)
    {
        var now = DateTimeOffset.UtcNow;
        return from exam in dbContext.Exams.AsNoTracking().Where(e => !examId.HasValue || e.Id == examId.Value)
               join chapter in dbContext.Chapters.AsNoTracking() on exam.ChapterId equals chapter.Id
               join subject in dbContext.Subjects.AsNoTracking() on chapter.SubjectId equals subject.Id
               join attempt in dbContext.ExamAttempts.AsNoTracking().Where(a => a.StudentId == studentId) on exam.Id equals attempt.ExamId into attempts
               from attempt in attempts.DefaultIfEmpty()
               where attempt != null || (exam.TeacherId == teacherId && chapter.GradeId == gradeId && chapter.DeletedAt == null && chapter.Status == ChapterStatus.Published && exam.Status != ExamStatus.Draft && dbContext.ExamPermissions.Any(p => p.ExamId == exam.Id && p.StudentId == studentId && p.Status == PermissionStatus.Granted))
               orderby exam.StartAt, exam.Id
               select new StudentExamResponse(exam.Id, exam.Name, exam.Description, chapter.Id, chapter.Name, subject.Name, exam.DurationMinutes, exam.StartAt, exam.EndAt, exam.Status,
                   attempt == null && (exam.Status == ExamStatus.Active || exam.Status == ExamStatus.Scheduled) && (!exam.StartAt.HasValue || exam.StartAt <= now) && (!exam.EndAt.HasValue || exam.EndAt > now),
                   attempt == null ? null : attempt.Id, attempt == null ? null : attempt.Status, now);
    }

    public async Task<ExamResult<PagedResult<StudentExamResponse>>> ListStudentExamsAsync(Guid studentId, int page, int pageSize, CancellationToken ct)
    {
        if (!ValidPage(page, pageSize)) return ExamResult<PagedResult<StudentExamResponse>>.Fail(ExamFailure.InvalidRequest);
        var student = await StudentAsync(studentId, ct);
        if (student is null) return ExamResult<PagedResult<StudentExamResponse>>.Fail(ExamFailure.NotFound);
        var query = StudentExams(studentId, student.CreatedByTeacherId ?? Guid.Empty, student.GradeId ?? Guid.Empty);
        var total = await query.CountAsync(ct);
        return ExamResult<PagedResult<StudentExamResponse>>.Success(new(await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct), page, pageSize, total));
    }

    public async Task<ExamResult<StudentExamResponse>> GetStudentExamAsync(Guid studentId, Guid examId, CancellationToken ct)
    {
        var student = await StudentAsync(studentId, ct);
        if (student is null) return ExamResult<StudentExamResponse>.Fail(ExamFailure.NotFound);
        var exam = await StudentExams(studentId, student.CreatedByTeacherId ?? Guid.Empty, student.GradeId ?? Guid.Empty, examId).SingleOrDefaultAsync(ct);
        return exam is null ? ExamResult<StudentExamResponse>.Fail(ExamFailure.NotFound) : ExamResult<StudentExamResponse>.Success(exam);
    }

    public async Task<ExamResult<PagedResult<StudentExamHistoryItem>>> GetStudentHistoryAsync(Guid studentId, int page, int pageSize, CancellationToken ct)
    {
        if (!ValidPage(page, pageSize)) return ExamResult<PagedResult<StudentExamHistoryItem>>.Fail(ExamFailure.InvalidRequest);
        if (await StudentAsync(studentId, ct) is null) return ExamResult<PagedResult<StudentExamHistoryItem>>.Fail(ExamFailure.NotFound);
        var owned = dbContext.ExamAttempts.Where(a => a.StudentId == studentId);
        var total = await owned.CountAsync(ct);
        var ids = await owned.OrderByDescending(a => a.StartedAt).ThenBy(a => a.Id).Skip((page - 1) * pageSize).Take(pageSize).Select(a => a.Id).ToListAsync(ct);
        // Reuse the scoring/expiration path only for expired attempts on this page.
        var expired = await owned.Where(a => ids.Contains(a.Id) && a.Status == ExamAttemptStatus.InProgress && a.ExpiresAt <= DateTimeOffset.UtcNow).Select(a => a.Id).ToListAsync(ct);
        foreach (var id in expired) await FinalizeIfExpiredAsync((await AttemptGraphAsync(a => a.Id == id && a.StudentId == studentId, ct))!, ct);
        var rows = await (from a in owned.AsNoTracking().Where(a => ids.Contains(a.Id))
                          join exam in dbContext.Exams on a.ExamId equals exam.Id
                          join chapter in dbContext.Chapters on exam.ChapterId equals chapter.Id
                          join subject in dbContext.Subjects on chapter.SubjectId equals subject.Id
                          orderby a.StartedAt descending, a.Id
                          select new StudentExamHistoryItem(a.Id, exam.Id, exam.Name, chapter.Name, subject.Name, a.Status, a.StartedAt, a.ExpiresAt, a.SubmittedAt, a.Score)).ToListAsync(ct);
        return ExamResult<PagedResult<StudentExamHistoryItem>>.Success(new(rows, page, pageSize, total));
    }
}
