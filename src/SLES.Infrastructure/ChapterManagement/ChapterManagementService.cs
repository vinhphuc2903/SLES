using Microsoft.EntityFrameworkCore;
using System.Data;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.ChapterManagement;

public sealed class ChapterManagementService(SlesDbContext dbContext, IChapterPublicationValidator publicationValidator) : IChapterManagementService
{
    public async Task<ChapterResult<ChapterResponse>> CreateAsync(Guid teacherId, CreateChapterRequest request, CancellationToken cancellationToken)
    {
        if (!await IsActiveTeacherAsync(teacherId, cancellationToken)) return ChapterResult<ChapterResponse>.Fail(ChapterFailure.Forbidden);
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 255 || request.DisplayOrder <= 0) return ChapterResult<ChapterResponse>.Fail(ChapterFailure.InvalidRequest);
        var grade = await dbContext.Grades.SingleOrDefaultAsync(x => x.Id == request.GradeId && x.IsActive, cancellationToken);
        if (grade is null) return ChapterResult<ChapterResponse>.Fail(ChapterFailure.InvalidGrade);
        var subject = await dbContext.Subjects.SingleOrDefaultAsync(x => x.Id == request.SubjectId && x.IsActive, cancellationToken);
        if (subject is null) return ChapterResult<ChapterResponse>.Fail(ChapterFailure.InvalidSubject);
        var now = DateTimeOffset.UtcNow;
        var chapter = new Chapter { TeacherId = teacherId, GradeId = grade.Id, SubjectId = subject.Id, Name = request.Name.Trim(), Description = Normalize(request.Description), DisplayOrder = request.DisplayOrder, Status = ChapterStatus.Draft, CreatedAt = now, UpdatedAt = now };
        var content = new ChapterContent { Chapter = chapter, Content = string.Empty, ContentFormat = ContentFormat.Markdown, Version = 1, UpdatedBy = teacherId, CreatedAt = now, UpdatedAt = now };
        dbContext.Chapters.Add(chapter);
        dbContext.ChapterContents.Add(content);
        if (dbContext.Database.IsRelational())
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        else await dbContext.SaveChangesAsync(cancellationToken);
        var teacherName = await dbContext.Users.Where(x => x.Id == teacherId).Select(x => x.FullName).SingleAsync(cancellationToken);
        return ChapterResult<ChapterResponse>.Success(ToResponse(chapter, grade.Name, subject.Name, teacherName, true));
    }

    public async Task<ChapterResult<PagedResult<ChapterResponse>>> ListAsync(ChapterActor actor, ChapterListQuery query, CancellationToken cancellationToken)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100 || (query.SortBy != "displayOrder" && query.SortBy != "createdAt")) return ChapterResult<PagedResult<ChapterResponse>>.Fail(ChapterFailure.InvalidRequest);
        IQueryable<Chapter> chapters = dbContext.Chapters.AsNoTracking().Include(x => x.Grade).Include(x => x.Subject).Include(x => x.Teacher).Include(x => x.Content).Where(x => x.DeletedAt == null);
        if (actor.Role == RoleCodes.Teacher) chapters = chapters.Where(x => x.TeacherId == actor.UserId);
        else if (actor.Role == RoleCodes.Student)
        {
            var student = await dbContext.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == actor.UserId && x.DeletedAt == null && x.IsActive && x.Role.Code == RoleCodes.Student, cancellationToken);
            if (student?.CreatedByTeacherId is not { } ownerId || student.GradeId is not { } gradeId) return ChapterResult<PagedResult<ChapterResponse>>.Fail(ChapterFailure.Forbidden);
            chapters = chapters.Where(x => x.TeacherId == ownerId && x.GradeId == gradeId && x.Status == ChapterStatus.Published && x.Subject.IsActive && x.Grade.IsActive);
        }
        else if (actor.Role != RoleCodes.Admin) return ChapterResult<PagedResult<ChapterResponse>>.Fail(ChapterFailure.Forbidden);
        if (query.GradeId.HasValue) chapters = chapters.Where(x => x.GradeId == query.GradeId); if (query.SubjectId.HasValue) chapters = chapters.Where(x => x.SubjectId == query.SubjectId); if (query.TeacherId.HasValue && actor.Role == RoleCodes.Admin) chapters = chapters.Where(x => x.TeacherId == query.TeacherId); if (query.Status.HasValue && actor.Role != RoleCodes.Student) chapters = chapters.Where(x => x.Status == query.Status);
        if (!string.IsNullOrWhiteSpace(query.Search)) chapters = chapters.Where(x => x.Name.Contains(query.Search.Trim()));
        var total = await chapters.CountAsync(cancellationToken);
        chapters = query.SortBy == "createdAt" ? (query.SortDescending ? chapters.OrderByDescending(x => x.CreatedAt) : chapters.OrderBy(x => x.CreatedAt)) : (query.SortDescending ? chapters.OrderByDescending(x => x.DisplayOrder) : chapters.OrderBy(x => x.DisplayOrder));
        var items = await chapters.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).Select(x => new ChapterResponse(x.Id, x.Name, x.Description, x.GradeId, x.Grade.Name, x.SubjectId, x.Subject.Name, x.TeacherId, actor.Role == RoleCodes.Student ? null : x.Teacher.FullName, x.DisplayOrder, x.Status, x.PublishedAt, x.CreatedAt, x.UpdatedAt, x.Content != null && x.Content.Content.Length > 0)).ToListAsync(cancellationToken);
        return ChapterResult<PagedResult<ChapterResponse>>.Success(new PagedResult<ChapterResponse>(items, query.Page, query.PageSize, total));
    }

    public async Task<ChapterResult<ChapterDetailResponse>> GetAsync(ChapterActor actor, Guid chapterId, CancellationToken cancellationToken)
    {
        IQueryable<Chapter> query = dbContext.Chapters.AsNoTracking().Include(x => x.Grade).Include(x => x.Subject).Include(x => x.Teacher).Include(x => x.Content).Where(x => x.Id == chapterId && x.DeletedAt == null);
        if (actor.Role == RoleCodes.Teacher) query = query.Where(x => x.TeacherId == actor.UserId);
        else if (actor.Role == RoleCodes.Student)
        {
            var student = await dbContext.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == actor.UserId && x.DeletedAt == null && x.IsActive && x.Role.Code == RoleCodes.Student, cancellationToken);
            if (student?.CreatedByTeacherId is not { } ownerId || student.GradeId is not { } gradeId) return ChapterResult<ChapterDetailResponse>.Fail(ChapterFailure.NotFound);
            query = query.Where(x => x.TeacherId == ownerId && x.GradeId == gradeId && x.Status == ChapterStatus.Published && x.Subject.IsActive && x.Grade.IsActive);
        }
        else if (actor.Role != RoleCodes.Admin) return ChapterResult<ChapterDetailResponse>.Fail(ChapterFailure.Forbidden);
        var chapter = await query.SingleOrDefaultAsync(cancellationToken);
        if (chapter?.Content is null) return ChapterResult<ChapterDetailResponse>.Fail(ChapterFailure.NotFound);
        return ChapterResult<ChapterDetailResponse>.Success(new ChapterDetailResponse(ToResponse(chapter, chapter.Grade.Name, chapter.Subject.Name, actor.Role == RoleCodes.Student ? null : chapter.Teacher.FullName, chapter.Content.Content.Length > 0), chapter.Content.Content, chapter.Content.ContentFormat, chapter.Content.Version));
    }

    public async Task<ChapterResult<ChapterDetailResponse>> UpdateContentAsync(Guid teacherId, Guid chapterId, UpdateChapterContentRequest request, CancellationToken cancellationToken)
    {
        if (request.Content is null || request.Content.Length > 200_000) return ChapterResult<ChapterDetailResponse>.Fail(ChapterFailure.InvalidRequest);
        var chapter = await dbContext.Chapters.Include(x => x.Grade).Include(x => x.Subject).Include(x => x.Teacher).Include(x => x.Content).SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.DeletedAt == null, cancellationToken);
        if (chapter?.Content is null) return ChapterResult<ChapterDetailResponse>.Fail(ChapterFailure.NotFound);
        if (chapter.Status != ChapterStatus.Draft) return ChapterResult<ChapterDetailResponse>.Fail(ChapterFailure.InvalidTransition, "Only DRAFT content can be edited.");
        if (chapter.Content.Content != request.Content) { chapter.Content.Content = request.Content; chapter.Content.Version++; chapter.Content.UpdatedBy = teacherId; chapter.Content.UpdatedAt = DateTimeOffset.UtcNow; chapter.UpdatedAt = chapter.Content.UpdatedAt; await dbContext.SaveChangesAsync(cancellationToken); }
        return ChapterResult<ChapterDetailResponse>.Success(new ChapterDetailResponse(ToResponse(chapter, chapter.Grade.Name, chapter.Subject.Name, chapter.Teacher.FullName, chapter.Content.Content.Length > 0), chapter.Content.Content, chapter.Content.ContentFormat, chapter.Content.Version));
    }

    public async Task<ChapterResult<bool>> PublishAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken)
    {
        if (dbContext.Database.IsRelational())
        {
            await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            var result = await PublishCoreAsync(teacherId, chapterId, cancellationToken);
            if (result.Failure is null) await transaction.CommitAsync(cancellationToken);
            return result;
        }
        return await PublishCoreAsync(teacherId, chapterId, cancellationToken);
    }

    private async Task<ChapterResult<bool>> PublishCoreAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken)
    {
        var chapter = await dbContext.Chapters.Include(x => x.Content).Include(x => x.Grade).Include(x => x.Subject).SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.DeletedAt == null, cancellationToken);
        if (chapter?.Content is null) return ChapterResult<bool>.Fail(ChapterFailure.NotFound);
        if (chapter.Status != ChapterStatus.Draft) return ChapterResult<bool>.Fail(ChapterFailure.InvalidTransition);
        if (!chapter.Grade.IsActive) return ChapterResult<bool>.Fail(ChapterFailure.InvalidGrade);
        if (!chapter.Subject.IsActive) return ChapterResult<bool>.Fail(ChapterFailure.InvalidSubject);
        if (string.IsNullOrWhiteSpace(chapter.Content.Content)) return ChapterResult<bool>.Fail(ChapterFailure.Conflict, "Markdown content must not be empty.");
        var validation = await publicationValidator.ValidateAsync(chapterId, cancellationToken);
        if (!validation.IsReady) return ChapterResult<bool>.Fail(ChapterFailure.PublicationValidationPending, validation.Detail);
        chapter.Status = ChapterStatus.Published; chapter.PublishedAt = DateTimeOffset.UtcNow; chapter.UpdatedAt = chapter.PublishedAt.Value;
        await dbContext.SaveChangesAsync(cancellationToken); return ChapterResult<bool>.Success(true);
    }

    public async Task<ChapterResult<bool>> ArchiveAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken)
    {
        var chapter = await dbContext.Chapters.SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.DeletedAt == null, cancellationToken);
        if (chapter is null) return ChapterResult<bool>.Fail(ChapterFailure.NotFound);
        if (chapter.Status == ChapterStatus.Archived) return ChapterResult<bool>.Fail(ChapterFailure.InvalidTransition);
        if (chapter.Status == ChapterStatus.Published && (await dbContext.Exams.AnyAsync(x => x.ChapterId == chapterId, cancellationToken) || await dbContext.PracticeAttempts.AnyAsync(x => x.ChapterId == chapterId, cancellationToken))) return ChapterResult<bool>.Fail(ChapterFailure.Conflict, "Chapter history prevents archival.");
        chapter.Status = ChapterStatus.Archived; chapter.UpdatedAt = DateTimeOffset.UtcNow; await dbContext.SaveChangesAsync(cancellationToken); return ChapterResult<bool>.Success(true);
    }

    public async Task<ChapterResult<bool>> DeleteAsync(Guid teacherId, Guid chapterId, CancellationToken cancellationToken)
    {
        var chapter = await dbContext.Chapters.SingleOrDefaultAsync(x => x.Id == chapterId && x.TeacherId == teacherId && x.DeletedAt == null, cancellationToken);
        if (chapter is null) return ChapterResult<bool>.Fail(ChapterFailure.NotFound);
        if (chapter.Status != ChapterStatus.Draft) return ChapterResult<bool>.Fail(ChapterFailure.InvalidTransition);
        if (await dbContext.Questions.AnyAsync(x => x.ChapterId == chapterId, cancellationToken) || await dbContext.Exams.AnyAsync(x => x.ChapterId == chapterId, cancellationToken) || await dbContext.PracticeAttempts.AnyAsync(x => x.ChapterId == chapterId, cancellationToken)) return ChapterResult<bool>.Fail(ChapterFailure.Conflict, "Chapter history prevents deletion.");
        chapter.DeletedAt = DateTimeOffset.UtcNow; chapter.UpdatedAt = chapter.DeletedAt.Value; await dbContext.SaveChangesAsync(cancellationToken); return ChapterResult<bool>.Success(true);
    }

    private Task<bool> IsActiveTeacherAsync(Guid id, CancellationToken ct) => dbContext.Users.AnyAsync(x => x.Id == id && x.DeletedAt == null && x.IsActive && x.Role.Code == RoleCodes.Teacher, ct);
    private static ChapterResponse ToResponse(Chapter x, string grade, string subject, string? teacher, bool hasContent) => new(x.Id, x.Name, x.Description, x.GradeId, grade, x.SubjectId, subject, x.TeacherId, teacher, x.DisplayOrder, x.Status, x.PublishedAt, x.CreatedAt, x.UpdatedAt, hasContent);
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
