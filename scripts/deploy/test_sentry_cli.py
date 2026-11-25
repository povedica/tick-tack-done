"""Clean-runner contract for the pinned sentry-cli download."""

import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'deploy' / 'lib' / 'sentry-cli.sh'
PINNED = 'c958865f9d4000183509ea21b1f04925d5390de6d8d87386b9e69f2b305070c3'


class SentryCliTest(unittest.TestCase):
    def test_clean_runner_stdout_is_only_an_executable_path(self):
        source = SCRIPT.read_text()
        self.assertIn('sha256sum -c --quiet - >&2', source)
        fixture = b'#!/bin/sh\nprintf fixture\n'
        digest = hashlib.sha256(fixture).hexdigest()
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            runner = root / 'runner'
            runner.mkdir()
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            payload = root / 'payload'
            payload.write_bytes(fixture)
            curl = bin_dir / 'curl'
            curl.write_text(
                '#!/bin/sh\n'
                'out=\n'
                'prev=\n'
                'for arg in "$@"; do\n'
                '  if [ "$prev" = "-o" ]; then out=$arg; fi\n'
                '  prev=$arg\n'
                'done\n'
                f'cp {payload} "$out"\n'
            )
            curl.chmod(0o755)
            script = root / 'sentry-cli.sh'
            script.write_text(source.replace(PINNED, digest))
            script.chmod(0o755)
            env = os.environ.copy()
            env['PATH'] = f'{bin_dir}{os.pathsep}{env["PATH"]}'
            env['RUNNER_TEMP'] = str(runner)
            env.pop('SENTRY_CLI_BIN', None)
            result = subprocess.run(
                ['bash', str(script)],
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            path = result.stdout.strip()
            self.assertEqual(result.stdout, f'{path}\n')
            self.assertNotIn('OK', result.stdout)
            self.assertTrue(path.startswith(str(runner)))
            self.assertTrue(os.access(path, os.X_OK))
            self.assertEqual(Path(path).read_bytes(), fixture)
            curl.write_text('#!/bin/sh\nexit 1\n')
            again = subprocess.run(
                ['bash', str(script)],
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(again.returncode, 0, again.stderr)
            self.assertEqual(again.stdout, f'{path}\n')


if __name__ == '__main__':
    unittest.main()
