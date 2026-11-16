"""Own an isolated database and processes; never accept an existing application DB."""
import os, secrets, signal, socket, subprocess, tempfile, time, urllib.request, urllib.error, uuid
from pathlib import Path
root = Path(__file__).resolve().parents[2]
frontend = root / 'frontend'
name = 'sles_e2e_' + uuid.uuid4().hex
processes = []
env = os.environ.copy()
env.update(PGHOST=env.get('SLES_E2E_PGHOST', '/tmp'), PGUSER=env.get('SLES_E2E_PGUSER', env.get('USER', 'postgres')), PGDATABASE=name, PGPORT=env.get('PGPORT', '5432'))
def command(args, **kwargs): return subprocess.run(args, check=True, env=env, **kwargs)
def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
def stop(signum, _frame): raise SystemExit(128 + signum)
for signum in (signal.SIGTERM, signal.SIGINT): signal.signal(signum, stop)
def connection_value(value): return '"' + value.replace('"', '""') + '"'
def wait(url, proc, expected=200):
    end = time.monotonic() + 60
    while time.monotonic() < end:
        if proc.poll() is not None: raise RuntimeError('Test server exited during startup')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == expected: return
        except urllib.error.HTTPError as error:
            if error.code == expected: return
        except (urllib.error.URLError, TimeoutError): time.sleep(.1)
    raise RuntimeError('Test server startup timed out')
with tempfile.TemporaryDirectory(prefix='sles-e2e-') as temp:
    os.chmod(temp, 0o700)
    created = False
    try:
        command(['createdb', name]); created = True
        for file in ['database/SLES_Database_v1_2.sql', 'database/001_question_difficulty_up.sql']:
            command(['psql', '-v', 'ON_ERROR_STOP=1', '-f', str(root/file)], stdout=subprocess.DEVNULL)
        command(['dotnet', 'build', str(root/'SLES.slnx'), '--no-restore'], stdout=subprocess.DEVNULL)
        api_port, fe_port = port(), port()
        env.update(SLES_E2E_DATABASE=name, SLES_E2E_PASSWORD='E2e!' + secrets.token_hex(16), SLES_E2E_API=f'http://127.0.0.1:{api_port}', SLES_E2E_URL=f'http://127.0.0.1:{fe_port}')
        signing_key = secrets.token_hex(32)
        if env.get('GITHUB_ACTIONS') == 'true':
            for value in (env['SLES_E2E_PASSWORD'], signing_key): print('::add-mask::' + value, flush=True)
        connection = ';'.join(key + '=' + connection_value(value) for key, value in {
            'Host': env['PGHOST'], 'Port': env['PGPORT'], 'Database': name, 'Username': env['PGUSER'],
            'Password': env.get('PGPASSWORD', '')}.items())
        api_env = env | {
            'ASPNETCORE_ENVIRONMENT':'Development', 'ASPNETCORE_URLS':env['SLES_E2E_API'],
            'ConnectionStrings__DefaultConnection':connection,
            'Jwt__Issuer':'sles-e2e', 'Jwt__Audience':'sles-e2e', 'Jwt__SigningKey':signing_key,
            'BootstrapAdmin__Username':'e2e_admin', 'BootstrapAdmin__Password':env['SLES_E2E_PASSWORD'], 'BootstrapAdmin__FullName':'E2E Admin',
            'Logging__LogLevel__Default':'Error', 'Logging__LogLevel__Microsoft':'Warning'
        }
        api_env.pop('SLES_CONFIG_FILE', None)
        log = open(Path(temp)/'servers.log','w')
        api = subprocess.Popen(['dotnet','run','--no-build','--no-launch-profile','--project',str(root/'src/SLES.Api')],env=api_env,stdout=log,stderr=log,start_new_session=True); processes.append(api)
        wait(env['SLES_E2E_API']+'/api/auth/me',api,expected=401)
        fe = subprocess.Popen(['npm','run','dev','--','--host','127.0.0.1','--port',str(fe_port),'--strictPort'],cwd=frontend,env=env|{'VITE_DEV_API_TARGET':env['SLES_E2E_API']},stdout=log,stderr=log,start_new_session=True); processes.append(fe)
        wait(env['SLES_E2E_URL'],fe)
        result = subprocess.Popen(['npx','playwright','test'],cwd=frontend,env=env,start_new_session=True)
        processes.append(result)
        result.wait()
        if result.returncode:
            log.flush()
            # Server logging excludes request bodies/headers and sensitive EF values.
            text = (Path(temp)/'servers.log').read_text()
            index = text.rfind('fail:')
            if index >= 0:
                (frontend/'test-results').mkdir(exist_ok=True)
                for value in (signing_key, env['SLES_E2E_PASSWORD'], env.get('PGPASSWORD', '')):
                    if value: text = text.replace(value, '[REDACTED]')
                (frontend/'test-results/server-error.log').write_text(text[index:])
        raise SystemExit(result.returncode)
    finally:
        for signum in (signal.SIGTERM, signal.SIGINT): signal.signal(signum, signal.SIG_IGN)
        for proc in reversed(processes):
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try: proc.wait(timeout=10)
                except subprocess.TimeoutExpired: os.killpg(proc.pid, signal.SIGKILL); proc.wait()
        if created: command(['dropdb','--force',name])
