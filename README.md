# SLES — Smart Learning & Examination System

**A full-stack learning, practice, and examination management platform built with ASP.NET Core .NET 10, React, TypeScript, and PostgreSQL 18.**

SLES is a web-based educational platform designed to help teachers organize learning materials, manage question banks, create examinations, and evaluate student performance.

The system supports three user roles — **Administrator, Teacher, and Student** — with role-based access control, automated grading, exam scheduling, practice activities, and academic result tracking.

## Technology Stack

| Layer | Technologies |
|---|---|
| Backend | C#, ASP.NET Core Web API, .NET 10 |
| Architecture | Layered architecture: API, Application, Domain, Infrastructure |
| Database | PostgreSQL 18, Entity Framework Core |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Authentication | JWT Access Token, Refresh Token, HttpOnly Cookies |
| API Communication | RESTful API, Axios |
| State Management | TanStack Query, React Hooks |
| Forms & Validation | React Hook Form, Zod |
| Backend Testing | xUnit, PostgreSQL Integration Tests |
| Frontend Testing | Vitest |
| End-to-End Testing | Playwright, Chromium |
| DevOps | Docker, Docker Compose, Nginx, GitHub Actions |

## Key Features

### 1. Authentication & Authorization

- Secure login and logout.
- JWT access-token authentication.
- Refresh-token rotation and revocation.
- HttpOnly refresh-token cookies.
- Role-based access control (RBAC).
- Password change and account management.
- Protected frontend routes and session restoration.

The system supports three roles with separate permissions and interfaces.

### 2. Administrator Portal

Administrators manage the overall platform configuration.

**Teacher Management**
- Create and update teacher accounts.
- View and manage teacher information.
- Enable or disable teacher accounts.
- Reset teacher passwords.

**Subject Management**
- Create and update subjects.
- View available subjects.
- Manage subject activation status.

**Dashboard**
- View system-level statistics.
- Monitor teachers, students, and learning resources.

### 3. Teacher Portal

Teachers manage students, educational content, practice questions, and examinations.

**Student Management**
- Create and update student accounts.
- Manage students assigned to the teacher.
- Enable or disable student accounts.
- Reset student passwords.

**Chapter Management**
- Create and edit learning chapters.
- Manage chapter content.
- Publish or archive chapters.
- Organize content by subject and grade.

**Question Bank**
- Create and edit multiple-choice questions.
- Configure four answer choices with one correct answer.
- Manage question difficulty.
- Publish or archive questions.
- Import questions from Excel.
- Track question counts and chapter progress.

**Examination Management**
- Create and configure examinations.
- Set examination duration and availability periods.
- Publish and close examinations.
- Grant or revoke student examination permissions.
- View examination results and student attempts.
- Inspect individual student submissions.

### 4. Student Portal

Students access learning materials, practice questions, and assigned examinations.

**Learning**
- Browse available subjects and chapters.
- Read published educational content.
- Access published practice questions.

**Practice**
- Start practice sessions.
- Answer multiple-choice questions.
- Submit practice attempts.
- Review scores and answer results.
- View practice history.

**Examinations**
- View assigned examinations.
- Start an examination during its availability window.
- Answer questions within the configured time limit.
- Save answers during an attempt.
- Submit examinations.
- View scores and results after submission.
- Resume an active examination according to server-side attempt state.

### 5. Examination Engine

The examination engine enforces assessment rules on the server.

Key capabilities include:

- Randomized question selection.
- Question snapshots for individual attempts.
- Server-side answer validation and grading.
- Time-limited examinations.
- Automatic submission when the effective deadline is reached.
- Single-attempt examination rules.
- Student-specific examination permissions.
- Result history and attempt tracking.

For the configured examination format, a test contains **10 questions** selected according to the defined difficulty distribution.

### 6. Bulk Management

**Development status: In progress**

Bulk management is being extended to the following modules:

- Question Bank
- Student Management
- Teacher Management
- Chapter Management
- Examination Management

Planned capabilities include multi-row selection, confirmation dialogs, authorization checks, dependency validation, and record-level operation results.

Destructive operations must preserve protected academic records and existing lifecycle rules.

## System Architecture

SLES separates application responsibilities across four backend projects.

