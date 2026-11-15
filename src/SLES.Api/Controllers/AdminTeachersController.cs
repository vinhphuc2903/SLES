using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.UserManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/admin/teachers")]
[Authorize(Roles = RoleCodes.Admin)]
public sealed class AdminTeachersController(IUserManagementService users) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<CreatedUserResponse>> Create(CreateTeacherRequest request, CancellationToken cancellationToken)
    {
        var actorId = GetActorId();
        if (actorId is null) return Unauthorized(Error("invalid_access_token", "Access token is invalid."));
        return ToActionResult(await users.CreateTeacherAsync(actorId.Value, request, cancellationToken));
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<ManagedUserResponse>>> List([FromQuery] UserListQuery query, CancellationToken cancellationToken) => ToActionResult(await users.ListTeachersAsync(query, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ManagedUserResponse>> Get(Guid id, CancellationToken cancellationToken) => ToActionResult(await users.GetTeacherAsync(id, cancellationToken));

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ManagedUserResponse>> Update(Guid id, UpdateUserProfileRequest request, CancellationToken cancellationToken) => ToActionResult(await users.UpdateTeacherAsync(id, request, cancellationToken));

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, ChangeUserStatusRequest request, CancellationToken cancellationToken)
    {
        var result = await users.SetTeacherStatusAsync(id, request, cancellationToken);
        return result.Failure is null ? NoContent() : Failure(result.Failure.Value);
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid id, CancellationToken cancellationToken)
    {
        var result = await users.ResetTeacherPasswordAsync(id, cancellationToken);
        return result.Failure is null ? Ok(new { temporaryPassword = result.Value }) : Failure(result.Failure.Value);
    }

    private ActionResult<T> ToActionResult<T>(UserManagementResult<T> result) => result.Failure is null ? new ActionResult<T>(result.Value!) : new ActionResult<T>((ActionResult)Failure(result.Failure.Value));
    private IActionResult Failure(UserManagementFailure failure) => failure switch
    {
        UserManagementFailure.NotFound => NotFound(Error("not_found", "The requested user was not found.")),
        UserManagementFailure.DuplicateUsername => Conflict(Error("duplicate_username", "Username is already in use.")),
        UserManagementFailure.Forbidden => Forbid(),
        _ => BadRequest(Error("invalid_request", "The request is invalid."))
    };
    private Guid? GetActorId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
    private static object Error(string code, string message) => new { error = new { code, message } };
}
