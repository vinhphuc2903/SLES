# Question Bank

## Scope and storage

Question Bank uses existing `questions` and `question_options` tables. No schema or migration was added. Each question is owned indirectly through its chapter's `teacher_id`; each option belongs to one question.

## Teacher endpoints

| Method | Endpoint |
|---|---|
| POST | `/api/teacher/chapters/{chapterId}/questions` |
| GET | `/api/teacher/chapters/{chapterId}/questions` |
| GET | `/api/teacher/chapters/{chapterId}/questions/progress` |
| GET | `/api/teacher/questions/{id}` |
| PUT | `/api/teacher/questions/{id}` |
| POST | `/api/teacher/questions/{id}/publish` |
| POST | `/api/teacher/questions/{id}/archive` |
| DELETE | `/api/teacher/questions/{id}` |

Only the owning TEACHER can use these endpoints. Records outside teacher scope return `404`.

Progress returns `{ draft, published, archived, validPublished }`, excluding soft-deleted questions. Valid published questions must satisfy the same four-option/one-correct-answer integrity rules as publication. Counts are teacher-authorized and do not themselves guarantee that a chapter meets content/grade/subject/lifecycle requirements.

## Student read endpoint

`GET /api/student/chapters/{chapterId}/questions` returns only PUBLISHED questions from a PUBLISHED chapter owned by the student's teacher and matching the student's grade. Its option DTO intentionally has no `isCorrect` field.

## Validation and lifecycle

Create/update requires non-empty question text, exactly four non-empty options, and exactly one correct option. Labels A–D and display order 1–4 are assigned by the server.

- New questions are `DRAFT`.
- Only DRAFT questions can be edited or published.
- DRAFT/PUBLISHED questions can be archived; ARCHIVED cannot transition again.
- Only DRAFT questions without practice-answer or exam-attempt-question history can be soft-deleted.
- Option replacement is performed in a PostgreSQL transaction and is blocked when historical references exist.

Example create body:

```json
{
  "content": "Which statement is correct?",
  "options": [
    { "content": "A", "isCorrect": true },
    { "content": "B", "isCorrect": false },
    { "content": "C", "isCorrect": false },
    { "content": "D", "isCorrect": false }
  ]
}
```

## Chapter publication

`ChapterPublicationValidator` now counts valid PUBLISHED questions at query time. It permits Chapter publication only when the count is **exactly 200**; 199 and 201 both fail. A valid question must have non-empty content, exactly four non-empty options, and exactly one correct option. Chapter publish uses a serializable PostgreSQL transaction around validation and state change.

## Error behavior

Question validation errors are `400`; invalid lifecycle/history operations are `409`; unauthorized roles are `403`; resources outside ownership scope are `404`. Error bodies use `{ "error": { "code": "...", "message": "..." } }`.

Practice and Exam attempt creation/snapshots remain separate modules. Question Bank only preserves their history by blocking destructive updates/deletes when references exist.

## Excel import

Teacher chapter question banks support XLSX preview/confirm and authenticated template download. Import reuses question validation, stores Explanation, creates all questions as Draft in one relational transaction, and does not change publication rules. Preview tokens are bounded, owned, expiring and protected against duplicate/concurrent confirmation in the API process. See [QuestionExcelImport](QuestionExcelImport.md) for contracts, security restrictions and restart/multi-instance limitations.
