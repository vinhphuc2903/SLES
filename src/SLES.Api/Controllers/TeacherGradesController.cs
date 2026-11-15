using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/teacher/grades")]
[Authorize(Roles = RoleCodes.Teacher)]
public sealed class TeacherGradesController(IGradeLookupService grades) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GradeLookupResponse>>> List(CancellationToken cancellationToken) =>
        Ok(await grades.ListActiveAsync(cancellationToken));
}
