#!/usr/bin/env python3
"""Smoke-test local images with the production Compose topology in a disposable project.

Requires Docker Compose, openssl and prebuilt sles-api:local / sles-web:local.
Never reads deployment secrets or connects to the development database.
"""
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.request

REPO = Path(__file__).resolve().parents[2]


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs).stdout


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def main():
    project = 'sles-image-check-' + secrets.token_hex(5)
    with tempfile.TemporaryDirectory(prefix=project) as directory:
        root = Path(directory)
        deploy = root / 'deploy'
        deploy.mkdir()
        for name in ('nginx', 'postgres', 'scripts'):
            shutil.copytree(REPO / 'deploy' / name, deploy / name)
        for name in ('docker-compose.staging.yml', '.env.example'):
            shutil.copy2(REPO / 'deploy' / name, deploy / name)
        (root / 'database').mkdir()
        for name in ('SLES_Database_v1_2.sql', '001_question_difficulty_up.sql'):
            shutil.copy2(REPO / 'database' / name, root / 'database' / name)
        run(['python3', str(deploy / 'scripts/setup.py'), '--host', 'localhost',
             '--email', 'image-check@example.invalid', '--release', 'local'])
        tls = deploy / 'state/tls'
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
             '-subj', '/CN=localhost', '-keyout', str(tls / 'privkey.pem'),
             '-out', str(tls / 'fullchain.pem')])
        tls.chmod(0o755)
        for path in tls.iterdir():
            path.chmod(0o444)
        http, https = free_port(), free_port()
        subnet = '10.247.' + str(secrets.randbelow(250) + 1)
        env = os.environ.copy()
        env.update(COMPOSE_PROJECT_NAME=project, BIND_ADDRESS='127.0.0.1',
                   HTTP_PORT=str(http), HTTPS_PORT=str(https), PROXY_SUBNET=subnet + '.0/24',
                   PROXY_IP=subnet + '.2', PROXY_DYNAMIC_RANGE=subnet + '.128/25', RELEASE_TAG='local')
        # Avoid inherited overrides pointing at real deployment resources.
        env.pop('NGINX_SITE_TEMPLATE', None)
        command = ['docker', 'compose', '--env-file', str(deploy / '.env'),
                   '-f', str(deploy / 'docker-compose.staging.yml'), '-p', project]
        try:
            run(command + ['up', '-d', '--no-build', '--wait', '--wait-timeout', '240'], env=env)
            for component in ('api', 'web'):
                container = run(command + ['ps', '-q', component], env=env).strip()
                config = json.loads(run(['docker', 'inspect', container]))[0]
                assert config['Config']['User'] in ('1654', '101', 'nginx')
                assert config['HostConfig']['ReadonlyRootfs']
                assert 'ALL' in config['HostConfig']['CapDrop']
                assert 'no-new-privileges:true' in config['HostConfig']['SecurityOpt']
                assert run(['docker', 'exec', container, 'id', '-u']).strip() != '0'
                if component == 'api':
                    run(['docker', 'exec', container, 'sh', '-c',
                         'test ! -e /app/appsettings.Development.json && test ! -d /usr/share/dotnet/sdk'])
            context = ssl._create_unverified_context()  # Ephemeral self-signed test certificate only.
            def request(path):
                try:
                    with urllib.request.urlopen('https://localhost:' + str(https) + path, context=context) as response:
                        return response.status, response.read()
                except urllib.error.HTTPError as response:
                    return response.code, response.read()
            status, index = request('/')
            assert status == 200 and b'<div id="root">' in index
            assert request('/student/exams') == (200, index), 'SPA fallback failed'
            assert request('/api/auth/me')[0] == 401, 'API proxy/auth readiness failed'
            assert request('/health/ready')[0] == 404, 'Internal health endpoint exposed'
            with urllib.request.urlopen('http://127.0.0.1:' + str(http) + '/healthz') as response:
                assert response.status == 200
            print('PASS: Compose startup, non-root/read-only/capabilities, no SDK/development config, SPA/fallback, HTTPS API proxy, internal health isolation')
        except subprocess.CalledProcessError as error:
            # Compose lifecycle messages contain no credentials; redact generated values defensively.
            message = error.stderr or 'No command diagnostics'
            config = json.loads((deploy / 'secrets/api-settings.json').read_text())
            private = [config['Jwt']['SigningKey'], config['BootstrapAdmin']['Password'],
                       config['ConnectionStrings']['DefaultConnection']]
            private.extend(path.read_text().strip() for path in (deploy / 'secrets').iterdir())
            for value in private:
                message = message.replace(value, '[REDACTED]')
            print(message)
            raise
        finally:
            run(command + ['down', '--volumes', '--remove-orphans'], env=env)
            print('Removed isolated Compose containers, networks and database volume:', project)


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit('Container smoke command failed; command output withheld to protect temporary secrets')
