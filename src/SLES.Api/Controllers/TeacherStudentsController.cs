using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.UserManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/teacher/students")]
[Authorize(Roles = RoleCodes.Teacher)]
public sealed class TeacherStudentsController(IUserManagementService users) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<CreatedUserResponse>> Create(CreateStudentRequest request, CancellationToken cancellationToken) =>
        GetActorId() is { } teacherId ? ToActionResult(await users.CreateStudentAsync(teacherId, request, cancellationToken)) : Unauthorized(Error("invalid_access_token", "Access token is invalid."));

    [HttpGet]
    public async Task<ActionResult<PagedResult<ManagedUserResponse>>> List([FromQuery] UserListQuery query, CancellationToken cancellationToken) =>
        GetActorId() is { } teacherId ? ToActionResult(await users.ListStudentsAsync(teacherId, query, cancellationToken)) : Unauthorized(Error("invalid_access_token", "Access token is invalid."));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ManagedUserResponse>> Get(Guid id, CancellationToken cancellationToken) =>
        GetActorId() is { } teacherId ? ToActionResult(await users.GetStudentAsync(teacherId, id, cancellationToken)) : Unauthorized(Error("invalid_access_token", "Access token is invalid."));

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ManagedUserResponse>> Update(Guid id, UpdateStudentProfileRequest request, CancellationToken cancellationToken) =>
        GetActorId() is { } teacherId ? ToActionResult(await users.UpdateStudentAsync(teacherId, id, request, cancellationToken)) : Unauthorized(Error("invalid_access_token", "Access token is invalid."));

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, ChangeUserStatusRequest request, CancellationToken cancellationToken)
    {
        if (GetActorId() is not { } teacherId) return Unauthorized(Error("invalid_access_token", "Access token is invalid."));
        var result = await users.SetStudentStatusAsync(teacherId, id, request, cancellationToken);
        return result.Failure is null ? NoContent() : Failure(result.Failure.Value);
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, CancellationToken cancellationToken)
    {
        if (GetActorId() is not { } teacherId) return Unauthorized(Error("invalid_access_token", "Access token is invalid."));
        var result = await users.ResetStudentPasswordAsync(teacherId, id, cancellationToken);
        return result.Failure is null ? Ok(new { temporaryPassword = result.Value }) : Failure(result.Failure.Value);
    }

    private ActionResult<T> ToActionResult<T>(UserManagementResult<T> result) => result.Failure is null ? new ActionResult<T>(result.Value!) : new ActionResult<T>((ActionResult)Failure(result.Failure.Value));
    private IActionResult Failure(UserManagementFailure failure) => failure switch
    {
        UserManagementFailure.NotFound => NotFound(Error("not_found", "The requested student was not found.")),
        UserManagementFailure.DuplicateUsername => Conflict(Error("duplicate_username", "Username is already in use.")),
        UserManagementFailure.Forbidden => Forbid(),
        _ => BadRequest(Error("invalid_request", "The request is invalid."))
    };
    private Guid? GetActorId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
    private static object Error(string code, string message) => new { error = new { code, message } };
}
