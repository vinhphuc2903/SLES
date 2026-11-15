#!/usr/bin/env bash
set -euo pipefail
# The official entrypoint invokes this only on an empty PGDATA. An interrupted init
# must be inspected/restored, never "fixed" by dropping existing tables.
export SLES_APP_PASSWORD
SLES_APP_PASSWORD=$(cat /run/secrets/app_db_password)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password SLES_APP_PASSWORD
\getenv app_user SLES_APP_USER
\getenv db_name POSTGRES_DB
\getenv db_owner POSTGRES_USER
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
\i /opt/sles/schema.sql
\i /opt/sles/difficulty.sql
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"db_owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"db_owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
SQL
unset SLES_APP_PASSWORD
