using Microsoft.EntityFrameworkCore;
using SLES.Application.ChapterManagement;
using SLES.Domain.Enums;
using SLES.Infrastructure.Persistence;

namespace SLES.Infrastructure.ChapterManagement;

public sealed class ChapterPublicationValidator(SlesDbContext dbContext) : IChapterPublicationValidator
{
    public async Task<PublicationValidationResult> ValidateAsync(Guid chapterId, CancellationToken cancellationToken)
    {
        var chapterExists = await dbContext.Chapters.AnyAsync(x => x.Id == chapterId && x.DeletedAt == null, cancellationToken);
        if (!chapterExists) return new PublicationValidationResult(false, "chapter_not_found", "Chapter does not exist.");
        var questions = await dbContext.Questions.AsNoTracking().Include(x => x.Options)
            .Where(x => x.ChapterId == chapterId && x.DeletedAt == null && x.Status == QuestionStatus.Published).ToListAsync(cancellationToken);
        var validCount = questions.Count(x => !string.IsNullOrWhiteSpace(x.Content) && x.Options.Count == 4 && x.Options.All(o => !string.IsNullOrWhiteSpace(o.Content)) && x.Options.Count(o => o.IsCorrect) == 1);
        return validCount == 200
            ? new PublicationValidationResult(true, "valid", "Chapter has exactly 200 valid published questions.")
            : new PublicationValidationResult(false, "chapter_must_have_exactly_200_published_questions", $"Chapter has {validCount} valid published questions; exactly 200 are required.");
    }
}
