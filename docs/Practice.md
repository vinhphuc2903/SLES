# Practice Module

## Scope and tables

Practice uses the existing `practice_attempts`, `practice_answers`, `chapters`, `questions`, and `question_options` tables. It creates no tables, migrations, or schema changes.

## Endpoints

| Method | Endpoint |
|---|---|
| POST | `/api/student/chapters/{chapterId}/practice` |
| GET | `/api/student/practice/{attemptId}` |
| PUT | `/api/student/practice/{attemptId}/questions/{questionId}/answer` |
| POST | `/api/student/practice/{attemptId}/submit` |
| GET | `/api/student/practice/{attemptId}/result` |
| GET | `/api/student/practice/history` |
| GET | `/api/student/practice/history/{attemptId}` |

Only STUDENT JWTs can use these routes. The student ID is always taken from `sub`; request payloads cannot provide it.

## Access and start rules

A student can start only for a non-deleted, PUBLISHED chapter owned by the student's creating teacher and matching the student's grade. The server checks that the chapter has exactly 200 valid PUBLISHED questions (non-empty content, four non-empty options, exactly one correct option). Every start creates a separate attempt; retries are unlimited.

Subject and grade must also be active for new practice. Existing attempts/results remain accessible to their owner for continuation/history. GET attempt restores persisted selections; there is no separate resume endpoint.

At start, the service creates the attempt plus 200 `practice_answers` rows with null selections in one transaction. This fixes the exact question set without modifying Question Bank.

## Ordering limitation and compatible solution

Schema v1.2 has no practice question/option snapshot or order columns. Order is therefore derived deterministically from the persisted random attempt GUID plus question/option IDs using SHA-256. It is randomized per new attempt and remains stable on GET/result without changing Question Bank records. The initial answer rows retain membership even if a question is later archived.

## Answering and scoring

Answers can be changed or cleared (`selectedOptionId: null`) while an attempt is `IN_PROGRESS`. The server verifies both attempt ownership and option-to-question ownership. Correctness is never accepted from the client and is not returned before submission.

Submit computes correctness from database options atomically, then marks the attempt `SUBMITTED`. Result/review is available only after submission and includes the selected and correct options.

Result responses additionally include chapterId, chapterName, subjectName and startedAt. Metadata is resolved only after ownership and submitted-state checks, so results can be displayed even after the chapter is archived. No correctness is added to the pre-submission attempt DTO.

`practice_attempts.score` has an existing database CHECK range of `0..10`; it is stored as a 10-point grade:

`score = correctAnswers / 200 * 10`

The response also returns `correctAnswers`, `incorrectAnswers`, `unansweredQuestions`, and percentage (`correctAnswers / 200 * 100`), so no information is lost despite the schema score constraint.

## Historical protection

Question Bank blocks edits/deletion of questions referenced by practice answers. Practice itself never modifies Question Bank rows. Attempts and answers are retained for history and cannot be altered after submission.

Exam remains a separate future module. Practice never uses `exam_permissions` or exam attempt tables.
