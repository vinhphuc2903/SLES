#!/usr/bin/env bash
# Host certbot deploy-hook. Invoke as root on the server, after certbot webroot issuance.
set -euo pipefail
source "$(dirname -- "$0")/common.sh"
lineage=${RENEWED_LINEAGE:-/etc/letsencrypt/live/$PUBLIC_HOST}
[[ "$lineage" == "/etc/letsencrypt/live/$PUBLIC_HOST" ]] || exit 0
install -d -m 0750 -o 101 -g 101 "$DEPLOY/state/tls"
install -m 0640 -o 101 -g 101 "$lineage/fullchain.pem" "$DEPLOY/state/tls/fullchain.pem"
install -m 0640 -o 101 -g 101 "$lineage/privkey.pem" "$DEPLOY/state/tls/privkey.pem"
# Switch from ACME bootstrap to HTTPS config on first issuance; reload on renewal.
compose up -d --wait web
compose exec -T web nginx -t
compose exec -T web nginx -s reload
