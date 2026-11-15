using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.Practice;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/student")]
[Authorize(Roles = RoleCodes.Student)]
public sealed class StudentPracticeController(IPracticeService practice) : SlesControllerBase
{
    [HttpPost("chapters/{chapterId:guid}/practice")]
    public async Task<IActionResult> Start(Guid chapterId, CancellationToken cancellationToken) =>
        CurrentUserId() is { } studentId ? FromPractice(await practice.StartAsync(studentId, chapterId, cancellationToken)) : InvalidToken();

    [HttpGet("practice/{attemptId:guid}")]
    public async Task<IActionResult> GetAttempt(Guid attemptId, CancellationToken cancellationToken) =>
        CurrentUserId() is { } studentId ? FromPractice(await practice.GetAttemptAsync(studentId, attemptId, cancellationToken)) : InvalidToken();

    [HttpPut("practice/{attemptId:guid}/questions/{questionId:guid}/answer")]
    public async Task<IActionResult> SaveAnswer(Guid attemptId, Guid questionId, SavePracticeAnswerRequest request, CancellationToken cancellationToken) =>
        CurrentUserId() is { } studentId ? FromPractice(await practice.SaveAnswerAsync(studentId, attemptId, questionId, request, cancellationToken), noContentOnSuccess: true) : InvalidToken();

    [HttpPost("practice/{attemptId:guid}/submit")]
    public async Task<IActionResult> Submit(Guid attemptId, CancellationToken cancellationToken) =>
        CurrentUserId() is { } studentId ? FromPractice(await practice.SubmitAsync(studentId, attemptId, cancellationToken)) : InvalidToken();

    [HttpGet("practice/{attemptId:guid}/result")]
    public async Task<IActionResult> Result(Guid attemptId, CancellationToken cancellationToken) =>
        CurrentUserId() is { } studentId ? FromPractice(await practice.GetResultAsync(studentId, attemptId, cancellationToken)) : InvalidToken();

    [HttpGet("practice/history")]
    public async Task<IActionResult> History([FromQuery] PracticeHistoryQuery query, CancellationToken cancellationToken) =>
        CurrentUserId() is { } studentId ? FromPractice(await practice.GetHistoryAsync(studentId, query, cancellationToken)) : InvalidToken();

    [HttpGet("practice/history/{attemptId:guid}")]
    public async Task<IActionResult> HistoryDetail(Guid attemptId, CancellationToken cancellationToken) =>
        CurrentUserId() is { } studentId ? FromPractice(await practice.GetResultAsync(studentId, attemptId, cancellationToken)) : InvalidToken();

    private IActionResult FromPractice<T>(PracticeResult<T> result, bool noContentOnSuccess = false) => result.Failure is null ? (noContentOnSuccess ? NoContent() : Ok(result.Value)) : MapFailure(result.Failure.Value, result.Detail);
    private IActionResult MapFailure(PracticeFailure failure, string? detail) => failure switch
    {
        PracticeFailure.NotFound => NotFound(Error("not_found", "Practice resource was not found.")),
        PracticeFailure.AttemptSubmitted or PracticeFailure.Conflict or PracticeFailure.ResultUnavailable => Conflict(Error(failure.ToString().ToLowerInvariant(), detail ?? "Practice lifecycle does not allow this operation.")),
        _ => BadRequest(Error(failure.ToString().ToLowerInvariant(), detail ?? "Practice request is invalid."))
    };
}
