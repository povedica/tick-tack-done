"""Release workflow contracts, run by infra-check without extra dependencies."""
import json
import os
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]


def workflow(name):
    return (ROOT / '.github/workflows' / name).read_text()


def job(text, name):
    return re.search(rf'^  {re.escape(name)}:\n(.*?)(?=^  [\w-]+:|\Z)', text,
                     re.MULTILINE | re.DOTALL).group(1)


class WorkflowContracts(unittest.TestCase):
    def test_production_is_independent_of_staging(self):
        production = job(workflow('deploy.yml'), 'deploy-production')
        self.assertRegex(production, r'needs: preflight\n')
        self.assertNotIn('deploy-staging', production)
        self.assertIn("outputs.environment == 'production'", production)

    def test_production_push_does_not_build_or_run_ci_or_security(self):
        for name in ('images.yml', 'ci.yml', 'security.yml'):
            with self.subTest(workflow=name):
                triggers = workflow(name).split('\njobs:', 1)[0]
                push = re.search(r'^  push:\n((?:    .*\n)+)', triggers,
                                 re.MULTILINE).group(1)
                self.assertRegex(push, r'branches: \[main\]')
                self.assertNotIn('production', push)

    def test_deployment_cannot_build_or_publish_images(self):
        deploy = workflow('_deploy.yml')
        self.assertNotRegex(deploy, r'docker/(?:build-push|setup-buildx|login)-action')
        self.assertNotRegex(deploy, r'\b(?:docker|buildx)\s+(?:build|push)\b')
        self.assertNotRegex(deploy, r'packages: write')

    def test_site_key_guard_runs_before_new_image_build_only(self):
        web = job(workflow('images.yml'), 'web')
        guard = web.split('      - name: Require the variant reCAPTCHA site key before publishing\n', 1)[1]
        guard, build = re.split(r'      - uses: docker/build-push-action@v[0-9]+', guard, maxsplit=1)
        self.assertIn("if: steps.existing.outputs.exists != 'true'", guard)
        self.assertIn("if: steps.existing.outputs.exists != 'true'", build)
        selection = "vars[matrix.suffix == 'prod' && 'VITE_RECAPTCHA_PRODUCTION_SITE_KEY' || 'VITE_RECAPTCHA_SITE_KEY']"
        self.assertIn('SITE_KEY: ${{ ' + selection + ' }}', guard)
        self.assertIn('VITE_RECAPTCHA_SITE_KEY=${{ ' + selection + ' }}', build)
        script = '\n'.join(line[10:] for line in guard.split('        run: |\n', 1)[1].splitlines())
        self.assertNotIn('${{', script)
        for suffix, variable in (('prod', 'VITE_RECAPTCHA_PRODUCTION_SITE_KEY'),
                                 ('staging', 'VITE_RECAPTCHA_SITE_KEY')):
            for key in ('', 'public-fixture-key'):
                with self.subTest(suffix=suffix, missing=not key):
                    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', script],
                                            env=dict(os.environ, SITE_KEY=key, SUFFIX=suffix),
                                            capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0 if key else 1)
                    if not key:
                        self.assertIn('::error::Missing ' + variable, result.stdout)
                        self.assertIn('Environment staging or as a repository variable', result.stdout)
                    else:
                        self.assertNotIn(key, result.stdout + result.stderr)

    def test_images_accepts_dispatch_on_main_but_ci_still_requires_push(self):
        deploy = workflow('_deploy.yml')
        ci_query, image_queries = deploy.split('          if [[ -z "$IMAGE_RUN" ]]', 1)
        self.assertIn('.head_branch == "main" and .event == "push"', ci_query)
        queries = re.findall(r"--jq '([^']+)'", image_queries)
        lookup = queries[0]
        validation = re.search(r"jq -e --arg sha \"\$TARGET\" '([^']+)'", image_queries).group(1)
        for event in ('push', 'workflow_dispatch', 'pull_request'):
            for branch in ('main', 'production'):
                for conclusion in ('success', 'failure'):
                    with self.subTest(event=event, branch=branch, conclusion=conclusion):
                        run = dict(id=123, head_sha='a' * 40, head_branch=branch,
                                   event=event, conclusion=conclusion)
                        expected = branch == 'main' and event in ('push', 'workflow_dispatch') and conclusion == 'success'
                        # Lookup endpoint is already filtered by status=success.
                        found = subprocess.check_output(['jq', '-r', lookup], text=True,
                                                       input=json.dumps({'workflow_runs': [run] if conclusion == 'success' else []})).strip()
                        checked = subprocess.run(['jq', '-e', '--arg', 'sha', 'a' * 40, validation],
                                                 input=json.dumps(run), text=True, capture_output=True)
                        self.assertEqual(found == '123', expected)
                        self.assertEqual(checked.returncode == 0, expected)
