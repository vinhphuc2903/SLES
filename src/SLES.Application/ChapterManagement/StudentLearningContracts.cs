namespace SLES.Application.ChapterManagement;
public sealed record StudentSubjectResponse(Guid Id, string Name, string? Description, string GradeName, int ChapterCount);
public interface IStudentLearningService
{
    Task<ChapterResult<PagedResult<StudentSubjectResponse>>> ListSubjectsAsync(Guid studentId, SubjectListQuery query, CancellationToken ct);
    Task<ChapterResult<StudentSubjectResponse>> GetSubjectAsync(Guid studentId, Guid subjectId, CancellationToken ct);
}

