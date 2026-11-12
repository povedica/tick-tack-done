import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'ci/image-plan.py'


class ImagePlanTest(unittest.TestCase):
    def test_unapproved_api_change_is_not_lost_by_following_web_push(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=directory, text=True, stderr=subprocess.DEVNULL).strip()
            git('init')
            git('config', 'user.email', 'fixture@example.invalid')
            git('config', 'user.name', 'Fixture')
            for name in ['apps/api/source', 'apps/web/source']:
                path = directory / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('baseline')
            git('add', '.')
            git('commit', '-m', 'baseline deployed')
            baseline = git('rev-parse', 'HEAD')
            (directory / 'apps/api/source').write_text('api change never approved')
            git('commit', '-am', 'API push not deployed')
            api = git('rev-parse', 'HEAD')
            (directory / 'apps/web/source').write_text('subsequent web change')
            git('commit', '-am', 'web push')
            web = git('rev-parse', 'HEAD')
            plan = json.loads(subprocess.check_output(['python3', str(SCRIPT)], cwd=directory))
            self.assertEqual(plan['api_sha'], api)
            self.assertEqual(plan['web_sha'], web)
            self.assertNotEqual(plan['api_sha'], baseline)
            # A later deploy-only push still carries both required revisions.
            (directory / 'deploy').mkdir()
            (directory / 'deploy/config').write_text('config')
            git('add', '.')
            git('commit', '-m', 'configuration change')
            later = json.loads(subprocess.check_output(['python3', str(SCRIPT)], cwd=directory))
            self.assertEqual(later['api_sha'], api)
            self.assertEqual(later['web_sha'], web)

    def test_workflow_keeps_component_identities_distinct(self):
        text = (SCRIPT.parents[2] / '.github/workflows/images.yml').read_text()
        api = text.split('\n  api:\n', 1)[1].split('\n  web:\n', 1)[0]
        web = text.split('\n  web:\n', 1)[1].split('\n  deployment-plan:\n', 1)[0]
        self.assertIn('tick-tack-done-api:${{ needs.changes.outputs.api_sha }}', api)
        self.assertNotIn('outputs.web_sha', api)
        self.assertIn('tick-tack-done-web:${{ needs.changes.outputs.web_sha }}', web)
        self.assertNotIn('outputs.api_sha', web)
