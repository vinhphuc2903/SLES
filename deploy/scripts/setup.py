#!/usr/bin/env python3
"""Generate secrets once. Never print secret values or overwrite existing configuration."""
import argparse, json, os, re, secrets
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--host',required=True);p.add_argument('--email',required=True);p.add_argument('--release',required=True);p.add_argument('--database',default='sles_staging');p.add_argument('--db-owner',default='sles_owner');p.add_argument('--db-user',default='sles_app');a=p.parse_args()
if not all(re.fullmatch(r'[a-z][a-z0-9_]{0,40}',value) for value in [a.database,a.db_owner,a.db_user]):p.error('Invalid database role/name')
if not re.fullmatch(r'[A-Za-z0-9.-]+',a.host) or not re.fullmatch(r'[A-Za-z0-9_.-]+',a.release) or not re.fullmatch(r'[A-Za-z0-9_.+@-]+',a.email):p.error('Invalid host/email/release')
a.host=a.host.lower()
root=Path(__file__).resolve().parents[1]
if (root/'.env').exists() or (root/'secrets').exists():p.error('Existing configuration found; refusing to overwrite')
os.umask(0o077);(root/'secrets').mkdir(mode=0o700)
for directory in ['state/acme','state/tls','backups']:(root/directory).mkdir(parents=True,exist_ok=True)
# Bind-mounted leaf directories are readable inside Nginx; keep host ancestors private.
os.chmod(root/'state',0o700);os.chmod(root/'state/acme',0o755)
app=secrets.token_hex(32)
config={'ConnectionStrings':{'DefaultConnection':f'Host=postgres;Database={a.database};Username={a.db_user};Password={app};Include Error Detail=false'},'Jwt':{'Issuer':f'https://{a.host}','Audience':f'https://{a.host}','SigningKey':secrets.token_hex(64)},'BootstrapAdmin':{'Username':'staging-admin','FullName':'Staging Administrator','Password':secrets.token_urlsafe(32)}}
for name,value in [('api-settings.json',json.dumps(config,indent=2)),('app-db-password',app),('pg-admin-password',secrets.token_hex(32))]:
 f=root/'secrets'/name;f.write_text(value+'\n');os.chmod(f,0o444)
# Compose file-backed secrets keep host mode. 0444 inside a 0700 directory allows
# non-root container users to read their individual bind-mounted secret only.
text=(root/'.env.example').read_text().replace('staging.example.invalid',a.host).replace('operator@example.invalid',a.email).replace('replace-with-release-id',a.release)
text=text.replace('DB_NAME=sles_staging','DB_NAME='+a.database).replace('DB_OWNER=sles_owner','DB_OWNER='+a.db_owner).replace('DB_APP_USER=sles_app','DB_APP_USER='+a.db_user)
(root/'.env').write_text(text)
print('Created private secrets directory and .env. Bootstrap password is in api-settings.json; do not paste it into logs.')
