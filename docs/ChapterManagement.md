# Chapter Management

## Overview

This module manages global subjects and teacher-owned learning chapters. A chapter has one grade, subject, teacher, and one Markdown-only content document.

## Endpoints

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/subjects` | Any authenticated user; active subjects only |
| GET | `/api/subjects/{id}` | Any authenticated user |
| GET | `/api/admin/subjects` | ADMIN; all statuses, optional search/isActive and pagination |
| GET | `/api/admin/subjects/{id}` | ADMIN; includes inactive subjects |
| GET | `/api/teacher/grades` | TEACHER; active grade lookup ordered by DisplayOrder/Id |
| GET | `/api/student/subjects` | STUDENT; active subjects with eligible published chapters, search/pagination and chapterCount |
| GET | `/api/student/subjects/{subjectId}` | STUDENT; same eligibility, otherwise 404 |
| POST | `/api/admin/subjects` | ADMIN |
| PUT | `/api/admin/subjects/{id}` | ADMIN |
| PATCH | `/api/admin/subjects/{id}/status` | ADMIN |
| GET | `/api/chapters` | ADMIN, TEACHER, STUDENT (scoped) |
| GET | `/api/chapters/{id}` | ADMIN, TEACHER, STUDENT (scoped) |
| POST | `/api/teacher/chapters` | Owning TEACHER |
| PUT | `/api/teacher/chapters/{id}/content` | Owning TEACHER, DRAFT only |
| POST | `/api/teacher/chapters/{id}/publish` | Owning TEACHER |
| POST | `/api/teacher/chapters/{id}/archive` | Owning TEACHER |
| DELETE | `/api/teacher/chapters/{id}` | Owning TEACHER, eligible DRAFT only |

## Ownership and access

- ADMIN reads all non-deleted chapters but cannot modify teacher-owned content or lifecycle.
- TEACHER sees and mutates only records where `chapter.teacher_id` equals the JWT subject.
- STUDENT sees only `PUBLISHED` chapters where the chapter teacher is `created_by_teacher_id` and the chapter grade equals the student's grade; subject and grade must be active. Unauthorized chapter IDs return `404`. Student subject lookup derives its scope from the same eligible published chapters; it does not expose the global subject catalog.

## Markdown

`chapter_contents.content` stores source Markdown unchanged, with `content_format = MARKDOWN`. Maximum request size is 200,000 characters. The API does not render Markdown or accept media. Frontend rendering must sanitize generated HTML and disable unsafe HTML/script execution.

## Lifecycle

- New chapters start as `DRAFT` with empty Markdown, version `1`.
- Content is editable only while DRAFT. Version increments only if text changes.
- DRAFT can be archived. Published chapters with exam/practice history cannot be archived.
- Only DRAFT chapters without questions, exams, or practice history can be soft-deleted.

## Publication dependency

`ChapterPublicationValidator` is implemented by the Question Bank integration. Publishing requires exactly 200 PUBLISHED, integrity-valid questions, non-empty Markdown, and active grade/subject. Validation and state change run in a serializable transaction on PostgreSQL. A failed question-count check returns `publicationvalidationpending` with the actual valid count; 199 and 201 both fail. See `QuestionBank.md` for question integrity rules.

## Example

```json
POST /api/teacher/chapters
{
  "gradeId": "GUID",
  "subjectId": "GUID",
  "name": "Chapter 1",
  "description": "Introduction",
  "displayOrder": 1
}
```

Failures use `{ "error": { "code": "...", "message": "..." } }`. Invalid data is `400`, unauthorized role is `403`, inaccessible resource is `404`, and invalid lifecycle/publication state is `409`.
