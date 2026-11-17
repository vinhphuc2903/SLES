#!/usr/bin/env python3
"""Validate OCI archives; publish only the exact validated/scanned manifests.

Only allowlisted OCI files are unpacked for Trivy; no shell interpolation or secret logging.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

SOURCE = 'https://github.com/vinhphuc2903/SLES'


def inspect_archive(path, component, revision):
    if component not in ('api', 'web') or not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise ValueError('Invalid component or revision')
    with tarfile.open(path) as archive:
        def read(name):
            member = archive.getmember(name)
            if not member.isfile() or member.size > 16 * 1024 * 1024:
                raise ValueError('Invalid OCI metadata member')
            return archive.extractfile(member).read()

        def blob(descriptor):
            digest = descriptor['digest']
            if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
                raise ValueError('Invalid OCI digest')
            raw = read('blobs/sha256/' + digest.split(':')[1])
            if 'sha256:' + hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError('OCI metadata digest mismatch')
            return json.loads(raw)

        index = json.loads(read('index.json'))
        if len(index['manifests']) != 1:
            raise ValueError('Expected one linux/amd64 image, without attestations')
        descriptor = index['manifests'][0]
        manifest = blob(descriptor)
        config = blob(manifest['config'])
        if config['os'] != 'linux' or config['architecture'] != 'amd64':
            raise ValueError('Unexpected platform')
        runtime = config['config']
        user = runtime.get('User', '').split(':')[0]
        if user not in ('1654', 'nginx', '101'):
            raise ValueError('Expected known non-root runtime user')
        labels = runtime.get('Labels', {})
        if labels.get('org.opencontainers.image.source') != SOURCE or labels.get('org.opencontainers.image.revision') != revision:
            raise ValueError('Source/revision metadata mismatch')
        if '8080/tcp' not in runtime.get('ExposedPorts', {}):
            raise ValueError('Missing runtime port')
        for entry in runtime.get('Env', []):
            key, _, value = entry.partition('=')
            if value and any(word in key.lower() for word in ('password', 'signingkey', 'connectionstrings', 'token', 'secret')):
                raise ValueError('Unexpected private configuration in image')
        return descriptor['digest']


def unpack_layout(path, destination):
    """Trivy accepts an OCI directory, not an OCI tar (unlike Skopeo)."""
    destination.mkdir(parents=True, exist_ok=False)
    with tarfile.open(path) as archive:
        for member in archive:
            if member.isdir() and member.name in ('blobs', 'blobs/sha256'):
                continue
            if not member.isfile() or not (member.name in ('index.json', 'oci-layout') or
                    re.fullmatch(r'blobs/sha256/[0-9a-f]{64}', member.name)):
                raise ValueError('Unsafe OCI archive member')
            target = destination / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as output:
                shutil.copyfileobj(archive.extractfile(member), output)
            if member.name.startswith('blobs/'):
                digest = hashlib.sha256()
                with target.open('rb') as source:
                    for chunk in iter(lambda: source.read(1024 * 1024), b''):
                        digest.update(chunk)
                if digest.hexdigest() != target.name:
                    raise ValueError('OCI blob digest mismatch')


def remote_digest(image, tag, authfile):
    result = subprocess.run(['skopeo', 'inspect', '--authfile', authfile, '--raw',
                             'docker://' + image + ':' + tag], capture_output=True)
    if result.returncode == 0:
        return 'sha256:' + hashlib.sha256(result.stdout).hexdigest()
    # Only a missing manifest permits creation. Auth/network failures are blockers.
    error = result.stderr.decode(errors='replace').lower()
    if 'manifest unknown' in error or 'name unknown' in error:
        return None
    raise RuntimeError('Registry inspection failed; check authentication/connectivity')


def publish(root):
    revision = os.environ['GITHUB_SHA']
    ref = os.environ['GITHUB_REF']
    event = os.environ['GITHUB_EVENT_NAME']
    if os.environ.get('GITHUB_REPOSITORY') != 'vinhphuc2903/SLES':
        raise ValueError('Publishing is restricted to the source repository')
    if not (event == 'push' and (ref == 'refs/heads/main' or re.fullmatch(r'refs/tags/v\d+\.\d+\.\d+', ref)) or
            event == 'workflow_dispatch' and ref == 'refs/heads/main' and
            json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text()).get('inputs', {}).get('publish') in (True, 'true')):
        raise ValueError('Publishing is not authorized for this event/ref')
    immutable = ['sha-' + revision[:12]]
    if ref.startswith('refs/tags/'):
        immutable.append(ref.removeprefix('refs/tags/'))
    authfile = str(Path.home() / '.docker/config.json')
    planned = []
    for component in ('api', 'web'):
        path = root / ('container-image-' + component) / 'image.tar'
        digest = inspect_archive(path, component, revision)
        image = 'ghcr.io/vinhphuc2903/sles-' + component
        for tag in immutable:
            existing = remote_digest(image, tag, authfile)
            if existing is not None and existing != digest:
                raise ValueError('Refusing to replace immutable tag ' + image + ':' + tag)
        planned.append((path, image, digest))
    # Both images pass preflight before any mutation. The job is serialized in Actions.
    output = root / 'published.txt'
    for path, image, digest in planned:
        tags = immutable + (['main'] if ref == 'refs/heads/main' else [])
        for tag in tags:
            subprocess.run(['skopeo', 'copy', '--authfile', authfile, '--preserve-digests',
                            'oci-archive:' + str(path), 'docker://' + image + ':' + tag], check=True)
            if remote_digest(image, tag, authfile) != digest:
                raise ValueError('Published digest mismatch')
            with output.open('a') as report:
                report.write(image + ':' + tag + ' -> ' + image + '@' + digest + '\n')
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
        summary.write('### Published images\n\n```text\n' + output.read_text() + '```\n')


if __name__ == '__main__':
    if sys.argv[1] == 'validate':
        path = Path(sys.argv[2])
        digest = inspect_archive(path, sys.argv[3], sys.argv[4])
        path.with_name('digest.txt').write_text(digest + '\n')
        if len(sys.argv) == 6:
            unpack_layout(path, Path(sys.argv[5]))
        print('Validated image manifest:', digest)
    elif sys.argv[1] == 'publish':
        publish(Path(sys.argv[2]))
    else:
        raise SystemExit('Expected validate or publish')
