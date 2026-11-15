namespace SLES.Application.ChapterManagement;

public sealed record GradeLookupResponse(Guid Id, string Code, string Name, short DisplayOrder);
public interface IGradeLookupService
{
    Task<IReadOnlyList<GradeLookupResponse>> ListActiveAsync(CancellationToken cancellationToken);
}
