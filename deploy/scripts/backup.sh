#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
umask 077
DEST=${BACKUP_DIR:-$DEPLOY/backups}
[[ "$DEST" = /* ]] || DEST="$DEPLOY/$DEST"
mkdir -p -- "$DEST"; chmod 700 "$DEST"
KEEP=${BACKUP_KEEP:-7}
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || { echo 'BACKUP_KEEP must be positive' >&2; exit 1; }
file="$DEST/sles-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f -- "$file.partial"' EXIT
compose exec -T postgres pg_dump -U "$DB_OWNER" -d "$DB_NAME" --format=custom --no-owner > "$file.partial"
compose exec -T postgres pg_restore --list < "$file.partial" > /dev/null
mv -- "$file.partial" "$file"; chmod 600 "$file"
compose exec -T postgres pg_restore --data-only --file=- < "$file" | python3 "$DEPLOY/scripts/archive-counts.py" > "$file.counts.json"
chmod 600 "$file.counts.json"
# Only prune successful dumps with our exact naming pattern, after a successful backup.
python3 - "$DEST" "$KEEP" <<'PY'
import re,sys
from pathlib import Path
files=sorted((p for p in Path(sys.argv[1]).glob('sles-*.dump') if re.fullmatch(r'sles-\d{8}T\d{6}Z-\d+\.dump',p.name)),key=lambda p:p.name,reverse=True)
for p in files[int(sys.argv[2]):]:
 p.unlink();p.with_name(p.name+'.counts.json').unlink(missing_ok=True)
PY
printf 'Backup created: %s\n' "$file"
