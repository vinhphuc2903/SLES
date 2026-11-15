using Microsoft.EntityFrameworkCore;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;
namespace SLES.Infrastructure.ChapterManagement;
public sealed class StudentLearningService(SlesDbContext db) : IStudentLearningService
{
    private IQueryable<Chapter> Chapters(Guid studentId) =>
        db.Chapters.AsNoTracking().Where(c => c.DeletedAt == null && c.Status == ChapterStatus.Published && c.Subject.IsActive && c.Grade.IsActive &&
            db.Users.Any(s => s.Id == studentId && s.IsActive && s.DeletedAt == null && s.Role.Code == RoleCodes.Student && s.CreatedByTeacherId == c.TeacherId && s.GradeId == c.GradeId));

    private static IQueryable<StudentSubjectResponse> Project(IQueryable<Subject> subjects, IQueryable<Chapter> chapters) =>
        subjects.Select(s => new StudentSubjectResponse(s.Id, s.Name, s.Description,
            chapters.Where(c => c.SubjectId == s.Id).Select(c => c.Grade.Name).First(),
            chapters.Count(c => c.SubjectId == s.Id)));

    public async Task<ChapterResult<PagedResult<StudentSubjectResponse>>> ListSubjectsAsync(Guid studentId, SubjectListQuery query, CancellationToken ct)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100) return ChapterResult<PagedResult<StudentSubjectResponse>>.Fail(ChapterFailure.InvalidRequest);
        var chapters = Chapters(studentId);
        var rows = db.Subjects.AsNoTracking().Where(s => chapters.Any(c => c.SubjectId == s.Id));
        if (!string.IsNullOrWhiteSpace(query.Search)) rows = rows.Where(s => s.Name.Contains(query.Search.Trim()));
        var count = await rows.CountAsync(ct);
        var items = await Project(rows.OrderBy(s => s.Name).ThenBy(s => s.Id).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize), chapters).ToListAsync(ct);
        return ChapterResult<PagedResult<StudentSubjectResponse>>.Success(new(items, query.Page, query.PageSize, count));
    }
    public async Task<ChapterResult<StudentSubjectResponse>> GetSubjectAsync(Guid studentId, Guid subjectId, CancellationToken ct)
    {
        var chapters = Chapters(studentId);
        var subject = await Project(db.Subjects.AsNoTracking().Where(s => s.Id == subjectId && chapters.Any(c => c.SubjectId == s.Id)), chapters).SingleOrDefaultAsync(ct);
        return subject is null ? ChapterResult<StudentSubjectResponse>.Fail(ChapterFailure.NotFound) : ChapterResult<StudentSubjectResponse>.Success(subject);
    }
}

