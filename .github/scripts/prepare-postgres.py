"""Provision only the disposable GitHub service container; never a host database."""
import os
import secrets
import subprocess
from pathlib import Path

if os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('This helper requires a disposable GitHub Actions service container.')
container = os.environ['CI_POSTGRES_CONTAINER']
password = secrets.token_hex(32)
connection = f"Host=127.0.0.1;Port={os.environ['PGPORT']};Database=postgres;Username=sles_ci;Password={password}"
for value in (password, connection):
    print(f'::add-mask::{value}', flush=True)

def execute(args, data=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True, timeout=30)
    if result.returncode:
        # SQL errors can echo the statement containing the generated credential.
        raise SystemExit('Disposable PostgreSQL provisioning failed; inspect service health (SQL output withheld).')
    return result.stdout.strip()

psql = ['docker', 'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq']
version = execute(psql, 'SHOW server_version_num;')
if not 180000 <= int(version) < 190000:
    raise SystemExit('CI requires PostgreSQL 18.')
execute(psql, f"CREATE ROLE sles_ci LOGIN CREATEDB NOSUPERUSER NOCREATEROLE PASSWORD '{password}';")
# Bootstrap trust is restricted to this ephemeral service, then replaced before tests.
execute(['docker', 'exec', container, 'sh', '-c',
         'printf "local all all trust\\nhost all all all scram-sha-256\\n" > "$PGDATA/pg_hba.conf"'])
execute(psql, 'SELECT pg_reload_conf();')
values = {'PGPORT': os.environ['PGPORT'], 'PGHOST': '127.0.0.1', 'PGUSER': 'sles_ci', 'PGPASSWORD': password,
          'SLES_E2E_PGHOST': '127.0.0.1', 'SLES_E2E_PGUSER': 'sles_ci',
          'SLES_TEST_POSTGRES_ADMIN': connection}
with Path(os.environ['GITHUB_ENV']).open('a') as output:
    for key, value in values.items():
        output.write(f'{key}={value}\n')
print('PostgreSQL 18 CI role created; TCP requires SCRAM password authentication.')
