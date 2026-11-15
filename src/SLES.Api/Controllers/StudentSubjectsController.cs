using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;
namespace SLES.Api.Controllers;
[ApiController]
[Route("api/student/subjects")]
[Authorize(Roles = RoleCodes.Student)]
public sealed class StudentSubjectsController(IStudentLearningService learning) : SlesControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] SubjectListQuery query, CancellationToken ct) =>
        CurrentUserId() is { } id ? FromResult(await learning.ListSubjectsAsync(id, query, ct)) : InvalidToken();
    [HttpGet("{subjectId:guid}")]
    public async Task<IActionResult> Get(Guid subjectId, CancellationToken ct) =>
        CurrentUserId() is { } id ? FromResult(await learning.GetSubjectAsync(id, subjectId, ct)) : InvalidToken();
}

