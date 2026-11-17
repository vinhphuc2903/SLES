using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.BulkManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
public sealed class BulkManagementController(IBulkManagementService service) : SlesControllerBase
{
    [Authorize(Roles = RoleCodes.Teacher)]
    [HttpPost("api/teacher/questions/bulk-delete")]
    public Task<IActionResult> Questions(BulkManagementRequest request, CancellationToken ct) => Execute(BulkResource.Questions, request, ct);
    [Authorize(Roles = RoleCodes.Teacher)]
    [HttpPost("api/teacher/chapters/bulk-delete")]
    public Task<IActionResult> Chapters(BulkManagementRequest request, CancellationToken ct) => Execute(BulkResource.Chapters, request, ct);
    [Authorize(Roles = RoleCodes.Teacher)]
    [HttpPost("api/teacher/students/bulk-deactivate")]
    public Task<IActionResult> Students(BulkManagementRequest request, CancellationToken ct) => Execute(BulkResource.Students, request, ct);
    [Authorize(Roles = RoleCodes.Admin)]
    [HttpPost("api/admin/teachers/bulk-deactivate")]
    public Task<IActionResult> Teachers(BulkManagementRequest request, CancellationToken ct) => Execute(BulkResource.Teachers, request, ct);
    [Authorize(Roles = RoleCodes.Teacher)]
    [HttpPost("api/teacher/exams/bulk-close")]
    public Task<IActionResult> Exams(BulkManagementRequest request, CancellationToken ct) => Execute(BulkResource.Exams, request, ct);

    private async Task<IActionResult> Execute(BulkResource resource, BulkManagementRequest request, CancellationToken ct)
    {
        if (CurrentUserId() is not { } actor) return InvalidToken();
        var result = await service.ExecuteAsync(actor, resource, request, ct);
        return result.Error switch
        {
            null => Ok(result.Value),
            "forbidden" => Forbid(),
            "conflict" => Conflict(Error("conflict", "Dữ liệu vừa thay đổi; tải lại danh sách trước khi thử lại.")),
            _ => BadRequest(Error("invalid_request", "Cần từ 1 đến 100 UUID hợp lệ, khác UUID rỗng."))
        };
    }
}
