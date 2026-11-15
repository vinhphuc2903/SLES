using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SLES.Application.UserManagement;
using SLES.Domain.Constants;
using SLES.Domain.Entities;
using SLES.Infrastructure.Persistence;
using SLES.Infrastructure.UserManagement;

namespace SLES.UnitTests.UserManagement;

public sealed class UserManagementServiceTests
{
    [Fact]
    public async Task Admin_can_create_teacher_with_server_assigned_role_and_hashed_temporary_password()
    {
        await using var fixture = await Fixture.CreateAsync();

        var result = await fixture.Service.CreateTeacherAsync(fixture.Admin.Id, new CreateTeacherRequest("teacher-new", "New Teacher", "teacher@example.com", "0900"), CancellationToken.None);

        var created = Assert.IsType<CreatedUserResponse>(result.Value);
        var user = await fixture.Db.Users.SingleAsync(x => x.Id == created.User.Id);
        Assert.Equal(RoleCodes.Teacher, created.User.Role);
        Assert.Null(user.CreatedByTeacherId);
        Assert.Null(user.GradeId);
        Assert.True(user.MustChangePassword);
        Assert.NotEqual(created.TemporaryPassword, user.PasswordHash);
        Assert.NotEqual(PasswordVerificationResult.Failed, fixture.Hasher.VerifyHashedPassword(user, user.PasswordHash, created.TemporaryPassword));
    }

