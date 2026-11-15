using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/chapters")]
[Authorize(Roles = RoleCodes.Admin + "," + RoleCodes.Teacher + "," + RoleCodes.Student)]
public sealed class ChaptersController(IChapterManagementService chapters) : SlesControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] ChapterListQuery query, CancellationToken cancellationToken)
    {
        if (CurrentUserId() is not { } userId || CurrentRole() is not { } role) return InvalidToken();
        return FromResult(await chapters.ListAsync(new ChapterActor(userId, role), query, cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        if (CurrentUserId() is not { } userId || CurrentRole() is not { } role) return InvalidToken();
        return FromResult(await chapters.GetAsync(new ChapterActor(userId, role), id, cancellationToken));
    }
}
