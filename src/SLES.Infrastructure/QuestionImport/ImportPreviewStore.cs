using System.Security.Cryptography;
using SLES.Application.QuestionBank;

namespace SLES.Infrastructure.QuestionImport;

// Process-local and bounded. Tokens are never recreated after restart or on another instance.
public sealed class ImportPreviewStore(TimeProvider? clock = null)
{
    internal sealed class Entry(Guid teacher, Guid chapter, ImportRow[] rows, DateTimeOffset expiresAt)
    {
        public Guid Teacher { get; } = teacher;
        public Guid Chapter { get; } = chapter;
        public ImportRow[] Rows { get; set; } = rows;
        public DateTimeOffset ExpiresAt { get; } = expiresAt;
        public ImportStatus Status { get; set; } = new("Ready", 0, null);
    }
    private DateTimeOffset Now => (clock ?? TimeProvider.System).GetUtcNow();
    private readonly object gate = new();
    private readonly Dictionary<string, Entry> entries = new();
    internal (string Token, DateTimeOffset ExpiresAt)? Add(Guid teacher, Guid chapter, ImportRow[] rows)
    {
        lock (gate)
        {
            foreach (var key in entries.Where(x => x.Value.ExpiresAt < Now && x.Value.Status.State != "Processing").Select(x => x.Key).ToArray()) entries.Remove(key);
            if (entries.Count >= 32 || entries.Values.Count(x => x.Teacher == teacher) >= 3 || entries.Values.Sum(x => Size(x.Rows)) + Size(rows) > 8_000_000) return null;
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            var entry = new Entry(teacher, chapter, rows, Now.AddMinutes(15)); entries.Add(token, entry); return (token, entry.ExpiresAt);
        }
    }
    private static int Size(IEnumerable<ImportRow> rows) => rows.Sum(r => r.QuestionText.Length + r.OptionA.Length + r.OptionB.Length + r.OptionC.Length + r.OptionD.Length + (r.Explanation?.Length ?? 0));
    internal Entry? Find(Guid teacher, Guid chapter, string? token)
    {
        lock (gate) return token is not null && entries.TryGetValue(token, out var e) && e.Teacher == teacher && e.Chapter == chapter && (e.ExpiresAt > Now || e.Status.State == "Processing") ? e : null;
    }
    internal bool Begin(Entry e) { lock (e) { if (e.Status.State != "Ready") return false; e.Status = new("Processing", 0, null); return true; } }
    internal ImportStatus Read(Entry e) { lock (e) return e.Status; }
    internal void Finish(Entry e, ImportStatus status) { lock (e) { e.Status = status; e.Rows = []; } }
}
