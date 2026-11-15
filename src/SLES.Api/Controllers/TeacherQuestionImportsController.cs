using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.QuestionBank;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[Route("api/teacher")]
[Authorize(Roles = RoleCodes.Teacher)]
public sealed class TeacherQuestionImportsController(IQuestionImportService imports) : SlesControllerBase
{
    [HttpGet("questions/import/template")]
    public IActionResult Template() => File(imports.Template(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "SLES_Question_Import_Template.xlsx");

    [HttpPost("chapters/{chapterId:guid}/questions/import/preview")]
    [RequestSizeLimit(4 * 1024 * 1024 + 65536)]
    [RequestFormLimits(MultipartBodyLengthLimit = 4 * 1024 * 1024 + 65536)]
    public async Task<IActionResult> Preview(Guid chapterId, IFormFile file, CancellationToken ct)
    {
        if (CurrentUserId() is not { } teacher) return InvalidToken();
        if (file.Length == 0 || file.Length > 4 * 1024 * 1024) return BadRequest(Error("invalidrequest", "File phải có dung lượng từ 1 byte đến 4 MiB."));
        await using var input = file.OpenReadStream();
        return From(await imports.PreviewAsync(teacher, chapterId, file.FileName, input, ct));
    }
    [HttpPost("chapters/{chapterId:guid}/questions/import/confirm")]
    public async Task<IActionResult> Confirm(Guid chapterId, ImportConfirmation request, CancellationToken ct) => CurrentUserId() is { } teacher ? From(await imports.ConfirmAsync(teacher, chapterId, request.Token, ct)) : InvalidToken();
    [HttpGet("chapters/{chapterId:guid}/questions/import/status")]
    public IActionResult Status(Guid chapterId, [FromQuery] string token) => CurrentUserId() is { } teacher ? From(imports.Status(teacher, chapterId, token)) : InvalidToken();
    private IActionResult From<T>(QuestionResult<T> result) => result.Failure switch
    {
        null => Ok(result.Value),
        QuestionFailure.NotFound => NotFound(Error("importnotfound", result.Detail ?? "Không tìm thấy chương hoặc preview.")),
        QuestionFailure.NotEditable or QuestionFailure.Conflict => Conflict(Error("importconflict", result.Detail ?? "Chỉ được import vào chương bản nháp.")),
        _ => BadRequest(Error("importinvalid", result.Detail ?? "File không hợp lệ."))
    };
}
