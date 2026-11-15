using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.QuestionBank;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/teacher")]
[Authorize(Roles = RoleCodes.Teacher)]
public sealed class TeacherQuestionsController(IQuestionBankService questions) : SlesControllerBase
{
    [HttpPatch("questions/{id:guid}/difficulty")]
    public async Task<IActionResult> Classify(Guid id, ClassifyQuestionRequest request, CancellationToken ct) => CurrentUserId() is { } teacher ? FromQuestion(await questions.ClassifyAsync(teacher, id, request, ct)) : InvalidToken();
    [HttpPost("chapters/{chapterId:guid}/questions/bulk-publish")]
    public async Task<IActionResult> BulkPublish(Guid chapterId, BulkPublishRequest request, CancellationToken ct) => CurrentUserId() is { } teacher ? FromQuestion(await questions.BulkPublishAsync(teacher, chapterId, request, ct)) : InvalidToken();
    [HttpGet("chapters/{chapterId:guid}/questions/progress")]
    public async Task<IActionResult> Progress(Guid chapterId, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.ProgressAsync(teacherId, chapterId, cancellationToken)) : InvalidToken();

    [HttpPost("chapters/{chapterId:guid}/questions")]
    public async Task<IActionResult> Create(Guid chapterId, CreateQuestionRequest request, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.CreateAsync(teacherId, chapterId, request, cancellationToken)) : InvalidToken();

    [HttpGet("chapters/{chapterId:guid}/questions")]
    public async Task<IActionResult> List(Guid chapterId, [FromQuery] QuestionListQuery query, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.ListAsync(teacherId, chapterId, query, cancellationToken)) : InvalidToken();

    [HttpGet("questions/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.GetAsync(teacherId, id, cancellationToken)) : InvalidToken();

    [HttpPut("questions/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateQuestionRequest request, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.UpdateAsync(teacherId, id, request, cancellationToken)) : InvalidToken();

    [HttpPost("questions/{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.PublishAsync(teacherId, id, cancellationToken), noContentOnSuccess: true) : InvalidToken();

    [HttpPost("questions/{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.ArchiveAsync(teacherId, id, cancellationToken), noContentOnSuccess: true) : InvalidToken();

    [HttpDelete("questions/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromQuestion(await questions.DeleteAsync(teacherId, id, cancellationToken), noContentOnSuccess: true) : InvalidToken();

    private IActionResult FromQuestion<T>(QuestionResult<T> result, bool noContentOnSuccess = false) => result.Failure is null ? (noContentOnSuccess ? NoContent() : Ok(result.Value)) : MapQuestionFailure(result.Failure.Value, result.Detail);
    private IActionResult MapQuestionFailure(QuestionFailure failure, string? detail) => failure switch
    {
        QuestionFailure.NotFound => NotFound(Error("questionnotfound", "Question or chapter was not found.")),
        QuestionFailure.Forbidden => Forbid(),
        QuestionFailure.InvalidTransition or QuestionFailure.NotEditable or QuestionFailure.HasLearningHistory or QuestionFailure.Conflict => Conflict(Error(FailureCode(failure), detail ?? "The operation conflicts with question lifecycle or history.")),
        _ => BadRequest(Error(FailureCode(failure), detail ?? "Question validation failed."))
    };
    private static string FailureCode(QuestionFailure failure) => failure.ToString().ToLowerInvariant();
}
