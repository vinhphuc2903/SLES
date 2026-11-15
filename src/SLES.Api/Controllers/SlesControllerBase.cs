using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ChapterManagement;

namespace SLES.Api.Controllers;

public abstract class SlesControllerBase : ControllerBase
{
    protected ActionResult<T> From<T>(ChapterResult<T> result) => result.Failure is null ? new ActionResult<T>(result.Value!) : new ActionResult<T>((ActionResult)Failure(result.Failure.Value, result.Detail));
    protected IActionResult FromResult<T>(ChapterResult<T> result) => result.Failure is null ? Ok(result.Value) : Failure(result.Failure.Value, result.Detail);
    protected IActionResult From(ChapterResult<bool> result) => result.Failure is null ? NoContent() : Failure(result.Failure.Value, result.Detail);
    protected Guid? CurrentUserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
    protected string? CurrentRole() => User.FindFirstValue("role");
    protected IActionResult InvalidToken() => Unauthorized(new { error = new { code = "invalid_access_token", message = "Access token is invalid." } });
    protected IActionResult Failure(ChapterFailure failure, string? detail = null) => failure switch
    {
        ChapterFailure.NotFound => NotFound(Error("not_found", "The requested resource was not found.")),
        ChapterFailure.Forbidden => Forbid(),
        ChapterFailure.Conflict or ChapterFailure.InvalidTransition or ChapterFailure.PublicationValidationPending => Conflict(Error(FailureCode(failure), detail ?? "The requested operation conflicts with the current state.")),
        _ => BadRequest(Error(FailureCode(failure), detail ?? "The request is invalid."))
    };
    private static string FailureCode(ChapterFailure failure) => failure.ToString().ToLowerInvariant();
    protected static object Error(string code, string message) => new { error = new { code, message } };
}
