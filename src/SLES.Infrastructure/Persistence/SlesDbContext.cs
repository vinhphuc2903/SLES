
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using SLES.Domain.Entities;
using SLES.Domain.Enums;

namespace SLES.Infrastructure.Persistence;

public class SlesDbContext : DbContext
{
    public SlesDbContext(DbContextOptions<SlesDbContext> options)
        : base(options)
    {
    }

    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Grade> Grades => Set<Grade>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Chapter> Chapters => Set<Chapter>();
    public DbSet<ChapterContent> ChapterContents => Set<ChapterContent>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<QuestionOption> QuestionOptions => Set<QuestionOption>();
    public DbSet<PracticeAttempt> PracticeAttempts => Set<PracticeAttempt>();
    public DbSet<PracticeAnswer> PracticeAnswers => Set<PracticeAnswer>();
    public DbSet<Exam> Exams => Set<Exam>();
    public DbSet<ExamPermission> ExamPermissions => Set<ExamPermission>();
    public DbSet<ExamAttempt> ExamAttempts => Set<ExamAttempt>();
    public DbSet<ExamAttemptQuestion> ExamAttemptQuestions => Set<ExamAttemptQuestion>();
    public DbSet<ExamAttemptOption> ExamAttemptOptions => Set<ExamAttemptOption>();
    public DbSet<ExamAnswer> ExamAnswers => Set<ExamAnswer>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Role>(e => { e.ToTable("roles"); e.Property(x => x.Code).HasMaxLength(30); e.Property(x => x.Name).HasMaxLength(100); e.HasIndex(x => x.Code).IsUnique(); });
        modelBuilder.Entity<Grade>(e => { e.ToTable("grades"); e.Property(x => x.Code).HasMaxLength(20); e.Property(x => x.Name).HasMaxLength(50); e.HasIndex(x => x.Code).IsUnique(); });
        modelBuilder.Entity<Subject>(e => { e.ToTable("subjects"); e.Property(x => x.Code).HasMaxLength(50); e.Property(x => x.Name).HasMaxLength(255); e.HasIndex(x => x.Code).IsUnique(); });
        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("users"); e.Property(x => x.Username).HasMaxLength(100); e.Property(x => x.FullName).HasMaxLength(255); e.Property(x => x.Email).HasMaxLength(255); e.Property(x => x.Phone).HasMaxLength(30);
            e.HasIndex(x => x.Username).IsUnique(); e.HasIndex(x => new { x.Id, x.CreatedByTeacherId }).IsUnique();
            e.HasOne(x => x.Role).WithMany(x => x.Users).HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedByTeacher).WithMany(x => x.Students).HasForeignKey(x => x.CreatedByTeacherId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Grade).WithMany(x => x.Users).HasForeignKey(x => x.GradeId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<RefreshToken>(e => { e.ToTable("refresh_tokens"); e.Property(x => x.CreatedIp).HasColumnType("inet"); e.HasIndex(x => x.TokenHash).IsUnique(); e.HasOne(x => x.User).WithMany(x => x.RefreshTokens).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade); });
        modelBuilder.Entity<Chapter>(e =>
        {
            e.ToTable("chapters"); e.Property(x => x.Name).HasMaxLength(255); e.Property(x => x.Status).HasDatabaseEnumStorage(); e.HasIndex(x => new { x.Id, x.TeacherId }).IsUnique();
            e.HasOne(x => x.Teacher).WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.Grade).WithMany(x => x.Chapters).HasForeignKey(x => x.GradeId).OnDelete(DeleteBehavior.Restrict); e.HasOne(x => x.Subject).WithMany(x => x.Chapters).HasForeignKey(x => x.SubjectId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ChapterContent>(e => { e.ToTable("chapter_contents"); e.Property(x => x.ContentFormat).HasDatabaseEnumStorage(); e.HasIndex(x => x.ChapterId).IsUnique(); e.HasOne(x => x.Chapter).WithOne(x => x.Content).HasForeignKey<ChapterContent>(x => x.ChapterId).OnDelete(DeleteBehavior.Cascade); e.HasOne(x => x.UpdatedByUser).WithMany().HasForeignKey(x => x.UpdatedBy).OnDelete(DeleteBehavior.SetNull); });
        modelBuilder.Entity<Question>(e => { e.ToTable("questions"); e.Property(x => x.Difficulty).HasConversion<string>().HasMaxLength(32); e.Property(x => x.UpdatedAt).IsConcurrencyToken(); e.Property(x => x.Status).IsConcurrencyToken(); e.Property(x => x.Status).HasDatabaseEnumStorage(); e.HasIndex(x => new { x.Id, x.ChapterId }).IsUnique(); e.HasOne(x => x.Chapter).WithMany(x => x.Questions).HasForeignKey(x => x.ChapterId).OnDelete(DeleteBehavior.Restrict); });
        modelBuilder.Entity<QuestionOption>(e => { e.ToTable("question_options"); e.Property(x => x.Label).HasMaxLength(1).IsFixedLength(); e.HasIndex(x => new { x.QuestionId, x.Label }).IsUnique(); e.HasIndex(x => new { x.QuestionId, x.DisplayOrder }).IsUnique(); e.HasIndex(x => new { x.Id, x.QuestionId }).IsUnique(); e.HasOne(x => x.Question).WithMany(x => x.Options).HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Cascade); });
        modelBuilder.Entity<PracticeAttempt>(e => { e.ToTable("practice_attempts"); e.Property(x => x.Mode).HasDatabaseEnumStorage(); e.Property(x => x.Status).HasDatabaseEnumStorage(); e.Property(x => x.Score).HasPrecision(5, 2); e.HasMany(x => x.Answers).WithOne(x => x.PracticeAttempt).HasForeignKey(x => x.PracticeAttemptId).OnDelete(DeleteBehavior.Cascade); e.HasOne<Chapter>().WithMany().HasForeignKey(x => new { x.ChapterId, x.TeacherId }).HasPrincipalKey(x => new { x.Id, x.TeacherId }).OnDelete(DeleteBehavior.Restrict); });
        modelBuilder.Entity<PracticeAnswer>(e => { e.ToTable("practice_answers"); e.HasIndex(x => new { x.PracticeAttemptId, x.QuestionId }).IsUnique(); e.HasOne<Question>().WithMany().HasForeignKey(x => x.QuestionId).OnDelete(DeleteBehavior.Restrict); e.HasOne<QuestionOption>().WithMany().HasForeignKey(x => new { x.SelectedOptionId, x.QuestionId }).HasPrincipalKey(x => new { x.Id, x.QuestionId }).OnDelete(DeleteBehavior.Restrict); });
        modelBuilder.Entity<Exam>(e =>
        {
            e.ToTable("exams"); e.Property(x => x.Name).HasMaxLength(255); e.Property(x => x.Status).HasDatabaseEnumStorage(); e.HasIndex(x => new { x.Id, x.TeacherId }).IsUnique();
            e.HasOne<Chapter>().WithMany(x => x.Exams).HasForeignKey(x => new { x.ChapterId, x.TeacherId }).HasPrincipalKey(x => new { x.Id, x.TeacherId }).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<User>().WithMany().HasForeignKey(x => x.TeacherId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Permissions).WithOne(x => x.Exam).HasForeignKey(x => new { x.ExamId, x.TeacherId }).HasPrincipalKey(x => new { x.Id, x.TeacherId }).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Attempts).WithOne().HasForeignKey(x => new { x.ExamId, x.TeacherId }).HasPrincipalKey(x => new { x.Id, x.TeacherId }).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ExamPermission>(e => { e.ToTable("exam_permissions"); e.Property(x => x.Status).HasDatabaseEnumStorage(); e.HasIndex(x => new { x.ExamId, x.StudentId }).IsUnique(); e.HasOne<User>().WithMany().HasForeignKey(x => x.GrantedBy).OnDelete(DeleteBehavior.Restrict); });
        modelBuilder.Entity<ExamAttempt>(e => { e.ToTable("exam_attempts"); e.Property(x => x.Status).HasDatabaseEnumStorage(); e.Property(x => x.Score).HasPrecision(5, 2); e.HasIndex(x => new { x.ExamId, x.StudentId }).IsUnique(); e.HasIndex(x => new { x.Id, x.ExamId }).IsUnique(); e.HasMany(x => x.Questions).WithOne(x => x.ExamAttempt).HasForeignKey(x => x.ExamAttemptId).OnDelete(DeleteBehavior.Cascade); });
        modelBuilder.Entity<ExamAttemptQuestion>(e => { e.ToTable("exam_attempt_questions"); e.Property(x => x.QuestionSnapshot).HasColumnType("jsonb"); e.HasIndex(x => new { x.ExamAttemptId, x.SourceQuestionId }).IsUnique(); e.HasIndex(x => new { x.ExamAttemptId, x.DisplayOrder }).IsUnique(); e.HasIndex(x => new { x.Id, x.ExamAttemptId }).IsUnique(); e.HasOne<Question>().WithMany().HasForeignKey(x => x.SourceQuestionId).OnDelete(DeleteBehavior.Restrict); e.HasMany(x => x.Options).WithOne(x => x.ExamAttemptQuestion).HasForeignKey(x => x.ExamAttemptQuestionId).OnDelete(DeleteBehavior.Cascade); e.HasOne(x => x.Answer).WithOne(x => x.ExamAttemptQuestion).HasForeignKey<ExamAnswer>(x => x.ExamAttemptQuestionId).OnDelete(DeleteBehavior.Cascade); });
        modelBuilder.Entity<ExamAttemptOption>(e => { e.ToTable("exam_attempt_options"); e.Property(x => x.Label).HasMaxLength(1).IsFixedLength(); e.HasIndex(x => new { x.ExamAttemptQuestionId, x.Label }).IsUnique(); e.HasIndex(x => new { x.ExamAttemptQuestionId, x.DisplayOrder }).IsUnique(); e.HasIndex(x => new { x.Id, x.ExamAttemptQuestionId }).IsUnique(); });
        modelBuilder.Entity<ExamAnswer>(e => { e.ToTable("exam_answers"); e.HasOne<ExamAttemptOption>().WithMany().HasForeignKey(x => new { x.SelectedOptionId, x.ExamAttemptQuestionId }).HasPrincipalKey(x => new { x.Id, x.ExamAttemptQuestionId }).OnDelete(DeleteBehavior.Restrict); });
        modelBuilder.Entity<AuditLog>(e => { e.ToTable("audit_logs"); if (Database.IsNpgsql()) e.Property(x => x.IpAddress).HasConversion(v => v == null ? null : System.Net.IPAddress.Parse(v), v => v == null ? null : v.ToString()).HasColumnType("inet"); e.Property(x => x.Action).HasMaxLength(100); e.Property(x => x.EntityType).HasMaxLength(100); e.Property(x => x.OldValues).HasColumnType("jsonb"); e.Property(x => x.NewValues).HasColumnType("jsonb"); });

        // The existing PostgreSQL schema uses snake_case identifiers. Keeping this
        // convention here avoids repeating HasColumnName for every property.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }
        }
    }

    private static string ToSnakeCase(string value)
    {
        var result = new System.Text.StringBuilder(value.Length + 8);
        for (var index = 0; index < value.Length; index++)
        {
            var character = value[index];
            if (char.IsUpper(character) && index > 0)
            {
                result.Append('_');
            }

            result.Append(char.ToLowerInvariant(character));
        }

        return result.ToString();
    }
}

internal static class EnumPropertyBuilderExtensions
{
    private static string ToDatabaseCode<TEnum>(TEnum value) where TEnum : struct, Enum => System.Text.RegularExpressions.Regex.Replace(value.ToString(), "([a-z])([A-Z])", "$1_$2").ToUpperInvariant();
    private static TEnum FromDatabaseCode<TEnum>(string value) where TEnum : struct, Enum => Enum.TryParse<TEnum>(value, true, out var result) ? result : Enum.Parse<TEnum>(value.Replace("_", ""), true);
    public static PropertyBuilder<TEnum> HasDatabaseEnumStorage<TEnum>(this PropertyBuilder<TEnum> property) where TEnum : struct, Enum =>
        property.HasConversion(new ValueConverter<TEnum, string>(value => ToDatabaseCode(value), value => FromDatabaseCode<TEnum>(value)));
}
