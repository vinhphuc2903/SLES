using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ExamManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/student")]
[Authorize(Roles = RoleCodes.Student)]
public sealed class StudentExamsController(IExamManagementService exams) : SlesControllerBase
{
    [HttpGet("exams")] public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) => CurrentUserId() is { } id ? FromExam(await exams.ListStudentExamsAsync(id, page, pageSize, ct)) : InvalidToken();
    [HttpGet("exams/{examId:guid}")] public async Task<IActionResult> Detail(Guid examId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetStudentExamAsync(id, examId, ct)) : InvalidToken();
    [HttpGet("exams/history")] public async Task<IActionResult> History([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) => CurrentUserId() is { } id ? FromExam(await exams.GetStudentHistoryAsync(id, page, pageSize, ct)) : InvalidToken();
    [HttpGet("exams/available")] public async Task<IActionResult> Available([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) => CurrentUserId() is { } id ? FromExam(await exams.GetAvailableAsync(id, page, pageSize, ct)) : InvalidToken();
    [HttpPost("exams/{examId:guid}/start")] public async Task<IActionResult> Start(Guid examId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.StartAsync(id, examId, ct)) : InvalidToken();
    [HttpGet("exams/{examId:guid}/attempt")] public async Task<IActionResult> Current(Guid examId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetCurrentAttemptAsync(id, examId, ct)) : InvalidToken();
    [HttpGet("exam-attempts/{attemptId:guid}")] public async Task<IActionResult> Get(Guid attemptId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetAttemptAsync(id, attemptId, ct)) : InvalidToken();
    [HttpPut("exam-attempts/{attemptId:guid}/questions/{attemptQuestionId:guid}/answer")] public async Task<IActionResult> Save(Guid attemptId, Guid attemptQuestionId, SaveExamAnswerRequest request, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.SaveAnswerAsync(id, attemptId, attemptQuestionId, request, ct), true) : InvalidToken();
    [HttpPost("exam-attempts/{attemptId:guid}/submit")] public async Task<IActionResult> Submit(Guid attemptId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.SubmitAsync(id, attemptId, ct)) : InvalidToken();
    [HttpGet("exam-attempts/{attemptId:guid}/result")] public async Task<IActionResult> Result(Guid attemptId, CancellationToken ct) => CurrentUserId() is { } id ? FromExam(await exams.GetResultAsync(id, attemptId, ct)) : InvalidToken();

    private IActionResult FromExam<T>(ExamResult<T> result, bool noContent = false) => result.Failure is null ? (noContent ? NoContent() : Ok(result.Value)) : result.Failure switch
    {
        ExamFailure.InsufficientBlueprint => Conflict(new { error = new { code = "insufficientblueprint", message = result.Detail, blueprint = result.Blueprint } }),
        ExamFailure.NotFound => NotFound(Error("not_found", "Exam resource was not found.")),
        ExamFailure.InvalidLifecycle or ExamFailure.AttemptExists or ExamFailure.AttemptCompleted or ExamFailure.AttemptExpired or ExamFailure.Conflict or ExamFailure.ResultUnavailable => Conflict(Error(result.Failure.Value.ToString().ToLowerInvariant(), result.Detail ?? "Exam lifecycle does not allow this operation.")),
        _ => BadRequest(Error(result.Failure.Value.ToString().ToLowerInvariant(), result.Detail ?? "Exam request is invalid."))
    };
}
