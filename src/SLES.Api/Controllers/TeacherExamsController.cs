using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ExamManagement;
using SLES.Domain.Constants;
using SLES.Domain.Enums;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/teacher/exams")]
[Authorize(Roles = RoleCodes.Teacher)]
public sealed class TeacherExamsController(IExamManagementService exams) : SlesControllerBase
{
    [HttpGet("/api/teacher/chapters/{chapterId:guid}/exam-blueprint")]
    public async Task<IActionResult> Blueprint(Guid chapterId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetBlueprintAsync(id, chapterId, ct)) : InvalidToken();
    [HttpPost] public async Task<IActionResult> Create(CreateExamRequest request, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.CreateAsync(id, request, ct)) : InvalidToken();
    [HttpGet] public async Task<IActionResult> List([FromQuery] ExamListQuery query, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.ListAsync(id, query, ct)) : InvalidToken();
    [HttpGet("{examId:guid}")] public async Task<IActionResult> Get(Guid examId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetAsync(id, examId, ct)) : InvalidToken();
    [HttpPut("{examId:guid}")] public async Task<IActionResult> Update(Guid examId, UpdateExamRequest request, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.UpdateAsync(id, examId, request, ct)) : InvalidToken();
    [HttpPost("{examId:guid}/publish")] public async Task<IActionResult> Publish(Guid examId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.PublishAsync(id, examId, ct)) : InvalidToken();
    [HttpPost("{examId:guid}/close")] public async Task<IActionResult> Close(Guid examId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.CloseAsync(id, examId, ct)) : InvalidToken();
    [HttpPost("{examId:guid}/permissions")] public async Task<IActionResult> Grant(Guid examId, GrantExamPermissionRequest request, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GrantPermissionAsync(id, examId, request, ct)) : InvalidToken();
    [HttpPost("{examId:guid}/permissions/bulk")] public async Task<IActionResult> GrantBulk(Guid examId, BulkGrantExamPermissionRequest request, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GrantPermissionsAsync(id, examId, request, ct)) : InvalidToken();
    [HttpGet("{examId:guid}/permissions")] public async Task<IActionResult> Permissions(Guid examId, [FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] PermissionStatus? status = null, CancellationToken ct = default) => CurrentUserId() is { } id ? FromExam(await exams.ListPermissionsAsync(id, examId, page, pageSize, status, ct)) : InvalidToken();
    [HttpDelete("{examId:guid}/permissions/{studentId:guid}")] public async Task<IActionResult> Revoke(Guid examId, Guid studentId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.RevokePermissionAsync(id, examId, studentId, ct), true) : InvalidToken();
    [HttpGet("{examId:guid}/results")] public async Task<IActionResult> Results(Guid examId, [FromQuery] TeacherExamResultsQuery query, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetTeacherResultsAsync(id, examId, query, ct)) : InvalidToken();
    [HttpGet("{examId:guid}/attempts/{attemptId:guid}")] public async Task<IActionResult> Attempt(Guid examId, Guid attemptId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetTeacherAttemptAsync(id, examId, attemptId, ct)) : InvalidToken();

    private IActionResult FromExam<T>(ExamResult<T> result, bool noContent = false) => result.Failure is null ? (noContent ? NoContent() : Ok(result.Value)) : result.Failure switch
    {
        ExamFailure.InsufficientBlueprint => Conflict(new { error = new { code = "insufficientblueprint", message = result.Detail, blueprint = result.Blueprint } }),
        ExamFailure.NotFound => NotFound(Error("not_found", "Exam resource was not found.")),
        ExamFailure.InvalidLifecycle or ExamFailure.AttemptExists or ExamFailure.AttemptCompleted or ExamFailure.AttemptExpired or ExamFailure.Conflict or ExamFailure.ResultUnavailable => Conflict(Error(result.Failure.Value.ToString().ToLowerInvariant(), result.Detail ?? "Exam lifecycle does not allow this operation.")),
        _ => BadRequest(Error(result.Failure.Value.ToString().ToLowerInvariant(), result.Detail ?? "Exam request is invalid."))
    };
}
