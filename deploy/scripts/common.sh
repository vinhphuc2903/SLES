#!/usr/bin/env bash
set -euo pipefail
DEPLOY=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
if [[ ! -f "$DEPLOY/.env" ]]; then echo 'Run scripts/setup.py first.' >&2; exit 1; fi
set -a
# Operator-owned configuration, not downloaded or user-supplied content.
source "$DEPLOY/.env"
set +a
compose() { docker compose --project-directory "$DEPLOY" --env-file "$DEPLOY/.env" -f "$DEPLOY/docker-compose.staging.yml" "$@"; }
owner_psql() { compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U "$DB_OWNER" "$@"; }
