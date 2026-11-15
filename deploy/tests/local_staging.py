#!/usr/bin/env python3
"""Staging application + logical restore verification WITHOUT claiming Docker/TLS verification."""
import json, os, secrets, signal, socket, subprocess, tempfile, time, urllib.request, urllib.error, uuid
from pathlib import Path
from http.cookies import SimpleCookie
root=Path(__file__).resolve().parents[2]
name='sles_deploy_test_'+uuid.uuid4().hex;restored=name+'_restore';role=name+'_app'
env=os.environ.copy();env['PGHOST']=env.get('PGHOST','/tmp')
process=None;created=[];role_created=False

def run(args,**kw):return subprocess.run(args,env=env,check=True,**kw)
def sql(db,query):return subprocess.check_output(['psql','-X','-v','ON_ERROR_STOP=1','-d',db,'-Atc',query],env=env,text=True).strip()
def counts(db):return sql(db,"SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM questions),(SELECT count(*) FROM chapters),(SELECT count(*) FROM exams),(SELECT count(*) FROM subjects)")
with tempfile.TemporaryDirectory(prefix='sles-staging-verify-') as tmp:
 os.chmod(tmp,0o700)
 try:
  run(['createdb',name]);created.append(name)
  app_password=secrets.token_hex(32)
  password_file=Path(tmp)/'app-password';password_file.write_text(app_password);os.chmod(password_file,0o600)
  # Run the actual init script; only translate container mount paths for this host test.
  init=(root/'deploy/postgres/init.sh').read_text().replace('/run/secrets/app_db_password',str(password_file)).replace('/opt/sles/schema.sql',str(root/'database/SLES_Database_v1_2.sql')).replace('/opt/sles/difficulty.sql',str(root/'database/001_question_difficulty_up.sql'))
  init_file=Path(tmp)/'init.sh';init_file.write_text(init)
  role_created=True
  subprocess.run(['bash',str(init_file)],env=env|{'POSTGRES_USER':env.get('PGUSER',env['USER']),'POSTGRES_DB':name,'SLES_APP_USER':role},check=True,stdout=subprocess.DEVNULL)
  # Deterministic data with real relationships; never touch the application database.
  sql(name,"""INSERT INTO users(id,role_id,username,full_name,password_hash) SELECT '11111111-1111-1111-1111-111111111111',id,'backup-teacher','Backup Teacher','unusable-test-hash' FROM roles WHERE code='TEACHER';
INSERT INTO chapters(id,teacher_id,grade_id,subject_id,name) SELECT '22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',g.id,s.id,'Backup Chapter' FROM grades g CROSS JOIN subjects s LIMIT 1;
INSERT INTO questions(chapter_id,content,difficulty) VALUES('22222222-2222-2222-2222-222222222222','Backup Question','RECOGNITION');""")
  sql(name,f'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO {role}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO {role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO {role};')
  expected=counts(name);dump=Path(tmp)/'backup.dump'
  run(['pg_dump','-Fc','--no-owner','-d',name,'-f',str(dump)]);os.chmod(dump,0o600)
  run(['pg_restore','-l',str(dump)],stdout=subprocess.DEVNULL)
  run(['createdb',restored]);created.append(restored)
  run(['pg_restore','--no-owner','--exit-on-error','-d',restored,str(dump)])
  assert counts(restored)==expected,'Restored row counts differ'
  copy_data=subprocess.check_output(['pg_restore','--data-only','--file=-',str(dump)],env=env)
  manifest=json.loads(subprocess.check_output(['python3',str(root/'deploy/scripts/archive-counts.py')],input=copy_data))
  for table,count in manifest.items():assert int(sql(restored,f'SELECT count(*) FROM public.{table}'))==count

  assert sql(restored,f'SET ROLE {role}; SELECT count(*) FROM questions').endswith('1')
  assert sql('postgres',f"SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication FROM pg_roles WHERE rolname='{role}'")=='f'
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  password=secrets.token_urlsafe(32)
  app_env=env|{'ASPNETCORE_ENVIRONMENT':'Staging','ASPNETCORE_URLS':f'http://127.0.0.1:{port}','ASPNETCORE_HTTPS_PORT':'443','AllowedHosts':'127.0.0.1','ConnectionStrings__DefaultConnection':f"Host={env['PGHOST']};Database={restored};Username={role};Password={app_password}",'Jwt__Issuer':'staging-test','Jwt__Audience':'staging-test','Jwt__SigningKey':secrets.token_hex(64),'BootstrapAdmin__Username':'verify-admin','BootstrapAdmin__FullName':'Verify Admin','BootstrapAdmin__Password':password,'AuthenticationRateLimit__PermitLimit':'3'}
  logfile=open(Path(tmp)/'api.log','w')
  process=subprocess.Popen(['dotnet','run','--no-build','--no-launch-profile','--project',str(root/'src/SLES.Api')],env=app_env,stdout=logfile,stderr=logfile,start_new_session=True)
  base=f'http://127.0.0.1:{port}'
  def request(path,body=None,headers=None):
   req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','X-Forwarded-Proto':'https'}|(headers or {}))
   try:
    with urllib.request.urlopen(req,timeout=5) as r:return r.status,r.headers,r.read()
   except urllib.error.HTTPError as e:return e.code,e.headers,e.read()
  end=time.monotonic()+60
  while time.monotonic()<end:
   if process.poll() is not None:raise RuntimeError('Staging API startup failed; check environment prerequisites')
   try:
    if request('/health/ready')[0]==200:break
   except (urllib.error.URLError,TimeoutError):pass
   time.sleep(.1)
  else:raise RuntimeError('Readiness timeout')
  assert request('/health/live')[0]==200
  assert request('/api/auth/me')[0]==401
  status,headers,body=request('/api/auth/login',{'username':'verify-admin','password':password});assert status==200
  assert headers.get('X-Correlation-ID')
  cookie=SimpleCookie();cookie.load(headers['Set-Cookie']);value=cookie['sles_refresh_token']
  assert value['secure'] and value['httponly'] and value['path']=='/api/auth' and value['samesite'].lower()=='lax'
  token=json.loads(body)['accessToken'];assert request('/api/auth/me',headers={'Authorization':'Bearer '+token})[0]==200
  status,headers,_=request('/api/auth/refresh',{}, {'Cookie':'sles_refresh_token='+value.value});assert status==200
  rotated=SimpleCookie();rotated.load(headers['Set-Cookie']);assert rotated['sles_refresh_token'].value!=value.value
  assert request('/api/auth/refresh',{}, {'Cookie':'sles_refresh_token='+value.value})[0]==401
  assert request('/api/auth/login',{'username':'invalid','password':'invalid'})[0]==429
  assert request('/api/auth/logout',{}, {'Cookie':'sles_refresh_token='+rotated['sles_refresh_token'].value})[0]==204
  assert sql(restored,"SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL")=='0'
  assert request('/openapi/v1.json')[0]==404
  sql(restored,f'REVOKE SELECT ON questions FROM {role}')
  assert request('/health/ready')[0]==503 and request('/health/live')[0]==200
  sql(restored,f'GRANT SELECT ON questions TO {role}')
  assert request('/health/ready')[0]==200
  print('PASS: logical backup/restore counts + app-role queries, Staging login/rotation/logout, Secure HttpOnly cookie, protected routes, correlation, rate limiting, health separation, no OpenAPI.')
 finally:
  if process and process.poll() is None:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
  for db in reversed(created):run(['dropdb','--force',db])
  if role_created:sql('postgres',f'DROP ROLE IF EXISTS {role}')
