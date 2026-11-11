import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('env_tools', Path(__file__).with_name('env_tools.py'))
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


class SecretsTest(unittest.TestCase):
    def test_import_uses_stdin_and_never_prints_values(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'input'
            secret = 'fictional-' + os.urandom(8).hex()
            source.write_text('APP_SECRET="' + secret + '"\nEMPTY=\nPEM="line1\nline2"\n')
            calls = []
            def fake(args, data=None):
                calls.append((args, data))
                return json.dumps({'fields': []}) if args[1] == 'get' else secret
            output = io.StringIO()
            with patch.object(tools, 'op', fake), patch.object(sys, 'argv', ['tool', 'import', str(source), 'dev']), contextlib.redirect_stdout(output):
                self.assertEqual(tools.main(), 0)
            self.assertNotIn(secret, output.getvalue())
            self.assertNotIn(secret, str(calls[-1][0]))
            fields = json.loads(calls[-1][1])['fields']
            self.assertEqual(fields[0]['value'], secret)
            self.assertEqual(fields[2]['value'], 'line1\nline2')

    def test_render_atomic_private_and_preserves_special_characters(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            template, target = directory / 'template', directory / 'runtime'
            template.write_text('APP_SECRET=op://ttd/dev/APP_SECRET\n')
            value = "a$DOLLAR`command`'quote\\backslash\nsecond line"
            def fake(args, payload):
                return re.sub(r'\{\{.*?\}\}', lambda _: value, payload)
            with patch.object(tools, 'op', fake), patch.object(sys, 'argv', ['tool', 'render', str(template), str(target)]):
                self.assertEqual(tools.main(), 0)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(directory.glob('.runtime-*')), [])
            # Exercise the real Compose dotenv parser; capture all output privately.
            compose = directory / 'compose.yml'
            compose.write_text('services:\n  probe:\n    image: node:26-alpine\n    environment:\n      VALUE: ${APP_SECRET}\n')
            result = subprocess.run(['docker', 'compose', '--env-file', str(target), '-f', str(compose), 'run', '--rm', '--no-deps', '-T', 'probe', 'node', '-e', 'process.stdout.write(JSON.stringify(process.env.VALUE))'], capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout), value)

    def test_invalid_input_does_not_execute(self):
        self.assertEqual(tools.parse_env('KEY=$(touch_marker)')['KEY'], '$(touch_marker)')
        with self.assertRaises(ValueError):
            tools.parse_env('KEY=one\nKEY=two')


if __name__ == '__main__':
    unittest.main()
