# SLES Frontend

React + TypeScript frontend for SLES, built with Vite, Tailwind CSS, React Router, Axios, TanStack Query, React Hook Form, Zod, Lucide and Sonner.

## Local setup

Requirements: Node.js 20.19+ (Node 22 LTS recommended) and npm.

1. Start the API from the solution root:

   ```bash
   dotnet run --project src/SLES.Api --launch-profile http
   ```

   The development profile listens at `http://localhost:5169`.

2. In `SLES/frontend`, create local configuration and install dependencies:

   ```bash
   cp .env.example .env
   npm install
   npm run dev
   ```

3. Open the URL printed by Vite (normally `http://localhost:5173`). The Vite dev server proxies `/api/*` to `http://localhost:5169`, so the browser uses one origin and the development refresh cookie remains compatible.

If the API port changes, set `VITE_DEV_API_TARGET` in `.env`. For a deployed frontend, set `VITE_API_BASE_URL` to the public API base URL and coordinate same-site cookie/CORS configuration with the backend. Do not place secrets in `VITE_` variables.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run test -- --run
npm audit
```

## Authentication

The access token is held only in module memory. The refresh token is the backend's HttpOnly `sles_refresh_token` cookie and is never read by JavaScript. On startup the app calls `POST /api/auth/refresh`, then loads `GET /api/auth/me`. Concurrent expired-token responses share one refresh request and each original request is retried at most once. Logout clears the in-memory token and TanStack Query cache even if the network is unavailable.

The backend revokes all refresh tokens after a successful password change, so the app clears its access token and returns to login. Users with `mustChangePassword` are restricted to the change-password route.

Roles are read from the authenticated profile: `ADMIN`, `TEACHER`, `STUDENT`. Route guards improve navigation only; API authorization remains authoritative.

## Scope

The login, session, role routing, responsive shell, profile and password-change flows are implemented. Admin dashboard, teacher management and subject management use real API endpoints, with server pagination, validation, status confirmation and one-time temporary password display. Teacher dashboard, student management, chapter lifecycle, Markdown theory editing, question bank, exam management, permissions and historical results are implemented. Student dashboard, eligible subjects, theory reading, 200-question practice, answer persistence, results/review and history are implemented. Student exam discovery, start/resume, snapshot workspace, server-synchronized countdown, submission, results/review and history are implemented.

Admin subject management requires the backend additions `GET /api/admin/subjects` and `GET /api/admin/subjects/{id}` included in this workspace. See [Admin frontend documentation](../docs/AdminFrontend.md) for contracts, security behavior, tests and integration limitations.

Teacher forms require `GET /api/teacher/grades` included in this workspace. The Markdown editor uses react-markdown/remark-gfm with raw HTML disabled, plus navigation/unload warnings for unsaved changes. See [Teacher frontend documentation](../docs/TeacherFrontend10A.md) for contracts, publication rules, tests and live-integration limitations.

Question progress uses `GET /api/teacher/chapters/{chapterId}/questions/progress`. Teacher attempt review includes additive student identity/start-time fields from the updated backend. See [Teacher 10B documentation](../docs/TeacherFrontend10B.md) for question/exam contracts, permissions, snapshot review, tests and limitations.

Student learning requires the student-scoped `/api/student/subjects` endpoints and practice result metadata included in this backend. Restart a running API after rebuilding to load new endpoints. See [Student 11A documentation](../docs/StudentFrontend11A.md) for serialized answer saves, submission recovery, history, tests and integration limitations.

Student exams require the new scoped list/detail/history endpoints and `serverNow` attempt field. Restart the local API after rebuilding. See [Student Exam 11B documentation](../docs/StudentFrontend11B.md) for timer synchronization, timeout recovery, snapshot review, contracts and verification limits.

Teacher Question Bank supports Excel template download, bounded server preview, row validation and atomic Draft import with token-based confirmation/status recovery. See [Excel import documentation](../docs/QuestionExcelImport.md) for limits, APIs and process-local idempotency constraints.

### Question Difficulty, Bulk Publish và Exam Blueprint

Ngân hàng câu hỏi hỗ trợ bốn mức độ, lọc/thống kê từ backend, phân loại câu cũ và xuất bản hàng loạt (chọn trên trang hoặc tất cả Draft hợp lệ trong chương). Mẫu Excel mới gồm tám cột với Difficulty bắt buộc. Teacher Exam hiển thị ma trận 3/3/2/2 và số lượng khả dụng. Triển khai backend cần chạy migration trước khi khởi động API mới; xem [hướng dẫn](../docs/QuestionDifficultyAndBulkPublish.md).

### Browser E2E — Phase 12A

`npm run test:e2e` tạo database PostgreSQL `sles_e2e_<UUID>`, chạy API/frontend riêng và Chromium, rồi dọn đúng các tài nguyên đó. Không sử dụng hoặc reset `sles_db`. Yêu cầu PostgreSQL local với quyền CREATEDB, Python 3, psql/createdb/dropdb, .NET 10 đã restore và `npx playwright install chromium --only-shell`. Mật khẩu/JWT test sinh lúc chạy; không lưu auth state, trace, screenshot hoặc video.

Suite gồm luồng browser thật và API edge cases; không đưa E2E vào Vitest. Kết quả JSON ở `test-results/e2e-results.json` (gitignored). Xem [E2ETesting12A](../docs/E2ETesting12A.md) để biết coverage, lỗi đã sửa và giới hạn.

### Staging deployment

Xem [Deployment12B](../docs/Deployment12B.md) cho Docker Compose, Nginx/HTTPS, secrets và backup/restore. Frontend production dùng API cùng origin; không truyền JWT hoặc secrets qua VITE_* build variables.
