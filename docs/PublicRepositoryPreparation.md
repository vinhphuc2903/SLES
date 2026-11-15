# Public repository preparation — 2026-11-16

## Scope and provenance

The user authorized replacing the single initial commit with an organizational import on `rebuild-main`, then renaming it to `main`. No backup branch, remote, GitHub repository, deployment or push was created. Actual commit times are used. These are module groupings of the current source, not recovered development milestones. Old objects may remain locally in reflogs until normal Git expiry; no objects were deleted.

Preflight verified one original commit (`96afaab`) and no remote. Portability changes left by an interrupted task were temporarily stashed, a clean working tree was verified, and the stash was restored/dropped before the orphan branch was created. Local IDE files remain on disk but are excluded from the new history.

## Changes

- `.gitignore`: exclude IDE metadata, env/secrets, certificate formats, database dumps, archives, deployment state and generated artifacts; preserve SQL source and example configs.
- `.dockerignore`: build-context allowlist now lives at repository root.
- `database/SLES_Database_v1_2.sql`: byte-identical copy of original schema; existing migrations and business logic unchanged.
- `deploy/Dockerfile.api`, `deploy/Dockerfile.web`, `deploy/docker-compose.staging.yml`: repository-local build context, COPY and schema mount paths.
- `frontend/e2e/run.py`, `deploy/tests/local_staging.py`: repository-local schema/source paths.
- Both PostgreSQL integration tests discover `SLES.slnx` instead of a parent specification folder.
- Root/frontend READMEs and `docs/`: include technical documentation, repair links and repository-root commands, replace the local developer role in the integration command with a placeholder.
- Four `.idea` files removed from the new tracked tree; their local files preserved.

See the root README for the final directory layout. Shared API composition is grouped with examination integration after backend services; frontend entrypoint/router is grouped after dashboard/student modules. Intermediate organizational commits are not claimed to be independently runnable; verification covers the complete assembled source.

## Security review

A local Python scan inspected every candidate source file and every reachable blob in the original Git history. It checked private-key blocks, GitHub/AWS token patterns, JWT literals, literal credential assignments and connection-string passwords, plus exact matches for current locally generated staging keys/passwords. XLSX ZIP/XML parts were inspected as well. Outputs contain paths/rules/line numbers only.

There were 38 pattern hits across working/original trees (19 each): test fixtures, invalid-login values, runtime variables, secret-file reads, generated random passwords and input expressions. No actual credential was identified in publishable source or original committed blobs; no exact current staging-secret match, private-key block or token-pattern hit was found. This is a bounded static/manual scan, not an exhaustive credential guarantee; Gitleaks/TruffleHog were not installed.

`deploy/.env` and `deploy/secrets/*` stay local/ignored. No raw Codex or VS Code history was imported. Historical editor copies with credentials identified in the earlier private audit are outside this repo and were not restored. Review/rotate any such credential still in use independently of publication.

The embedded Excel template has two visible sheets (`Questions`, `HuongDan`), eight columns, five chemistry examples and import instructions. No author/custom document properties, personal/student records, macros, external relationships, embedded objects or executable cell formulas were found. List-validation formulas are static answer/difficulty enumerations. Workbook bytes were not changed.

## Verification

| Check | Result |
|---|---|
| .NET 10 restore/build | Pass; 0 warnings, 0 errors |
| Backend tests | 115 passed, 0 skipped, including isolated PostgreSQL integration |
| npm ci | Pass from lockfile; audit reported 0 vulnerabilities |
| Frontend production build / lint | Pass |
| Vitest | 184 passed across 12 files |
| Playwright E2E | 15 passed, isolated UUID database; cleanup performed |
| Staging host verification | Pass: isolated DB/role, backup/restore counts, login/refresh/logout, health checks and rate limits |
| Compose example configuration | `docker compose --env-file .env.example -f docker-compose.staging.yml config --quiet` passed |
| SQL schema identity | SHA-256 identical to original schema |
| Local Markdown links | No missing local link targets |
| Diff whitespace | Pass |

Initial sandbox-only install/restore/socket attempts were blocked and retried outside the sandbox. The default PostgreSQL client was too old for `\getenv`; staging verification passed with PostgreSQL 18 client tools on PATH. No application database was reset or migrated.

## Before publishing

No blocker was found for the source-layout changes covered above. Real secrets must still be supplied externally on a new machine. PostgreSQL 18 client tools, .NET 10, Node and Playwright browser dependencies are prerequisites for the corresponding checks. Container image builds, image vulnerability scans, TLS/domain setup and remote deployment were not run in this task; Compose validation and host staging checks do not prove them. No GitHub Actions workflow is included by this history-rebuild task.

A fresh checkout should run the documented restore/install steps before tests. Keep the generated local env, secrets, database exports and editor history private. Configure a remote and publish only in a separately authorized step.
