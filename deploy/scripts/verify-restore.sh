#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
file=${1:?Usage: verify-restore.sh /path/to/backup.dump}
[[ -f "$file" ]] || { echo 'Backup not found' >&2; exit 1; }
name="sles_restore_$(date -u +%Y%m%d%H%M%S)_$$"
[[ "$name" =~ ^sles_restore_[0-9]+_[0-9]+$ ]] || exit 1
compose exec -T postgres createdb -U "$DB_OWNER" "$name"
trap 'compose exec -T postgres dropdb -U "$DB_OWNER" --force "$name"' EXIT
compose exec -T postgres pg_restore -U "$DB_OWNER" -d "$name" --no-owner --exit-on-error < "$file"
owner_psql -v app_user="$DB_APP_USER" -d "$name" <<'SQL'
SET ROLE :"app_user";
SELECT count(*) AS users FROM users;
SELECT count(*) AS questions FROM questions;
SELECT count(*) AS exams FROM exams;
SELECT count(*) AS attempts FROM exam_attempts;
SELECT difficulty FROM questions LIMIT 0;
SELECT count(*) AS permissions FROM exam_permissions;
SQL
# Compare every COPY table with counts derived from this exact archive snapshot.
expected=$(mktemp)
actual=$(mktemp)
trap 'rm -f "$expected" "$actual"; compose exec -T postgres dropdb -U "$DB_OWNER" --force "$name"' EXIT
compose exec -T postgres pg_restore --data-only --file=- < "$file" | python3 "$DEPLOY/scripts/archive-counts.py" > "$expected"
python3 - "$expected" <<'PYSQL' | owner_psql -d "$name" -At > "$actual"
import json,sys
counts=json.load(open(sys.argv[1]))
for table in sorted(counts): print(f"SELECT '{table}',count(*) FROM public.{table};")
PYSQL
python3 - "$expected" "$actual" <<'PYVERIFY'
import json,sys
expected=json.load(open(sys.argv[1]));actual={}
for row in open(sys.argv[2]):
 table,count=row.strip().split('|');actual[table]=int(count)
if expected!=actual:raise SystemExit('Restore counts do not match archive')
print('All restored table counts match the archive snapshot.')
PYVERIFY
printf 'Restore and app-role queries passed in temporary database %s (now removed).\n' "$name"
