# Phase 14A — Bulk management

Implemented on `feature/bulk-delete-management`. This feature adds batch operations without changing the database schema, deleting academic history, or introducing a new soft-delete model.

## Audit of existing behavior

| Module | Existing API | Existing semantics | Authorization | Relational constraints | Previous UI | Work added |
|---|---|---|---|---|---|---|
| Question Bank | `DELETE /api/teacher/questions/{id}`; archive action | Soft delete via `DeletedAt`, Draft only; archive is separate | Teacher owns question through chapter | Practice answers and exam question snapshots retain source-question references; options cascade only on physical deletion | Single delete/archive; bulk publication | Batch soft delete, shared current-page selection with publication, dependency errors |
| Students | Status update; no delete endpoint | Deactivate through `IsActive=false`; revoke refresh tokens | Teacher owns student through `CreatedByTeacherId` | Practice/exam attempts, grants, scores and sessions | Single status/reset-password | Batch deactivate, preserve student/history/grants, revoke sessions |
| Teachers | Admin status update; no delete endpoint | Deactivate; revoke refresh tokens | Admin only | Students, chapters, questions and exams must remain; account FKs protect ownership | Single status/reset-password | Batch deactivate without touching owned educational records |
| Chapters | `DELETE /api/teacher/chapters/{id}`; archive action | Draft-only soft delete; separate archive rules | Owning Teacher | Any question (including soft-deleted), exam or practice attempt blocks deletion; content remains linked | Single delete/archive | Batch soft delete, explicit state/dependency errors |
| Exams | `POST /api/teacher/exams/{id}/close`; no exam delete endpoint | Close lifecycle; no `DeletedAt` field | Owning Teacher | Permissions, attempts, snapshots and scores must remain; attempt FKs restrict physical deletion | Single close | Batch close using existing lifecycle; no physical Draft exam deletion introduced |

Audit sources: `SlesEntities.cs`, `SlesDbContext.cs`, the repository SQL schema including deferred snapshot-validation triggers, existing QuestionBank/ChapterManagement/UserManagement/ExamManagement services, controllers, query hooks and list tables. Database constraints are preserved; the new service never calls Remove/Delete or executes destructive SQL.

## Business decisions

- **Questions:** only Draft questions without practice-answer or exam-snapshot references can be soft-deleted. Published and Archived questions are blocked. Immutable exam snapshots do **not** justify deleting source questions. Existing options, practice answers and snapshots remain untouched.
- **Students:** use the existing deactivate action, regardless of learning history. Set inactive, revoke all unrevoked refresh tokens, keep identity, grants, scores and history. Existing authentication checks reject inactive users' access tokens as well.
- **Teachers:** Admin uses the same deactivate semantics. Do not deactivate/delete their students or alter their chapters/exams. Student/content visibility follows existing rules; this is not a cascading account-status policy change.
- **Chapters:** only Draft chapters with no questions, exams or practice attempts can be soft-deleted. Questions already soft-deleted still count, matching single-delete behavior. Content is not physically removed. Published/Archived chapters keep their existing separate single-record archive behavior; batch delete does not automatically archive them.
- **Exams:** accurately label the operation **Đóng bài thi đã chọn**. Draft, Scheduled and Active exams can be closed, matching the existing close service. Closed is an idempotent success; Cancelled is blocked. Closing prevents new starts using existing lifecycle checks; it does not delete grants, terminate or automatically grade existing attempts, or change submitted results. No speculative physical deletion of Draft exams was added.

No unresolved destructive business decision is needed for these safe operations. Physical account/exam deletion and automatic archive fallback remain out of scope.

## API contract and authorization

All operations use `POST` with one request, not one HTTP call per row:

| Route | Allowed role | Item scope | Action |
|---|---|---|---|
| `/api/teacher/questions/bulk-delete` | TEACHER | Owned question, non-deleted owned chapter | Soft delete |
| `/api/teacher/chapters/bulk-delete` | TEACHER | Owned chapter | Soft delete |
| `/api/teacher/students/bulk-deactivate` | TEACHER | Own STUDENT accounts | Deactivate |
| `/api/admin/teachers/bulk-deactivate` | ADMIN | TEACHER accounts | Deactivate |
| `/api/teacher/exams/bulk-close` | TEACHER | Owned exam | Close |

Controller role authorization and active, non-deleted actor/role validation in the service are both required. Wrong-role calls return 403 and unauthenticated calls return 401. Foreign records, missing records and wrong target account roles all produce the same `not_found` item response without exposing ownership/name/status.

```json
{
  "ids": [
    "81000000-0000-0000-0000-000000000001",
    "81000000-0000-0000-0000-000000000002"
  ]
}
```

The raw request must contain 1–100 entries. All entries must parse as nonempty UUIDs; null, malformed values and `Guid.Empty` reject the entire request with HTTP 400 `invalid_request`, before mutations. Duplicate valid UUIDs are deduplicated, preserving first-seen order. The maximum applies before deduplication to bound payload processing. Malformed JSON/type binding uses the existing ASP.NET validation response.

```json
{
  "requestedCount": 2,
  "successCount": 1,
  "failedCount": 1,
  "results": [
    { "id": "81000000-0000-0000-0000-000000000001", "success": true, "code": null, "message": null },
    { "id": "81000000-0000-0000-0000-000000000002", "success": false, "code": "has_dependencies", "message": "Bản ghi có dữ liệu liên quan cần được bảo toàn." }
  ]
}
```

Counts refer to unique IDs. `successCount` counts accepted operations, including an already-achieved target state; it is not a physical-row deletion count. Item codes:

- `not_found`: missing/outside caller's management scope.
- `invalid_transition`: non-Draft question/chapter, or Cancelled exam.
- `has_dependencies`: protected question/chapter references.

