"""Safety regressions for the publication gate; no network or registry mutations."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('container_image', Path(__file__).with_name('container-image.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
REVISION = 'a' * 40


def archive(path, user='1654', revision=REVISION, corrupt=False):
    entries = {}
    def blob(value):
        raw = json.dumps(value).encode()
        digest = hashlib.sha256(raw).hexdigest()
        entries['blobs/sha256/' + digest] = raw
        return {'digest': 'sha256:' + digest}
    config = blob({'os': 'linux', 'architecture': 'amd64', 'config': {
        'User': user, 'ExposedPorts': {'8080/tcp': {}}, 'Labels': {
            'org.opencontainers.image.source': module.SOURCE,
            'org.opencontainers.image.revision': revision}}})
    manifest = blob({'config': config, 'layers': []})
    entries['index.json'] = json.dumps({'manifests': [manifest]}).encode()
    if corrupt:
        entries['blobs/sha256/' + config['digest'].split(':')[1]] = b'{}'
    with tarfile.open(path, 'w') as output:
        for name, value in entries.items():
            info = tarfile.TarInfo(name); info.size = len(value)
            output.addfile(info, io.BytesIO(value))
    return manifest['digest']


class ImageGateTests(unittest.TestCase):
    def test_metadata_rejects_root_wrong_revision_and_corruption(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / 'image.tar'
            expected = archive(path)
            self.assertEqual(module.inspect_archive(path, 'api', REVISION), expected)
            for args in ({'user': '0'}, {'revision': 'b' * 40}, {'corrupt': True}):
                archive(path, **args)
                with self.assertRaises(ValueError):
                    module.inspect_archive(path, 'api', REVISION)

    def test_unpack_rejects_path_traversal_and_corrupt_layers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / 'image.tar'
            archive(path)
            module.unpack_layout(path, root / 'valid')
            self.assertTrue((root / 'valid/index.json').is_file())
            with tarfile.open(path, 'a') as output:
                member = tarfile.TarInfo('../escaped'); member.size = 1
                output.addfile(member, io.BytesIO(b'x'))
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                module.unpack_layout(path, root / 'unsafe')
            self.assertFalse((root / 'escaped').exists())
            archive(path, corrupt=True)
            with self.assertRaisesRegex(ValueError, 'digest mismatch'):
                module.unpack_layout(path, root / 'corrupt')

    def test_registry_auth_failure_is_not_a_missing_tag(self):
        result = type('Result', (), {'returncode': 1, 'stderr': b'unauthorized', 'stdout': b''})()
        with patch.object(module.subprocess, 'run', return_value=result):
            with self.assertRaises(RuntimeError):
                module.remote_digest('image', 'tag', '/tmp/auth')
            result.stderr = b'manifest unknown'
            self.assertIsNone(module.remote_digest('image', 'tag', '/tmp/auth'))

    def test_collision_prevents_all_pushes(self):
        env = {'GITHUB_SHA': REVISION, 'GITHUB_REF': 'refs/heads/main',
               'GITHUB_EVENT_NAME': 'push', 'GITHUB_REPOSITORY': 'vinhphuc2903/SLES'}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, env):
            root = Path(directory)
            for component in ('api', 'web'):
                path = root / ('container-image-' + component) / 'image.tar'
                path.parent.mkdir(); archive(path)
            with patch.object(module, 'remote_digest', side_effect=[None, 'sha256:other']), patch.object(module.subprocess, 'run') as command:
                with self.assertRaisesRegex(ValueError, 'immutable'):
                    module.publish(root)
                command.assert_not_called()

    def test_success_copies_exact_archives_and_records_both_digests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            expected = []
            for component in ('api', 'web'):
                path = root / ('container-image-' + component) / 'image.tar'
                path.parent.mkdir(); expected.append(archive(path))
            env = {'GITHUB_SHA': REVISION, 'GITHUB_REF': 'refs/heads/main',
                   'GITHUB_EVENT_NAME': 'push', 'GITHUB_REPOSITORY': 'vinhphuc2903/SLES',
                   'GITHUB_STEP_SUMMARY': str(root / 'summary')}
            # Two preflight misses followed by verification of SHA/main for each image.
            with patch.dict(os.environ, env), patch.object(module, 'remote_digest',
                    side_effect=[None, None, expected[0], expected[0], expected[1], expected[1]]), \
                    patch.object(module.subprocess, 'run') as command:
                module.publish(root)
                self.assertEqual(command.call_count, 4)
                for call in command.call_args_list:
                    self.assertIn('--preserve-digests', call.args[0])
                    self.assertTrue(call.args[0][-2].startswith('oci-archive:'))
            report = (root / 'published.txt').read_text()
            self.assertIn('sles-api@' + expected[0], report)
            self.assertIn('sles-web@' + expected[1], report)

    def test_pr_and_untrusted_manual_publish_are_rejected(self):
        for event, ref in [('pull_request', 'refs/pull/1/merge'), ('workflow_dispatch', 'refs/heads/feature')]:
            with patch.dict(os.environ, {'GITHUB_SHA': REVISION, 'GITHUB_REF': ref,
                 'GITHUB_EVENT_NAME': event, 'GITHUB_REPOSITORY': 'vinhphuc2903/SLES'}):
                with self.assertRaisesRegex(ValueError, 'not authorized'):
                    module.publish(Path('/unused'))


if __name__ == '__main__':
    unittest.main()
