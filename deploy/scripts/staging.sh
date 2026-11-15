#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
command=${1:-status}
case "$command" in
  build) compose build --pull api web ;;
  start) compose up -d --wait ;;
  stop) compose stop ;;
  restart) compose restart ;;
  status) compose ps ;;
  logs) compose logs --tail=100 "${2:-api}" ;;
  nginx-test) compose exec -T web nginx -t ;;
  backup) "$DEPLOY/scripts/backup.sh" ;;
  verify-restore) "$DEPLOY/scripts/verify-restore.sh" "${2:?Backup path required}" ;;
  bootstrap-tls)
    # Temporary ACME-only config: never exposes credentials over plaintext HTTP.
    NGINX_SITE_TEMPLATE=./nginx/bootstrap.conf.template compose up -d --wait
    ;;
  upgrade)
    tag=${2:?New immutable release tag required}
    [[ "$tag" =~ ^[A-Za-z0-9_.-]+$ && "$tag" != "$RELEASE_TAG" ]] || { echo 'Use a new release tag' >&2; exit 1; }
    "$DEPLOY/scripts/backup.sh"
    if docker image inspect "sles-api:$tag" >/dev/null 2>&1 || docker image inspect "sles-web:$tag" >/dev/null 2>&1; then
      echo 'Release tag already exists; use a new tag to preserve rollback images.' >&2; exit 1
    fi
    previous=$RELEASE_TAG
    export RELEASE_TAG=$tag
    compose build --pull api web
    compose up -d --no-deps --wait api web
    mkdir -p "$DEPLOY/state"
    printf '%s\n' "$previous" > "$DEPLOY/state/previous-release"
    # Update .env only after readiness succeeds. Keep previous images for rollback.
    python3 - "$DEPLOY/.env" "$tag" <<'PY'
import re,sys
from pathlib import Path
p=Path(sys.argv[1]);p.write_text(re.sub(r'^RELEASE_TAG=.*$', 'RELEASE_TAG='+sys.argv[2], p.read_text(),flags=re.M))
PY
    ;;
  rollback)
    tag=${2:?Explicit previously built release tag required}
    [[ "$tag" =~ ^[A-Za-z0-9_.-]+$ ]] || exit 1
    export RELEASE_TAG=$tag
    # No DB downgrade/restore and no rebuild. Operator must verify schema compatibility.
    compose up -d --no-deps --no-build --pull never --wait api web
    python3 - "$DEPLOY/.env" "$tag" <<'PY'
import re,sys
from pathlib import Path
p=Path(sys.argv[1]);p.write_text(re.sub(r'^RELEASE_TAG=.*$', 'RELEASE_TAG='+sys.argv[2], p.read_text(),flags=re.M))
PY
    ;;
  schema-check)
    owner_psql -d "$DB_NAME" <<'SQL'
DO $$ BEGIN
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='questions' AND column_name IN ('difficulty','legacy_difficulty')) <> 2
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_questions_difficulty' AND pg_get_constraintdef(oid) LIKE '%RECOGNITION%' AND pg_get_constraintdef(oid) LIKE '%COMPREHENSION%' AND pg_get_constraintdef(oid) LIKE '%LOW_APPLICATION%' AND pg_get_constraintdef(oid) LIKE '%HIGH_APPLICATION%')
 THEN RAISE EXCEPTION 'Expected v1.2 + difficulty migration schema was not found'; END IF;
 RAISE NOTICE 'Difficulty migration schema verified';
END $$;
SQL
    ;;
  migrate-difficulty)
    "$DEPLOY/scripts/backup.sh"
    compose stop web api
    # Explicit upgrade only; never rerun schema.sql on an existing database.
    owner_psql -d "$DB_NAME" -f /opt/sles/difficulty.sql
    "$DEPLOY/scripts/staging.sh" schema-check
    compose up -d --wait
    ;;
  seal-bootstrap)
    python3 - "$DEPLOY/secrets/api-settings.json" <<'PY'
import json,os,sys
from pathlib import Path
p=Path(sys.argv[1]);data=json.loads(p.read_text());data.pop('BootstrapAdmin',None)
os.chmod(p,0o600);p.write_text(json.dumps(data,indent=2)+'\n');os.chmod(p,0o444)
PY
    compose up -d --force-recreate api
    ;;
  *) echo 'Commands: build start stop restart status logs nginx-test bootstrap-tls backup verify-restore upgrade rollback schema-check migrate-difficulty seal-bootstrap' >&2; exit 2 ;;
esac