    [Fact]
    public async Task Only_admin_can_create_teacher_and_usernames_are_unique()
    {
        await using var fixture = await Fixture.CreateAsync();
        var request = new CreateTeacherRequest("unique-teacher", "Teacher", null, null);

        Assert.Equal(UserManagementFailure.Forbidden, (await fixture.Service.CreateTeacherAsync(fixture.TeacherA.Id, request, CancellationToken.None)).Failure);
        Assert.Equal(UserManagementFailure.Forbidden, (await fixture.Service.CreateTeacherAsync(fixture.StudentA.Id, request, CancellationToken.None)).Failure);
        Assert.NotNull((await fixture.Service.CreateTeacherAsync(fixture.Admin.Id, request, CancellationToken.None)).Value);
        Assert.Equal(UserManagementFailure.DuplicateUsername, (await fixture.Service.CreateTeacherAsync(fixture.Admin.Id, request, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Teacher_can_create_student_with_owning_teacher_and_student_role()
    {
        await using var fixture = await Fixture.CreateAsync();

        var result = await fixture.Service.CreateStudentAsync(fixture.TeacherA.Id, new CreateStudentRequest("student-new", "New Student", fixture.Grade.Id, null, null), CancellationToken.None);

        var created = Assert.IsType<CreatedUserResponse>(result.Value);
        var student = await fixture.Db.Users.SingleAsync(x => x.Id == created.User.Id);
        Assert.Equal(RoleCodes.Student, created.User.Role);
        Assert.Equal(fixture.TeacherA.Id, student.CreatedByTeacherId);
        Assert.Equal(fixture.Grade.Id, student.GradeId);
        Assert.NotEqual(created.TemporaryPassword, student.PasswordHash);
    }

    [Fact]
    public async Task Student_creation_rejects_invalid_grade()
    {
        await using var fixture = await Fixture.CreateAsync();

        var result = await fixture.Service.CreateStudentAsync(fixture.TeacherA.Id, new CreateStudentRequest("bad-grade", "Student", Guid.NewGuid(), null, null), CancellationToken.None);

        Assert.Equal(UserManagementFailure.InvalidGrade, result.Failure);
    }

    [Fact]
    public async Task Teacher_only_lists_and_reads_own_students()
    {
        await using var fixture = await Fixture.CreateAsync();
        var own = await fixture.Service.CreateStudentAsync(fixture.TeacherA.Id, new CreateStudentRequest("student-a", "Student A", fixture.Grade.Id, null, null), CancellationToken.None);
        var other = await fixture.Service.CreateStudentAsync(fixture.TeacherB.Id, new CreateStudentRequest("student-b", "Student B", fixture.Grade.Id, null, null), CancellationToken.None);

        var list = await fixture.Service.ListStudentsAsync(fixture.TeacherA.Id, new UserListQuery(), CancellationToken.None);
        var listedStudents = Assert.IsType<PagedResult<ManagedUserResponse>>(list.Value).Items;
        Assert.Contains(listedStudents, x => x.Id == own.Value!.User.Id);
        Assert.DoesNotContain(listedStudents, x => x.Id == other.Value!.User.Id);
        Assert.Equal(UserManagementFailure.NotFound, (await fixture.Service.GetStudentAsync(fixture.TeacherA.Id, other.Value!.User.Id, CancellationToken.None)).Failure);
    }

    [Fact]
    public async Task Teacher_cannot_update_or_reset_another_teachers_student()
    {
        await using var fixture = await Fixture.CreateAsync();
        var student = Assert.IsType<CreatedUserResponse>((await fixture.Service.CreateStudentAsync(fixture.TeacherB.Id, new CreateStudentRequest("student-other", "Other", fixture.Grade.Id, null, null), CancellationToken.None)).Value);

        var update = await fixture.Service.UpdateStudentAsync(fixture.TeacherA.Id, student.User.Id, new UpdateStudentProfileRequest("Changed", null, null, fixture.Grade.Id), CancellationToken.None);
        var reset = await fixture.Service.ResetStudentPasswordAsync(fixture.TeacherA.Id, student.User.Id, CancellationToken.None);

        Assert.Equal(UserManagementFailure.NotFound, update.Failure);
        Assert.Equal(UserManagementFailure.NotFound, reset.Failure);
    }

    [Fact]
    public async Task Password_reset_and_deactivation_revoke_refresh_tokens()
    {
        await using var fixture = await Fixture.CreateAsync();
        fixture.Db.RefreshTokens.Add(new RefreshToken { UserId = fixture.TeacherA.Id, TokenHash = "teacher-token", CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) });
        var student = Assert.IsType<CreatedUserResponse>((await fixture.Service.CreateStudentAsync(fixture.TeacherA.Id, new CreateStudentRequest("student-reset", "Student", fixture.Grade.Id, null, null), CancellationToken.None)).Value);
        fixture.Db.RefreshTokens.Add(new RefreshToken { UserId = student.User.Id, TokenHash = "student-token", CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddDays(1) });
        await fixture.Db.SaveChangesAsync(CancellationToken.None);

        var reset = await fixture.Service.ResetTeacherPasswordAsync(fixture.TeacherA.Id, CancellationToken.None);
        var deactivate = await fixture.Service.SetStudentStatusAsync(fixture.TeacherA.Id, student.User.Id, new ChangeUserStatusRequest(false), CancellationToken.None);

        Assert.NotNull(reset.Value);
        Assert.NotNull((await fixture.Db.RefreshTokens.SingleAsync(x => x.TokenHash == "teacher-token")).RevokedAt);
        Assert.True(deactivate.Value);
        Assert.NotNull((await fixture.Db.RefreshTokens.SingleAsync(x => x.TokenHash == "student-token")).RevokedAt);
    }

    private sealed class Fixture : IAsyncDisposable
    {
        private Fixture(AuthTestDbContext db, IPasswordHasher<User> hasher, UserManagementService service, User admin, User teacherA, User teacherB, User studentA, Grade grade)
        { Db = db; Hasher = hasher; Service = service; Admin = admin; TeacherA = teacherA; TeacherB = teacherB; StudentA = studentA; Grade = grade; }
        public AuthTestDbContext Db { get; }
        public IPasswordHasher<User> Hasher { get; }
        public UserManagementService Service { get; }
        public User Admin { get; }
        public User TeacherA { get; }
        public User TeacherB { get; }
        public User StudentA { get; }
        public Grade Grade { get; }

        public static async Task<Fixture> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<SlesDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
            var db = new AuthTestDbContext(options);
            var adminRole = new Role { Code = RoleCodes.Admin, Name = "Admin", CreatedAt = DateTimeOffset.UtcNow };
            var teacherRole = new Role { Code = RoleCodes.Teacher, Name = "Teacher", CreatedAt = DateTimeOffset.UtcNow };
            var studentRole = new Role { Code = RoleCodes.Student, Name = "Student", CreatedAt = DateTimeOffset.UtcNow };
            var grade = new Grade { Code = "GRADE_10", Name = "Grade 10", DisplayOrder = 1, IsActive = true };
            var admin = User(adminRole, "admin");
            var teacherA = User(teacherRole, "teacher-a");
            var teacherB = User(teacherRole, "teacher-b");
            var studentA = User(studentRole, "student-existing", teacherA.Id, grade.Id);
            db.AddRange(adminRole, teacherRole, studentRole, grade, admin, teacherA, teacherB, studentA);
            await db.SaveChangesAsync(CancellationToken.None);
            var hasher = new PasswordHasher<User>();
            return new Fixture(db, hasher, new UserManagementService(db, hasher), admin, teacherA, teacherB, studentA, grade);
        }

        private static User User(Role role, string username, Guid? ownerId = null, Guid? gradeId = null)
        {
            var user = new User { Role = role, RoleId = role.Id, Username = username, FullName = username, PasswordHash = "unused", CreatedByTeacherId = ownerId, GradeId = gradeId, IsActive = true, CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
            return user;
        }

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private sealed class AuthTestDbContext(DbContextOptions<SlesDbContext> options) : SlesDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            modelBuilder.Ignore<AuditLog>();
            modelBuilder.Entity<ExamAttemptQuestion>().Ignore(x => x.QuestionSnapshot);
        }
    }
}
