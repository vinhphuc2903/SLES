# Phase 13C — Container images and GHCR

The implementation is on `feature/phase-13c-ghcr`. The audit started from clean `main` at `07c7184`, which merged Phase 14A (PR #1). No push, registry publication or server deployment is part of this implementation task. Hosted Actions and GHCR remain unverified until an authorized push/run.

## Flow and trust boundaries

`.github/workflows/docker-publish.yml` runs on PRs to main, pushes to main, `v*` tags and manual dispatch. Two independent matrix jobs build **linux/amd64** OCI archives, validate runtime metadata, generate SPDX JSON SBOMs, scan vulnerabilities and upload approved archives. Build jobs have only `contents: read` and never log in to a registry. They can run in parallel with the test jobs.

The workflow **calls** Backend CI, Frontend CI and E2E CI at the same source revision. Publication has `needs: [backend, frontend, e2e, images]`: failed, cancelled or skipped tests/scans block publication. The PostgreSQL TRX verifier still rejects skipped database tests. This gate does not rely on unrelated workflow statuses or branch protection. Each reusable workflow has a distinct concurrency prefix so called workflows cannot cancel one another. Standalone workflows remain available as branch-protection checks; this intentionally duplicates some runs.

Only the publish job receives `packages: write`. It downloads archives from this run, validates their source SHA again, authenticates using the ephemeral `GITHUB_TOKEN`, checks existing immutable tags, and copies the **already scanned archive** with Skopeo `--preserve-digests`. There is no rebuild after the gate. PRs (including same-repository PRs) cannot publish. Manual runs default to build-only; `publish=true` works only on main in `vinhphuc2903/SLES`. Release tags must match `vX.Y.Z` and their source must be an ancestor of main. Other `v*` tags fail validation.

Build jobs have 35-minute timeouts; publication has 20 minutes. Publication is serialized across refs and is not cancelled mid-push. GitHub concurrency can replace a pending run; do not assume every queued release will execute. The top-level workflow does not cancel running checks for a newer push.

## Images, build context and tags

| Image | Build and runtime |
|---|---|
| `ghcr.io/vinhphuc2903/sles-api` | .NET 10 SDK restore/Release publish → ASP.NET Core 10 runtime; UID 1654; port 8080 |
| `ghcr.io/vinhphuc2903/sles-web` | Node 22 `npm ci`/TypeScript/Vite → Nginx stable-alpine-slim; user nginx (UID 101); ports 8080/8443 |

Base images remain digest-pinned in the Dockerfiles and `deploy/image-lock.json`. The web runtime uses the official `stable-alpine-slim` variant, which retains HTTP/TLS/proxy and envsubst support while omitting unused XSLT/image/perl modules. This removes the vulnerable libxslt dependency without changing application packages. API project files are copied before source to retain the restore layer across source-only changes. Buildx GHA caches use separate `sles-api`/`sles-web` scopes. No secret build args or mounts are used. `.dockerignore` admits only application/build inputs and excludes development settings, env files, secrets, test output and dependencies. The API output removes development configuration defensively; its final image has no SDK. Runtime credentials remain external Compose secrets. OCI source/title/revision/created labels describe the repository and commit.

The frontend builds a same-origin API URL. Nginx provides React Router fallback and proxies `/api/` to `api:8080`; PUBLIC_HOST and TLS certificates are supplied at runtime. Compose retains non-root, read-only filesystems, tmpfs, dropped capabilities and internal database/API networks. The proxy network now reserves the lower address range for the fixed Nginx IP: `PROXY_DYNAMIC_RANGE=172.30.80.128/25` prevents API startup from taking `PROXY_IP=172.30.80.2`. If customizing the subnet, change **PROXY_SUBNET, PROXY_DYNAMIC_RANGE and PROXY_IP together**, keeping the proxy IP outside the dynamic range.

Tags:

- `sha-<first 12 commit characters>` on every publication; both images use the same full OCI revision label.
- `main` for main push/manual publication; mutable, so use digests for deployment.
- Exact `vX.Y.Z` for release tag publication; no automatic `latest`.

SHA and version tags are immutable by policy: if an existing tag has another manifest digest, the entire preflight fails before either image is pushed. Unknown manifests allow creation; authentication/network errors fail closed. Each pushed tag is inspected again and its digest must equal the archive digest. The `published-image-digests` artifact and job summary contain `image@sha256:…` references.

This is not registry-enforced immutability: restrict other package writers. Cross-image pushes are not atomic; if the second transfer fails, the first may exist. Retry only the same artifacts/revision and inspect the recorded references. Stable commit timestamps and BuildKit timestamp rewriting reduce rebuild drift, but NuGet resolution and upstream registries mean byte-for-byte rebuilds are not guaranteed. A changed digest for an existing SHA is a blocker, not permission to overwrite it. SHA/version collisions require investigation or a new source revision. `main` means the last successful serialized main publication, not an ordering guarantee between overlapping builds.

## Security gate and reports

Trivy **0.76.2** is installed with the SHA-pinned official setup action. All directly referenced Actions are pinned to verified release commits. Update action versions and their SHA comments together; review base-image and scanner updates separately.

Each image produces:

- `sbom.spdx.json`: SPDX JSON package inventory.
- `trivy.json`: all reported vulnerability severities, including unfixed findings.
- `trivy.txt`: readable report.
- `digest.txt`: validated OCI manifest digest.

Trivy report generation is followed by a separate `trivy image --skip-db-update --ignore-unfixed --severity HIGH,CRITICAL --exit-code 1` gate on the same archive and cached vulnerability database. **Fixable HIGH/CRITICAL fail**; there is no continue-on-error bypass. Scanner/download errors fail too. Reports upload even when the gate fails (7-day retention); approved image archives remain for 1 day; published references for 30 days. SBOMs/reports include package/source metadata, not runtime secrets. BuildKit provenance attestations are disabled to keep a single-platform manifest; SPDX is a separate artifact, not a signed attestation.

Download `container-reports-api` and `container-reports-web` from the run's Artifacts section. Inspect the JSON with `jq`, or read `trivy.txt`. Link findings to the image digest and scanner/database timestamp. For fixable findings, update the affected base image or dependency and rerun all gates. Unfixed findings remain visible and need tracked upstream monitoring. A false positive needs evidence, owner, scope and expiry in a reviewed change; there is currently **no ignore file or exception mechanism**. Do not disable the gate to publish.

## GitHub setup and operation

1. After reviewing this branch, explicitly authorize its push/PR. No publication was attempted locally.
2. Allow the pinned Actions, reusable workflows, package writes for this repository's `GITHUB_TOKEN`, and artifact/cache use. Default workflow permissions can remain read-only; the publish job requests package write specifically. No PAT or new repository secrets are required.
3. Protect main and release tags; require review of workflow/scripts/Dockerfiles. Keep Backend CI, Frontend CI and E2E CI required. Optionally require both Docker matrix checks after their first hosted run. Restrict tag creation to release maintainers.
4. GHCR packages must be owned by `vinhphuc2903` and grant this repository Actions write access if pre-existing. OCI source labels link new packages to the repository. Review package visibility explicitly; public repository visibility does not guarantee public package visibility. Fork repositories cannot publish to these image names through this workflow.
5. Run a build-only dispatch first and inspect test/scan artifacts. A main push will publish automatically once merged; manual publication requires `publish=true` on main. For releases, create a protected `vX.Y.Z` tag on a reviewed main commit. Do not trigger a release until publication is authorized.

No production environments, deployment keys, SSH access or server steps are used. A protected environment with reviewers can be added before enabling publication if an additional organizational approval gate is required.

## Local verification

From the repository root (Docker daemon/Compose, Python 3.9+, openssl):

```bash
docker build -f deploy/Dockerfile.api -t sles-api:local .
docker build -f deploy/Dockerfile.web -t sles-web:local .
python3 deploy/tests/container_smoke.py
python3 .github/scripts/test_container_image.py
actionlint .github/workflows/*.yml
```

The smoke test creates its own temporary deployment config, generated credentials, self-signed TLS certificate, loopback ports, Compose project and database volume. It uses the real production Compose file, tests SPA/fallback and HTTPS API 401, checks users/read-only/capabilities/no SDK/development config, then removes only its own resources in `finally`. A hard process kill may leave resources with the printed `sles-image-check-*` project name; inspect that exact project before cleanup. It never uses `deploy/secrets`, staging `.env` or the development DB. Existing containers/images are not deleted.

To exercise CI archives, add `--platform linux/amd64 --provenance=false --label org.opencontainers.image.revision=$(git rev-parse HEAD) --output type=oci,dest=/tmp/sles-api-ci.tar,rewrite-timestamp=true` to `docker buildx build`, then validate/unpack with `python3 .github/scripts/container-image.py validate /tmp/sles-api-ci.tar api "$(git rev-parse HEAD)" /tmp/sles-api-oci`. Repeat for web. Use the workflow's Trivy commands against the unpacked OCI directories: Trivy accepts OCI directories, while Skopeo consumes the original archives. The helper only unpacks allowlisted regular files and verifies blob digests. Native local builds may be arm64; hosted publication is amd64 only.

Troubleshooting: scanner DB download/rate-limit failures must be retried without bypassing scanning; OCI export needs a Buildx driver that supports OCI; GHCR 403 requires checking package/repository permissions; missing manifests and denied requests are deliberately distinguished; immutable-tag conflicts require digest investigation; check all three reusable test jobs before diagnosing a skipped publish job. A custom proxy subnet requires a matching dynamic range. Keep generated credentials and raw container logs private.

## Phase 13D prerequisites

Before any deployment: verify hosted tests/scans/publication, choose matching API/web digest references, confirm server amd64 compatibility, registry pull access, TLS/DNS, external secrets, DB migrations/backups/rollback and health checks. The existing staging Compose still references local image names; this phase does not switch a server to GHCR. Signed provenance, multi-architecture images and automated deployment are future work.

## Verification record — 2026-11-17 to 2026-11-18

Local verification results are recorded after execution below. Hosted action downloads, GHCR permissions/transfers, artifact retention and cancellation behavior cannot be established by local checks.

References: [reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows), [Trivy setup](https://github.com/aquasecurity/setup-trivy), [Skopeo digest-preserving copy](https://github.com/containers/skopeo/blob/main/docs/skopeo-copy.1.md).

- Native ARM64 API and web Docker builds: passed; .NET 10 retained.
- Production Compose smoke test: passed after fixing the dynamic/static proxy IP collision. Containers, networks and temporary DB volume were removed.
- Release .NET restore/build: passed, 0 warnings/errors. Backend tests: **136 passed, 0 skipped**, including all required PostgreSQL integration tests and TRX verifier.
- Frontend lint and TypeScript/Vite build: passed. Vitest: **193 passed** with `--maxWorkers=2`. The first run with default concurrency had 8 UI wait failures while concurrent Docker builds were running; the bounded-concurrency rerun passed without changing tests or application code.
- CI-mode Chromium E2E: **20 passed** against a disposable PostgreSQL service; temporary DB cleanup verified.
- `actionlint v1.7.12`, `git diff --check`, and **6 publication-helper safety tests**: passed. Helper tests cover root/revision/digest rejection, unsafe archive paths, auth-error handling, immutable-tag collisions, disallowed publication events and digest-preserving copy/reporting.
- Both linux/amd64 OCI exports, metadata validation and blob verification: passed. API manifest `sha256:05ffbca864cb55d1bdacf60803da6e9698f46b4147b2dc46b7a457230bdb0ac5`; final web manifest `sha256:67aefbc4a9e4a961be8f52f56dc067b613567b58de9fb9d74eeb27c4471f52a9`. These are local verification artifacts built during development, not published release references.
- Trivy 0.76.2 with the vulnerability database downloaded on November 17: both amd64 images pass the fixable HIGH/CRITICAL gate; SPDX JSON and full JSON/text reports generated. API retains **31 MEDIUM / 5 LOW** findings; web retains **1 MEDIUM** finding. Counts are a database snapshot, not a guarantee about future scans.
- The original full Nginx image correctly failed the gate on three fixable HIGH libxslt findings: `CVE-2026-125350`, `CVE-2026-87636`, `CVE-2026-9947` (installed `1.1.43-r3`, fixed `1.1.43-r4`). The latest full-image digest still contained them. The official slim variant omits that unused dependency; no findings were suppressed.
- Local scan/SBOM files are under `/tmp/sles-13c-scans/{api,web}/`; these temporary files are not committed. Hosted runs will generate fresh reports as workflow artifacts.
- Initial interruption: automatic approval review hit a usage limit before the final slim-image Compose check; this was a review-service failure, not a safety rejection. Verification resumed on November 18.

- November 18: the final slim-image production Compose smoke test passed (SPA, routing fallback, HTTPS API proxy, runtime permissions and configuration). Its isolated containers, networks and database volume were removed.
