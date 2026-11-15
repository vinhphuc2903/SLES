using Microsoft.EntityFrameworkCore;
using SLES.Application.ChapterManagement;
using SLES.Domain.Entities;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.ChapterManagement;

public sealed class SubjectManagementService(SlesDbContext dbContext) : ISubjectManagementService
{
    public Task<ChapterResult<PagedResult<SubjectResponse>>> ListActiveAsync(SubjectListQuery query, CancellationToken cancellationToken) =>
        ListAsync(new AdminSubjectListQuery(query.Page, query.PageSize, query.Search, true, query.SortDescending), cancellationToken);

    public Task<ChapterResult<PagedResult<SubjectResponse>>> ListForAdminAsync(AdminSubjectListQuery query, CancellationToken cancellationToken) =>
        ListAsync(query, cancellationToken);

    private async Task<ChapterResult<PagedResult<SubjectResponse>>> ListAsync(AdminSubjectListQuery query, CancellationToken cancellationToken)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100) return ChapterResult<PagedResult<SubjectResponse>>.Fail(ChapterFailure.InvalidRequest);
        var subjects = dbContext.Subjects.AsNoTracking();
        if (query.IsActive.HasValue) subjects = subjects.Where(x => x.IsActive == query.IsActive.Value);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var search = query.Search.Trim();
            subjects = subjects.Where(x => x.Code.Contains(search) || x.Name.Contains(search));
        }
        var total = await subjects.CountAsync(cancellationToken);
        subjects = query.SortDescending ? subjects.OrderByDescending(x => x.Name).ThenBy(x => x.Id) : subjects.OrderBy(x => x.Name).ThenBy(x => x.Id);
        var items = await subjects.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).Select(x => ToResponse(x)).ToListAsync(cancellationToken);
        return ChapterResult<PagedResult<SubjectResponse>>.Success(new PagedResult<SubjectResponse>(items, query.Page, query.PageSize, total));
    }

    public async Task<ChapterResult<SubjectResponse>> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var subject = await dbContext.Subjects.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        return subject is null ? ChapterResult<SubjectResponse>.Fail(ChapterFailure.NotFound) : ChapterResult<SubjectResponse>.Success(ToResponse(subject));
    }

    public async Task<ChapterResult<SubjectResponse>> CreateAsync(CreateSubjectRequest request, CancellationToken cancellationToken)
    {
        var code = request.Code?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(code) || code.Length > 50 || string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 255) return ChapterResult<SubjectResponse>.Fail(ChapterFailure.InvalidRequest);
        if (await dbContext.Subjects.AnyAsync(x => x.Code == code, cancellationToken)) return ChapterResult<SubjectResponse>.Fail(ChapterFailure.Conflict, "Subject code already exists.");
        var now = DateTimeOffset.UtcNow;
        var subject = new Subject { Code = code, Name = request.Name.Trim(), Description = Normalize(request.Description), IsActive = true, CreatedAt = now, UpdatedAt = now };
        dbContext.Subjects.Add(subject);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ChapterResult<SubjectResponse>.Success(ToResponse(subject));
    }

    public async Task<ChapterResult<SubjectResponse>> UpdateAsync(Guid id, UpdateSubjectRequest request, CancellationToken cancellationToken)
    {
        var subject = await dbContext.Subjects.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (subject is null) return ChapterResult<SubjectResponse>.Fail(ChapterFailure.NotFound);
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 255) return ChapterResult<SubjectResponse>.Fail(ChapterFailure.InvalidRequest);
        subject.Name = request.Name.Trim(); subject.Description = Normalize(request.Description); subject.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ChapterResult<SubjectResponse>.Success(ToResponse(subject));
    }

    public async Task<ChapterResult<bool>> SetStatusAsync(Guid id, ChangeSubjectStatusRequest request, CancellationToken cancellationToken)
    {
        var subject = await dbContext.Subjects.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (subject is null) return ChapterResult<bool>.Fail(ChapterFailure.NotFound);
        subject.IsActive = request.IsActive; subject.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ChapterResult<bool>.Success(true);
    }

    private static SubjectResponse ToResponse(Subject x) => new(x.Id, x.Code, x.Name, x.Description, x.IsActive, x.CreatedAt, x.UpdatedAt);
    private static string? Normalize(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();
}
