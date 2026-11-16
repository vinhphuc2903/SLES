# Phase 13B — GitHub Actions CI

## Workflows and required checks

| Workflow | Job / branch-protection check | Purpose | Timeout |
|---|---|---|---|
| `.github/workflows/backend-ci.yml` | `Backend CI` | .NET 10 Release restore/build, xUnit and real PostgreSQL integration tests | 20 min |
| `.github/workflows/frontend-ci.yml` | `Frontend CI` | Node 22, npm ci, lint, TypeScript + Vite build, Vitest | 15 min |
| `.github/workflows/e2e-ci.yml` | `E2E CI` | .NET 10 + Node 22 + Python 3.12, Chromium, 15 browser/API tests | 25 min |

All three use `ubuntu-latest` and run on pushes to `main`, pull requests targeting `main`, or manual dispatch. They do not use path filters, so branch-protection checks remain consistently available. Concurrency is scoped by workflow and PR/branch; newer runs cancel older ones. Jobs are independent; the E2E job builds the API but does not rerun xUnit or Vitest.

Every workflow has `contents: read`; checkout disables persisted credentials. No `pull_request_target`, package publishing, deployment permissions, production environment or repository secrets are used. Action releases are pinned to immutable Git commit SHAs, resolved from the official actions repositories. Update the SHA and its version comment together after reviewing release notes. The PostgreSQL 18 service image is pinned by digest.

Node setup caches npm downloads using `frontend/package-lock.json`; each job installs once with `npm ci`. No node_modules or test artifacts are cached. .NET restore is not cached with setup-dotnet because NuGet lockfiles are not currently tracked. The frontend build already runs `tsc -b`, so there is no redundant standalone typecheck. E2E Python scripts use only the standard library; no pip requirements are needed.

## Database and secrets

**GitHub repository secrets required: none.** Both database jobs receive a fresh PostgreSQL 18 service container and an automatically assigned host port. Initial trust authentication is only for bootstrapping that disposable service. `.github/scripts/prepare-postgres.py`:

1. Verifies PostgreSQL major version 18 in the job service container.
2. Generates a random CI-only password, masks it and the connection string in GitHub logs.
3. Creates `sles_ci` with LOGIN/CREATEDB, without SUPERUSER/CREATEROLE.
4. Replaces TCP trust with SCRAM password authentication and reloads PostgreSQL.
5. Exports connection settings via the runner's temporary `GITHUB_ENV` file.

The authenticated readiness command fails the job if the role cannot connect. Each backend integration test creates its own UUID database, applies the repository schema, seeds roles/users and drops the database in finally. The upgrade test applies the difficulty migration itself. Do not pre-initialize the service's `postgres` database with business tables: that would not exercise the tests' isolated schema setup. A TRX verifier requires both PostgreSQL tests to have passed, preventing silent skips.

The E2E runner creates its own `sles_e2e_<uuid>` database, applies schema + difficulty migration, generates its own bootstrap password/JWT signing key and starts temporary API/Vite processes. The API readiness check requires HTTP 401 at `/api/auth/me`; Vite requires HTTP 200. Tests never connect to an existing application database. Normal completion, failures and SIGINT/SIGTERM trigger process-group termination and database cleanup. GitHub also destroys service containers when the job ends; this is the final cleanup boundary for hard kills or runner failures.

| Variable | Source / purpose |
|---|---|
| `CI_POSTGRES_CONTAINER` | GitHub service ID; provisioning helper only |
| `PGPORT` | GitHub dynamically mapped service port |
| `PGHOST`, `PGUSER`, `PGPASSWORD` | CI provisioner; libpq/psql and E2E API connection |
| `PGCONNECT_TIMEOUT` | 10 seconds; avoid hanging connection attempts |
| `SLES_TEST_POSTGRES_ADMIN` | Generated connection string; role can create only disposable test databases, not superuser |
| `SLES_E2E_PGHOST`, `SLES_E2E_PGUSER` | E2E runner connection overrides |
| `SLES_E2E_DATABASE`, `SLES_E2E_API`, `SLES_E2E_URL`, `SLES_E2E_PASSWORD` | Runner-generated values; do not set manually in CI |
| `Jwt__SigningKey` | Generated in runner memory, passed only to API child environment |
| `CI` | Enables Playwright failure diagnostics |

No workflow reads staging `.env`, Docker secrets or the development database. Fork PR code has no privileged credentials beyond its disposable test service and read-only checkout token.

