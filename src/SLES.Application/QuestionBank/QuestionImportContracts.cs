namespace SLES.Application.QuestionBank;

public sealed record ImportRow(int RowNumber, string QuestionText, string OptionA, string OptionB, string OptionC, string OptionD, string CorrectAnswer, string Difficulty, string? Explanation, IReadOnlyList<string> Errors);
public sealed record ImportPreview(string? Token, DateTimeOffset? ExpiresAt, int TotalRows, int ValidRows, int InvalidRows, IReadOnlyList<ImportRow> Rows);
public sealed record ImportConfirmation(string Token);
public sealed record ImportStatus(string State, int ImportedCount, string? Message);
public interface IQuestionImportService
{
    byte[] Template();
    Task<QuestionResult<ImportPreview>> PreviewAsync(Guid teacherId, Guid chapterId, string filename, Stream file, CancellationToken ct);
    Task<QuestionResult<ImportStatus>> ConfirmAsync(Guid teacherId, Guid chapterId, string token, CancellationToken ct);
    QuestionResult<ImportStatus> Status(Guid teacherId, Guid chapterId, string token);
}
