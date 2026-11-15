#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
remote=${1:?Usage: copy-backups.sh user@backup-host:/secure/path}
[[ "$remote" != -* && "$remote" == *:* ]] || { echo 'Use an explicit SSH destination' >&2; exit 1; }
dir=${BACKUP_DIR:-$DEPLOY/backups}
[[ "$dir" = /* ]] || dir="$DEPLOY/$dir"
# No --delete: local retention must not erase off-server copies. SSH keys/config are external.
rsync -a --protect-args --chmod=F600,D700 -- "$dir/" "$remote/"
