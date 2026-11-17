namespace SLES.Application.BulkManagement;

public enum BulkResource { Questions, Students, Teachers, Chapters, Exams }
public sealed record BulkManagementRequest(IReadOnlyList<string>? Ids);
public sealed record BulkItemResult(Guid Id, bool Success, string? Code = null, string? Message = null);
public sealed record BulkManagementResponse(int RequestedCount, int SuccessCount, int FailedCount, IReadOnlyList<BulkItemResult> Results);
public sealed record BulkManagementResult(BulkManagementResponse? Value, string? Error = null);
public interface IBulkManagementService
{
    Task<BulkManagementResult> ExecuteAsync(Guid actorId, BulkResource resource, BulkManagementRequest request, CancellationToken ct);
}
