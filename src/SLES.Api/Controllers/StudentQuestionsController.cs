using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SLES.Application.QuestionBank;
using SLES.Domain.Constants;

namespace SLES.Api.Controllers;

[ApiController]
[Route("api/student/chapters")]
[Authorize(Roles = RoleCodes.Student)]
public sealed class StudentQuestionsController(IQuestionBankService questions) : SlesControllerBase
{
    [HttpGet("{chapterId:guid}/questions")]
    public async Task<IActionResult> GetPublishedQuestions(Guid chapterId, CancellationToken cancellationToken)
    {
        if (CurrentUserId() is not { } studentId) return InvalidToken();
        var result = await questions.GetStudentQuestionsAsync(studentId, chapterId, cancellationToken);
        return result.Failure is null ? Ok(result.Value) : NotFound(Error("chapternotfound", "Published chapter was not found."));
    }
}
