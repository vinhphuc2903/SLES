using System.Text.Json;
using SLES.Domain.Common;
using SLES.Domain.Enums;

namespace SLES.Domain.Entities;

public sealed class Role : Entity
{
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<User> Users { get; } = new List<User>();
}

public sealed class Grade : Entity
{
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public short DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public ICollection<User> Users { get; } = new List<User>();
    public ICollection<Chapter> Chapters { get; } = new List<Chapter>();
}

public sealed class Subject : Entity
{
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public ICollection<Chapter> Chapters { get; } = new List<Chapter>();
}

public sealed class User : Entity
{
    public Guid RoleId { get; set; }
    public Guid? CreatedByTeacherId { get; set; }
    public Guid? GradeId { get; set; }
    public string Username { get; set; } = null!;
    public string PasswordHash { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public bool IsActive { get; set; } = true;
    public bool MustChangePassword { get; set; } = true;
    public DateTimeOffset? LastLoginAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Role Role { get; set; } = null!;
    public User? CreatedByTeacher { get; set; }
    public Grade? Grade { get; set; }
    public ICollection<User> Students { get; } = new List<User>();
    public ICollection<RefreshToken> RefreshTokens { get; } = new List<RefreshToken>();
}

public sealed class RefreshToken : Entity
{
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = null!;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public System.Net.IPAddress? CreatedIp { get; set; }
    public string? UserAgent { get; set; }
    public User User { get; set; } = null!;
}

public sealed class Chapter : Entity
{
    public Guid TeacherId { get; set; }
    public Guid GradeId { get; set; }
    public Guid SubjectId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public int DisplayOrder { get; set; } = 1;
    public ChapterStatus Status { get; set; } = ChapterStatus.Draft;
    public DateTimeOffset? PublishedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public User Teacher { get; set; } = null!;
    public Grade Grade { get; set; } = null!;
    public Subject Subject { get; set; } = null!;
    public ChapterContent? Content { get; set; }
    public ICollection<Question> Questions { get; } = new List<Question>();
    public ICollection<Exam> Exams { get; } = new List<Exam>();
}

public sealed class ChapterContent : Entity
{
    public Guid ChapterId { get; set; }
    public string Content { get; set; } = string.Empty;
    public ContentFormat ContentFormat { get; set; } = ContentFormat.Html;
    public int Version { get; set; } = 1;
    public Guid? UpdatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Chapter Chapter { get; set; } = null!;
    public User? UpdatedByUser { get; set; }
}

public sealed class Question : Entity
{
    public Guid ChapterId { get; set; }
    public string Content { get; set; } = null!;
    public string? Explanation { get; set; }
    public QuestionDifficulty? Difficulty { get; set; }
    public string? ImageUrl { get; set; }
    public QuestionStatus Status { get; set; } = QuestionStatus.Draft;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Chapter Chapter { get; set; } = null!;
    public ICollection<QuestionOption> Options { get; } = new List<QuestionOption>();
}

public sealed class QuestionOption : Entity
{
    public Guid QuestionId { get; set; }
    public string Label { get; set; } = null!;
    public string Content { get; set; } = null!;
    public bool IsCorrect { get; set; }
    public short DisplayOrder { get; set; }
    public Question Question { get; set; } = null!;
}

public sealed class PracticeAttempt : Entity
{
    public Guid StudentId { get; set; }
    public Guid TeacherId { get; set; }
    public Guid ChapterId { get; set; }
    public PracticeMode Mode { get; set; }
    public PracticeAttemptStatus Status { get; set; } = PracticeAttemptStatus.InProgress;
    public int TotalQuestions { get; set; }
    public int CorrectCount { get; set; }
    public int WrongCount { get; set; }
    public decimal? Score { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<PracticeAnswer> Answers { get; } = new List<PracticeAnswer>();
}

public sealed class PracticeAnswer : Entity
{
    public Guid PracticeAttemptId { get; set; }
    public Guid QuestionId { get; set; }
    public Guid? SelectedOptionId { get; set; }
    public bool? IsCorrect { get; set; }
    public DateTimeOffset AnsweredAt { get; set; }
    public PracticeAttempt PracticeAttempt { get; set; } = null!;
}

public sealed class Exam : Entity
{
    public Guid TeacherId { get; set; }
    public Guid ChapterId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public short QuestionCount { get; set; } = 10;
    public int DurationMinutes { get; set; }
    public DateTimeOffset? StartAt { get; set; }
    public DateTimeOffset? EndAt { get; set; }
    public ExamStatus Status { get; set; } = ExamStatus.Draft;
    public DateTimeOffset? OpenedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public ICollection<ExamPermission> Permissions { get; } = new List<ExamPermission>();
    public ICollection<ExamAttempt> Attempts { get; } = new List<ExamAttempt>();
}

public sealed class ExamPermission : Entity
{
    public Guid ExamId { get; set; }
    public Guid TeacherId { get; set; }
    public Guid StudentId { get; set; }
    public Guid GrantedBy { get; set; }
    public PermissionStatus Status { get; set; } = PermissionStatus.Granted;
    public DateTimeOffset GrantedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public Exam Exam { get; set; } = null!;
}

public sealed class ExamAttempt : Entity
{
    public Guid ExamId { get; set; }
    public Guid StudentId { get; set; }
    public Guid TeacherId { get; set; }
    public ExamAttemptStatus Status { get; set; } = ExamAttemptStatus.InProgress;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public short TotalQuestions { get; set; } = 10;
    public short CorrectCount { get; set; }
    public short WrongCount { get; set; }
    public decimal? Score { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<ExamAttemptQuestion> Questions { get; } = new List<ExamAttemptQuestion>();
}

public sealed class ExamAttemptQuestion : Entity
{
    public Guid ExamAttemptId { get; set; }
    public Guid SourceQuestionId { get; set; }
    public JsonDocument QuestionSnapshot { get; set; } = null!;
    public short DisplayOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ExamAttempt ExamAttempt { get; set; } = null!;
    public ICollection<ExamAttemptOption> Options { get; } = new List<ExamAttemptOption>();
    public ExamAnswer? Answer { get; set; }
}

public sealed class ExamAttemptOption : Entity
{
    public Guid ExamAttemptQuestionId { get; set; }
    public Guid? SourceOptionId { get; set; }
    public string Label { get; set; } = null!;
    public string Content { get; set; } = null!;
    public bool IsCorrect { get; set; }
    public short DisplayOrder { get; set; }
    public ExamAttemptQuestion ExamAttemptQuestion { get; set; } = null!;
}

public sealed class ExamAnswer : Entity
{
    public Guid ExamAttemptQuestionId { get; set; }
    public Guid? SelectedOptionId { get; set; }
    public bool? IsCorrect { get; set; }
    public DateTimeOffset? AnsweredAt { get; set; }
    public ExamAttemptQuestion ExamAttemptQuestion { get; set; } = null!;
}

public sealed class AuditLog : Entity
{
    public Guid? UserId { get; set; }
    public string Action { get; set; } = null!;
    public string EntityType { get; set; } = null!;
    public Guid? EntityId { get; set; }
    public JsonDocument? OldValues { get; set; }
    public JsonDocument? NewValues { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