### Transactions, concurrency and retries

Valid requests return HTTP 200 with item outcomes, including mixed or all-blocked selections. Eligibility checks are evaluated in bulk queries. All eligible mutations and session revocations are committed together in a PostgreSQL **Serializable** transaction. Thus validation failures are partial outcomes, but database write failures never produce partial committed successes.

Concurrency/serialization/deadlock conflicts roll back the whole eligible subset and return HTTP 409 `conflict`; the client must refresh/review and explicitly retry. There is no automatic mutation retry. Other database errors abort the transaction through disposal and existing exception handling; they do not return invented per-item successes. Cancellation also disposes the transaction.

Replaying a delete on an owned tombstone is successful without changing its timestamps. Replaying deactivate/close preserves the target state; inactive-account sessions are still revoked if any exist. Nonexistent UUIDs stay `not_found`. This is state-idempotence, not a persisted request receipt: reactivating an account explicitly and then issuing deactivate again will deactivate it again.

Query counts are bounded by resource rather than batch length: one actor lookup plus one target lookup, with up to three set-based dependency lookups or one refresh-token lookup. EF generates parameterized SQL. No per-item HTTP calls or per-item database lookups are used.

## Frontend behavior

Updated screens: Teacher Question Bank chapter questions, Students, Chapters, Exams, and Admin Teachers. The Question Bank landing screen selects a chapter; record selection is on the chapter question list.

`features/bulk/BulkManagement.tsx` supplies the shared toolbar, accessible checkbox column, indeterminate header, confirmation, request lock and result display. Question publication and deletion share one set of current-page checkboxes; publication retains its existing explicit all-chapter mode and rules. **Bulk delete/deactivate/close never select all filtered pages.**

- Only eligible lifecycle rows are selectable; disabled rows expose a reason through their label/title. Dependency eligibility is checked by the server because list DTOs do not include all historical references.
- Display selected count; select all eligible rows on the current page or deselect. Selection resets on page/filter, actor or dataset changes. Confirmation closes when the selected dataset changes.
- Explicit confirmation states count/action/consequences. Controls are disabled and guarded against double submission while a request or invalidation is pending.
- On success, invalidate management/student TanStack Query data, which refreshes lists, progress/blueprint counters and dashboard totals. Pagination clamps to an available page after counts shrink.
- Clear selection after a completed batch. Keep a result summary listing each failed UUID, its locally known name and server reason, so failed records remain clearly identifiable after refresh. The last result can remain visible across pagination until the view is unmounted; it is scoped to actor and operation.
- HTTP failures retain selection for explicit retry and use existing localized API errors/session-expiry handling. Role-based action visibility supplements backend authorization.

## Test coverage

- `BulkManagementTests.cs`: five-resource parameterized validation/role and deduplication/mixed/replay tests; question lifecycle/history protection; chapter dependencies including tombstones; token revocation and academic-history preservation; close/cancelled/grant/result behavior.
- `BulkEndpointsTests.cs`: all five actual HTTP routes, unauthenticated and wrong-role access, correct-role contract, malformed/empty/zero UUID and oversized requests.
- `BulkManagementPostgresTests.cs`: real schema/migration, foreign ownership, mixed results, preserved practice/question/options and submitted exam snapshots/results/grants, deactivation/session revocation, repeat close, a simulated SQLSTATE 40001 conflict and complete rollback followed by successful retry. Fixture satisfies existing deferred triggers: exactly 10 snapshot questions and four options each in one seed transaction.
- `.github/scripts/verify-backend-results.py` now requires this third PostgreSQL integration test, so CI cannot silently skip it.
- `BulkManagement.test.tsx`: nine RTL tests covering row/current-page selection, indeterminate state, deselect, stale filter/page/dataset/actor changes, confirmation/cancel, full/partial success, query invalidation, HTTP errors, duplicate submit/loading, and forbidden-role visibility.
- E2E scenarios 16–20 exercise all five screens, confirmation cancellation, foreign ownership/403, blocked protected data, no hard deletion, token rejection after deactivation, and preservation of a separate teacher's students. They create dedicated fixtures rather than deleting records needed by the original 15 cases.
- Existing publication assertions remain intact. ESLint ignores generated Playwright report/test artifacts so failure diagnostics do not become lint input.

## Verification and limitations

Verified locally on 2026-11-17:

| Check | Result |
|---|---|
| .NET restore + Release build | Pass, 0 warnings/errors |
| Backend unit/API/PostgreSQL tests | **136 passed, 0 skipped** (21 added) |
| PostgreSQL integration gate | All 3 required integration tests passed |
| npm ci (lockfile) | Pass; audit reported 0 vulnerabilities |
| Frontend lint, TypeScript and production build | Pass |
| Vitest / RTL | **193 passed** across 13 files (9 added) |
| Chromium E2E in CI mode | **20 passed** (5 added); TCP/SCRAM PostgreSQL 18 |
| CI YAML/actionlint and diff whitespace | Pass |

E2E verified no remaining temporary test databases; the container and its volume were removed. The CI-mode tests ran on a macOS host with a Linux PostgreSQL container; no hosted GitHub run or deployment was performed.

 No production/staging/development database is migrated or reset; relational checks use temporary UUID databases inside a disposable PostgreSQL 18 container. No schema or Domain entity file changes are required.

Bulk requests are capped at 100 raw IDs; the UI selects only the current page. There is no cross-page selection, physical purge, new archive policy, or durable idempotency store. UI disablement is lifecycle-based; a concurrent change or historical dependency can still produce a server-side failure. Direct client/SQL writes outside these APIs remain outside the bulk transaction's control, but protected historical rows are never removed by this feature. Hosted GitHub Actions execution is not claimed by local tests.
