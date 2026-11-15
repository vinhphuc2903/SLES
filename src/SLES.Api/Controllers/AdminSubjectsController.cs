using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/admin/subjects")]
[Authorize(Roles = RoleCodes.Admin)]
public sealed class AdminSubjectsController(ISubjectManagementService subjects) : SlesControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<SubjectResponse>>> List([FromQuery] AdminSubjectListQuery query, CancellationToken cancellationToken) => From(await subjects.ListForAdminAsync(query, cancellationToken));
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SubjectResponse>> Get(Guid id, CancellationToken cancellationToken) => From(await subjects.GetAsync(id, cancellationToken));
    [HttpPost]
    public async Task<ActionResult<SubjectResponse>> Create(CreateSubjectRequest request, CancellationToken cancellationToken) => From(await subjects.CreateAsync(request, cancellationToken));
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<SubjectResponse>> Update(Guid id, UpdateSubjectRequest request, CancellationToken cancellationToken) => From(await subjects.UpdateAsync(id, request, cancellationToken));
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, ChangeSubjectStatusRequest request, CancellationToken cancellationToken) => From(await subjects.SetStatusAsync(id, request, cancellationToken));
}
