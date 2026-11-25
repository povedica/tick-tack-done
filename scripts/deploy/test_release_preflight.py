"""Fixture checks for Images and CI preflight. No network."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
TARGET = 'a' * 40
OTHER = 'b' * 40


def load():
    path = ROOT / 'scripts/deploy/release_preflight.py'
    spec = importlib.util.spec_from_file_location('release_preflight', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PREFLIGHT = load()


def run(event, branch='main', conclusion='success', head=TARGET, name=''):
    return {
        'id': 123,
        'head_sha': head,
        'head_branch': branch,
        'event': event,
        'conclusion': conclusion,
        'name': name,
        'display_title': name,
    }


def plan(sha=TARGET):
    return {'sha': sha, 'api': True, 'web': True, 'api_sha': TARGET, 'web_sha': TARGET}


def jobs(conclusions):
    return [{'name': name, 'conclusion': conclusions.get(name, 'success')} for name in PREFLIGHT.SUITE_JOBS]


class ImageRunContract(unittest.TestCase):
    def test_push_and_dispatch_still_require_head_sha_and_plan_sha(self):
        for event in ('push', 'workflow_dispatch', 'pull_request'):
            for branch in ('main', 'production'):
                for conclusion in ('success', 'failure'):
                    with self.subTest(event=event, branch=branch, conclusion=conclusion):
                        item = run(event, branch, conclusion)
                        expected = branch == 'main' and event in ('push', 'workflow_dispatch') and conclusion == 'success'
                        self.assertEqual(PREFLIGHT.images_verified(item, TARGET, plan()), expected)
                        self.assertEqual(PREFLIGHT.images_candidate(item, TARGET), expected)

    def test_workflow_run_uses_plan_sha_not_the_run_head_sha(self):
        item = run('workflow_run', head=OTHER, name=f'Images {TARGET}')
        self.assertTrue(PREFLIGHT.images_candidate(item, TARGET))
        self.assertFalse(PREFLIGHT.images_verified(item, TARGET, plan(OTHER)))
        self.assertTrue(PREFLIGHT.images_verified(item, TARGET, plan(TARGET)))
        untitled = run('workflow_run', head=OTHER, name='Images')
        self.assertFalse(PREFLIGHT.images_candidate(untitled, TARGET))
        chosen = PREFLIGHT.select_images_run([untitled], TARGET, lambda _run: plan(TARGET))
        self.assertEqual(chosen, untitled)
        rejected = PREFLIGHT.select_images_run([untitled], TARGET, lambda _run: plan(OTHER))
        self.assertIsNone(rejected)


class CIRunContract(unittest.TestCase):
    def test_staging_accepts_only_a_green_push_on_main(self):
        self.assertTrue(PREFLIGHT.push_ci_succeeded([run('push')], TARGET))
        self.assertFalse(PREFLIGHT.push_ci_succeeded([run('schedule')], TARGET))
        self.assertFalse(PREFLIGHT.push_ci_succeeded([run('push', conclusion='failure')], TARGET))
        self.assertFalse(PREFLIGHT.push_ci_succeeded([run('push', branch='production')], TARGET))

    def test_production_requires_suite_jobs_that_were_not_skipped(self):
        full = jobs({})
        reused = jobs({'e2e-r80': 'skipped', 'perf-k6': 'skipped'})
        cases = (
            ('push', full, True),
            ('schedule', full, True),
            ('workflow_dispatch', full, True),
            ('push', reused, False),
            ('pull_request', full, False),
            ('push', jobs({'web': 'skipped'}), False),
        )
        for event, suite, expected in cases:
            with self.subTest(event=event, expected=expected):
                item = run(event)
                found = PREFLIGHT.full_ci_run([item], {item['id']: suite}, TARGET)
                self.assertEqual(found is not None, expected)

    def test_verify_images_cli_reads_fixtures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            run_path = root / 'run.json'
            plan_path = root / 'plan.json'
            run_path.write_text(json.dumps(run('workflow_run', head=OTHER, name=f'Images {TARGET}')))
            plan_path.write_text(json.dumps(plan()))
            ok = subprocess.run(
                [
                    'python3', '-B', str(ROOT / 'scripts/deploy/release_preflight.py'),
                    'verify-images', '--run', str(run_path), '--plan', str(plan_path), '--target', TARGET,
                ],
                capture_output=True, text=True,
            )
            self.assertEqual(ok.returncode, 0, ok.stderr)
            plan_path.write_text(json.dumps(plan(OTHER)))
            bad = subprocess.run(
                [
                    'python3', '-B', str(ROOT / 'scripts/deploy/release_preflight.py'),
                    'verify-images', '--run', str(run_path), '--plan', str(plan_path), '--target', TARGET,
                ],
                capture_output=True, text=True,
            )
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn('real target SHA', bad.stderr)


if __name__ == '__main__':
    unittest.main()
