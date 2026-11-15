# SLES

Smart Learning & Examination System: .NET 10 API, React/Vite frontend, PostgreSQL 18.

- [Frontend và local development](frontend/README.md)
- [Phase 12A — E2E coverage và kết quả](docs/E2ETesting12A.md)
- [Phase 12B — Staging deployment, HTTPS, backup/restore và rollback](docs/Deployment12B.md)

Deployment files: `deploy/`. Cấu hình local Development được giữ riêng; secrets staging được tạo ngoài image/source và không dùng database local `sles_db`.

## Repository layout

```text
src/          .NET 10 API, Application, Domain, Infrastructure
tests/        Backend unit and isolated PostgreSQL integration tests
frontend/     React/Vite application, component tests and Playwright E2E
database/     Original v1.2 schema and difficulty up/down migrations
deploy/       Dockerfiles, Compose, Nginx, setup/backup/verification scripts
docs/         Architecture, feature, testing and deployment documentation
```

Run commands from this repository root. No files from a parent specification directory are required.

```bash
dotnet restore SLES.slnx
dotnet build SLES.slnx --no-restore
dotnet test SLES.slnx --no-build --no-restore
cd frontend
npm ci
npm run build
npm run lint
npm test -- --run
```

For PostgreSQL integration and browser tests, follow [E2E setup](docs/E2ETesting12A.md). Use PostgreSQL 18 client tools on `PATH`; the staging verification script needs `psql` support for `\getenv`. Tests create isolated databases and require a local role allowed to create them. See [deployment setup](docs/Deployment12B.md) for external secret configuration; do not commit generated secrets.

## Source history

The module commits were assembled from the current source on 16 November 2026, with actual commit timestamps. They are an organizational import, not recovered historical snapshots. Shared API composition is introduced after backend modules; frontend routing is introduced after the dashboard and student modules. Only the final assembled tree is validated as a complete application.
