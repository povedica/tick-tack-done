import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('env_tools', Path(__file__).with_name('env_tools.py'))
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


class SecretsTest(unittest.TestCase):
    def test_check_only_names_without_reveal(self):
        calls = []
        def fake(args):
            calls.append(args)
            return json.dumps([{'name': 'APP_SECRET', 'value': 'concealed'}])
        output = io.StringIO()
        with patch.object(tools, 'op', fake), patch.object(tools, 'names', lambda: {'APP_SECRET'}), patch.object(sys, 'argv', ['tool', 'check', 'ttd-staging']), contextlib.redirect_stdout(output):
            self.assertEqual(tools.main(), 0)
        self.assertEqual(calls, [['environment', 'secret', 'list', 'ttd-staging', '--format=json']])
        self.assertNotIn('concealed', output.getvalue())

    def test_render_pem_and_special_values_survive_real_compose_config(self):
        values = {
            'TICKY_JWT_PRIVATE_KEY_PEM': '-----BEGIN PRIVATE KEY-----\nfictional$PEM\n-----END PRIVATE KEY-----\n',
            'APP_SECRET': "fictional$DOLLAR`command`'quote\\backslash\nsecond line",
            'EMPTY': '',
        }
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            target = directory / 'runtime.env'
            target.write_text('previous')
            calls = []
            def fake(args):
                calls.append(args)
                if args[-1] == '--format=dotenv':
                    # Deliberately incompatible quoting: renderer must detect and repair it.
                    return 'APP_SECRET=fictional$DOLLAR\nTICKY_JWT_PRIVATE_KEY_PEM=lost-newlines\n'
                return json.dumps([{'name': k, 'value': v} for k, v in {**values, 'GIT_COMMIT': 'ignored'}.items()])
            output = io.StringIO()
            with patch.object(tools, 'op', fake), patch.object(sys, 'argv', ['tool', 'render', 'fixture-id', str(target)]), contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                self.assertEqual(tools.main(), 0)
            self.assertEqual(output.getvalue(), '')
            self.assertEqual(calls, [['environment', 'secret', 'list', 'fixture-id', '--reveal', '--format=json'], ['environment', 'secret', 'list', 'fixture-id', '--reveal', '--format=dotenv']])
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(list(directory.glob('.runtime-*')), [])
            compose = directory / 'compose.yml'
            compose.write_text('services:\n  probe:\n    image: node:26-alpine\n    env_file: ' + str(target) + '\n')
            result = subprocess.run(['docker', 'compose', '--env-file', str(target), '-f', str(compose), 'config', '--format', 'json'], capture_output=True, text=True, check=True)
            # Compose serializes dollars escaped so its output can be reused safely.
            configured = json.loads(result.stdout)['services']['probe']['environment']
            self.assertEqual(configured, {k: v.replace('$', '$$') for k, v in values.items()})
            canonical = directory / 'resolved.json'
            canonical.write_text(result.stdout)
            expression = 'process.stdout.write(JSON.stringify(Object.fromEntries(' + json.dumps(list(values)) + '.map(k=>[k,process.env[k]]))))'
            executed = subprocess.run(['docker', 'compose', '-f', str(canonical), 'run', '--rm', '--no-deps', '-T', 'probe', 'node', '-e', expression], capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(executed.stdout), values)

    def test_compatible_cli_dotenv_is_used_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'runtime.env'
            dotenv = 'APP_SECRET="fictional-value"\n'
            tools.write_env({'APP_SECRET': 'fictional-value'}, target, dotenv)
            self.assertEqual(target.read_text(), dotenv)

    def test_failed_render_preserves_previous_file_and_logs_no_values(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'runtime.env'
            target.write_text('previous')
            with patch.object(tools, 'op', return_value='not JSON'), patch.object(sys, 'argv', ['tool', 'render', 'fixture-id', str(target)]):
                with self.assertRaises(ValueError):
                    tools.main()
            self.assertEqual(target.read_text(), 'previous')


if __name__ == '__main__':
    unittest.main()