## Reports and troubleshooting

- Backend failures upload `test-results/backend/*.trx`. If the PostgreSQL check is missing/skipped, the explicit verifier fails the job.
- Frontend uploads `frontend/test-results/vitest.xml` when it exists, even after test failure.
- E2E failures upload `frontend/test-results/` and `frontend/playwright-report/`: JSON/HTML results, retained failure traces and screenshots. Video stays disabled. Server-error logs redact runner-generated bootstrap, database and signing-key values.
- Artifacts expire after **3 days**. Traces/screenshots can contain ephemeral test passwords, access tokens and synthetic student data. They never need production credentials; treat them as test diagnostics and do not reuse CI credentials anywhere. Local runs keep traces/screenshots off unless `CI` is explicitly set.
- If service startup fails, inspect the GitHub service health logs and image pull status. If provisioning fails, verify the PostgreSQL 18 image and service container ID; SQL error output is deliberately withheld to avoid echoing passwords.
- If npm ci fails, verify package.json/package-lock.json consistency and npm registry connectivity. Do not regenerate the lockfile just to bypass CI.
- If E2E cannot launch Chromium, check `npx playwright install --with-deps chromium` succeeded on the runner. Do not remove OS dependency installation.
- If E2E times out at readiness, inspect API startup/configuration and the assigned database port/password. Do not weaken readiness to accept arbitrary HTTP errors.
- For an actual failing UI test, download the artifact and use `npx playwright show-trace <trace.zip>` or `npx playwright show-report <report-directory>` locally. Avoid sharing trace contents publicly.

## Local verification

Run from the repository root, with .NET 10, Node 22, Python 3 and PostgreSQL client tools available. Use an isolated local test server/role, never a production connection. `SLES_TEST_POSTGRES_ADMIN` must be explicitly set to include integration tests; without it the local xUnit attribute skips those two tests, unlike CI where this is rejected.

```bash
dotnet restore SLES.slnx
dotnet build SLES.slnx -c Release --no-restore
# Set SLES_TEST_POSTGRES_ADMIN in your shell to the isolated test server first.
dotnet test SLES.slnx -c Release --no-build --no-restore \
  --logger 'trx;LogFileName=backend.trx' --results-directory test-results/backend
python3 .github/scripts/verify-backend-results.py

cd frontend
npm ci
npm run lint
npm run build
npm test -- --run --reporter=default --reporter=junit --outputFile=test-results/vitest.xml
npx playwright install chromium
# For TCP: set SLES_E2E_PGHOST, SLES_E2E_PGUSER, PGPORT and PGPASSWORD.
# Default local transport remains /tmp Unix socket + current OS user.
npm run test:e2e
```

From the repository root, `actionlint .github/workflows/*.yml` checks YAML and GitHub expression/structure rules. The CI provisioner is intentionally guarded to GitHub service containers; it is not a general database administration script.

## Verification boundary

Local checks are recorded in the task completion report. They can validate source, scripts, PostgreSQL service provisioning and test execution, but cannot prove GitHub-hosted action downloads, Ubuntu package installation, fork-PR permissions, artifact upload, cancellation behavior or branch-protection configuration. Confirm all three workflows on GitHub after an authorized push; do not treat local checks as a completed hosted Actions run. No push or hosted run is performed by this implementation task.

References: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [Playwright CI](https://playwright.dev/docs/ci).

## Local results — 2026-11-16

- `actionlint v1.7.12`: all three workflow YAML/structure/expression checks passed; all referenced Actions use 40-character SHA pins.
- Python compile checks and `git diff --check`: passed.
- .NET restore + Release build: passed, 0 warnings/errors.
- PostgreSQL 18 disposable Docker service: provisioning passed, correct generated password accepted, deliberately incorrect password rejected by SCRAM.
- Backend Release tests against that service: 115 passed, 0 skipped; TRX integration verifier passed. A negative check confirmed missing results are rejected.
- Frontend lint, TypeScript/production build and Vitest JUnit output: passed, 184 tests.
- CI-mode Chromium E2E using TCP/password authentication: all 15 passed. Temporary databases were absent afterward; the verification container/volume was removed.
- These tests ran on the local macOS host with a Linux PostgreSQL service container, not on GitHub-hosted Ubuntu. Actual hosted workflow execution and failure artifact uploads remain unverified.
