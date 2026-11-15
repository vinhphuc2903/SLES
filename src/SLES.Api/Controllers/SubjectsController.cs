using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ChapterManagement;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/subjects")]
[Authorize]
public sealed class SubjectsController(ISubjectManagementService subjects) : SlesControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<SubjectResponse>>> List([FromQuery] SubjectListQuery query, CancellationToken cancellationToken) => From(await subjects.ListActiveAsync(query, cancellationToken));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SubjectResponse>> Get(Guid id, CancellationToken cancellationToken) => From(await subjects.GetAsync(id, cancellationToken));
}