```text
SLES
│
├── src/
│   ├── SLES.Api/
│   │   ├── Controllers
│   │   ├── Authentication
│   │   └── Application configuration
│   │
│   ├── SLES.Application/
│   │   ├── Business services
│   │   ├── Application contracts
│   │   └── Use-case implementation
│   │
│   ├── SLES.Domain/
│   │   └── Domain entities and business models
│   │
│   └── SLES.Infrastructure/
│       ├── Database persistence
│       ├── Entity Framework Core
│       └── Infrastructure services
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── features/
│   │   ├── components/
│   │   └── shared/
│   └── e2e/
│
├── tests/
│   └── SLES.UnitTests/
│
├── database/
│   ├── Initial database schema
│   └── Database migrations
│
├── deploy/
│   ├── Dockerfiles
│   ├── Docker Compose
│   ├── Nginx
│   └── Deployment scripts
│
├── docs/
│   └── Technical documentation
│
└── .github/
    ├── workflows/
    └── scripts/
```

### Application Request Flow

```text
React Frontend
      |
      | HTTPS / REST API
      v
ASP.NET Core Web API
      |
      v
Application Services
      |
      v
Domain / Business Rules
      |
      v
Infrastructure / EF Core
      |
      v
PostgreSQL 18
```

Authentication and authorization are enforced by the backend. The frontend provides role-specific navigation and user interfaces.

## Security Design

SLES includes several security mechanisms:

- JWT-based API authentication.
- Short-lived access tokens.
- Refresh-token rotation and revocation.
- HttpOnly refresh-token cookies.
- Role-based endpoint authorization.
- Teacher ownership validation for protected resources.
- Server-side examination grading.
- Server-side examination deadlines.
- Isolated test databases.
- External staging secrets.

The application does not require production credentials to run its CI tests.

**Security note:** This project is under active development. Existing security controls and automated tests do not constitute a production security certification.

## Getting Started

### Prerequisites

Install the following tools:

| Tool | Version |
|---|---|
| .NET SDK | 10 |
| Node.js | 22 |
| PostgreSQL | 18 |
| Python | 3.x for test/deployment scripts |
| Git | Recent version |
| Docker | Optional for container-based deployment |

### 1. Clone the Repository

```bash
git clone https://github.com/vinhphuc2903/SLES.git
cd SLES
```

### 2. Configure PostgreSQL

Create an isolated development database and apply the schema provided in:

`database/SLES_Database_v1_2.sql`

Apply the required migrations for the current application version.

Configure the development connection string using local configuration, environment variables, or .NET user secrets.

Do not commit database credentials.

For detailed schema and test-database instructions, refer to the project documentation.

### 3. Run the Backend

Restore and build the solution:

```bash
dotnet restore SLES.slnx
dotnet build SLES.slnx -c Release
```

Start the API:

```bash
dotnet run --project src/SLES.Api
```

The local API URL depends on the active launch profile and environment configuration.

### 4. Run the Frontend

Open another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite starts the frontend development server. Check the terminal output for the local URL.

Ensure the frontend API configuration points to the running backend.

For additional setup details, see [Frontend Development Guide](frontend/README.md).

## API Modules

The backend provides REST endpoints organized around the following business domains.

| Module | Responsibilities |
|---|---|
| Authentication | Login, refresh, logout, profile, password change |
| User Management | Teacher and student account management |
| Subjects | Subject catalog and administration |
| Chapters | Learning content and publication lifecycle |
| Question Bank | Multiple-choice questions and difficulty management |
| Question Import | Excel-based question import |
| Practice | Practice attempts, answers, submission and history |
| Examination Management | Exam configuration, publication and permissions |
| Student Examinations | Start, save answers, submit and retrieve results |
| Reporting | Exam results and attempt details |

API access depends on the authenticated user's role and resource ownership.

See the implementation and technical documents in `docs/` for module-specific behavior.

## Testing

SLES includes automated tests across the backend, frontend and browser layers.

| Test Suite | Last Reported Passing Count | Framework |
|---|---:|---|
| Backend | 115 | xUnit |
| Frontend | 184 | Vitest |
| End-to-End | 15 | Playwright |

These are the previously verified baseline counts. The totals may increase as new features are added.

### Backend Tests

```bash
dotnet restore SLES.slnx
dotnet build SLES.slnx -c Release --no-restore
dotnet test SLES.slnx -c Release --no-build --no-restore
```

PostgreSQL integration tests require an isolated test server and the appropriate `SLES_TEST_POSTGRES_ADMIN` configuration. Without it, some integration tests may be skipped locally.

### Frontend Tests

```bash
cd frontend
npm ci
npm run lint
npm run build
npm test -- --run
```

### End-to-End Tests

Install Chromium:

```bash
cd frontend
npx playwright install chromium
```

Run the E2E suite:

```bash
npm run test:e2e
```

The E2E runner provisions an isolated database and starts the required application processes.

