using Microsoft.EntityFrameworkCore;
using SLES.Application.ChapterManagement;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.ChapterManagement;

public sealed class GradeLookupService(SlesDbContext db) : IGradeLookupService
{
    public async Task<IReadOnlyList<GradeLookupResponse>> ListActiveAsync(CancellationToken cancellationToken) =>
        await db.Grades.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.DisplayOrder).ThenBy(x => x.Id)
            .Select(x => new GradeLookupResponse(x.Id, x.Code, x.Name, x.DisplayOrder)).ToListAsync(cancellationToken);
}
