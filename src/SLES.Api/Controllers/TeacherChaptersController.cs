using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.ChapterManagement;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/teacher/chapters")]
[Authorize(Roles = RoleCodes.Teacher)]
public sealed class TeacherChaptersController(IChapterManagementService chapters) : SlesControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create(CreateChapterRequest request, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromResult(await chapters.CreateAsync(teacherId, request, cancellationToken)) : InvalidToken();

    [HttpPut("{id:guid}/content")]
    public async Task<IActionResult> UpdateContent(Guid id, UpdateChapterContentRequest request, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? FromResult(await chapters.UpdateContentAsync(teacherId, id, request, cancellationToken)) : InvalidToken();

    [HttpPost("{id:guid}/publish")]
    public async Task<IActionResult> Publish(Guid id, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? From(await chapters.PublishAsync(teacherId, id, cancellationToken)) : InvalidToken();

    [HttpPost("{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? From(await chapters.ArchiveAsync(teacherId, id, cancellationToken)) : InvalidToken();

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken) =>
        CurrentUserId() is { } teacherId ? From(await chapters.DeleteAsync(teacherId, id, cancellationToken)) : InvalidToken();
}