Follow [E2E Testing Guide](docs/E2ETesting12A.md) for environment requirements and database configuration.

## Continuous Integration

SLES uses GitHub Actions to validate changes on:

- Pushes to `main`
- Pull requests targeting `main`
- Manual workflow execution

| Workflow | Description |
|---|---|
| Backend CI | .NET 10 Release build and PostgreSQL integration tests |
| Frontend CI | Dependency installation, lint, TypeScript, Vite build and Vitest |
| E2E CI | PostgreSQL 18, API, React and Playwright Chromium tests |

[![Backend CI](https://github.com/vinhphuc2903/SLES/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/vinhphuc2903/SLES/actions/workflows/backend-ci.yml)

[![Frontend CI](https://github.com/vinhphuc2903/SLES/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/vinhphuc2903/SLES/actions/workflows/frontend-ci.yml)

[![E2E CI](https://github.com/vinhphuc2903/SLES/actions/workflows/e2e-ci.yml/badge.svg)](https://github.com/vinhphuc2903/SLES/actions/workflows/e2e-ci.yml)

Each workflow runs independently and uses disposable test infrastructure.

No GitHub repository secrets are required for the existing test workflows.

See [CI Documentation](docs/CI.md) for workflow details, troubleshooting and branch-protection configuration.

## Docker & Deployment

SLES includes staging deployment infrastructure based on Docker and Nginx.

The deployment directory contains:

- API Dockerfile.
- Frontend Dockerfile.
- Docker Compose staging configuration.
- Nginx reverse-proxy configuration.
- Environment setup scripts.
- Database backup and restore scripts.
- Staging verification scripts.

Deployment is designed to keep application secrets outside Docker images and source control.

```text
Client
  |
  v
Nginx Reverse Proxy
  |
  +---- React Frontend
  |
  +---- ASP.NET Core API
             |
             v
         PostgreSQL
```

**Deployment status:** Staging preparation and local verification are implemented. A successful public HTTPS deployment has not yet been established by the available project reports.

See [Staging Deployment Guide](docs/Deployment12B.md).

## Project Documentation

### Backend and Features

- [Authentication and User Management](docs/ChapterManagement.md)
- [Chapter Management](docs/ChapterManagement.md)
- [Question Bank](docs/QuestionBank.md)
- [Question Difficulty and Bulk Publishing](docs/QuestionDifficultyAndBulkPublish.md)
- [Excel Question Import](docs/QuestionExcelImport.md)
- [Practice Module](docs/Practice.md)
- [Examination Management](docs/ExamManagement.md)
- [Teacher Exam Permissions](docs/TeacherExamPermissionsFix.md)

### Frontend

- [Frontend Foundation](docs/FrontendFoundation.md)
- [Admin Dashboard](docs/AdminFrontend.md)
- [Teacher Frontend — Part A](docs/TeacherFrontend10A.md)
- [Teacher Frontend — Part B](docs/TeacherFrontend10B.md)
- [Student Frontend — Learning](docs/StudentFrontend11A.md)
- [Student Frontend — Examination](docs/StudentFrontend11B.md)

### Testing and Operations

- [E2E Endpoint Inventory](docs/E2EEndpointInventory12A.md)
- [E2E Testing](docs/E2ETesting12A.md)
- [GitHub Actions CI](docs/CI.md)
- [Staging Deployment](docs/Deployment12B.md)
- [Public Repository Preparation](docs/PublicRepositoryPreparation.md)

## Development Status

| Area | Status |
|---|---|
| Authentication & RBAC | Implemented |
| Admin Portal | Implemented |
| Teacher Portal | Implemented |
| Student Portal | Implemented |
| Question Bank & Excel Import | Implemented |
| Practice & Examination Engine | Implemented |
| Automated Testing | Implemented |
| GitHub Actions CI | Implemented; hosted verification ongoing |
| Bulk Delete Management | In progress |
| Docker Staging Infrastructure | Prepared and locally verified |
| GHCR Image Publishing | Planned |
| Automated Staging Deployment | Planned |

## Source History

The initial module-based Git commits were assembled from the current source on **16 November 2026** using actual commit timestamps.

They represent an organizational import rather than independently recovered historical development snapshots.

Only the final assembled source tree was validated as a complete application.

## License

No open-source license has been declared yet. Public repository visibility does not automatically grant permission to reuse or redistribute the source code.

## Bulk management

See [Bulk management rules, API, audit and tests](docs/BulkDeleteManagement.md) for batch question/chapter soft deletion, student/teacher deactivation and exam closing. Academic history is preserved.
