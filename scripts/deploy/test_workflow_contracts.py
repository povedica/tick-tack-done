"""Release workflow contracts, run by infra-check without extra dependencies."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
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


GH_STUB = r'''#!/usr/bin/env python3
import os, sys
open(os.environ["GH_LOG"], "a").write(" ".join(sys.argv[1:]) + "\n")
if os.environ.get("GH_REJECT") == "1":
    sys.stderr.write("gh should not have been called\n")
    sys.exit(9)
target = next((arg for arg in sys.argv[1:] if arg.startswith("repos/")), "")
number = target.rsplit("/", 1)[-1]
if os.environ.get("ISSUE_HTTP") == "500":
    sys.stderr.write("HTTP 500: server error\n")
    sys.exit(1)
if os.environ.get("ISSUE_HTTP") == "404" or number == "404":
    sys.stderr.write("gh: Not Found (HTTP 404)\n")
    sys.exit(1)
print(os.environ.get("ISSUE_STATE", "open"))
'''


class IssueLinkContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        bindir = root / 'bin'
        bindir.mkdir()
        stub = bindir / 'gh'
        stub.write_text(GH_STUB)
        stub.chmod(0o755)
        self.event = root / 'event.json'
        self.log = root / 'gh.log'
        self.log.write_text('')
        self.env = os.environ.copy()
        self.env.pop('ISSUE_STATES', None)
        self.env['PATH'] = str(bindir) + os.pathsep + self.env.get('PATH', '')
        self.env['GH_LOG'] = str(self.log)
        self.env['GITHUB_EVENT_PATH'] = str(self.event)
        self.env['GITHUB_REPOSITORY'] = 'povedica/tick-tack-done'
        self.env['ISSUE_STATE'] = 'open'

    def write_event(self, author, body, **extra):
        pull = {'user': {'login': author}, 'body': body}
        pull.update(extra)
        self.event.write_text(json.dumps({'pull_request': pull}))

    def run_check(self):
        return subprocess.run(
            [sys.executable, '-B', str(ROOT / 'scripts/ci/issue_link.py')],
            env=self.env,
            capture_output=True,
            text=True,
        )

    def test_ci_ok_needs_issue_link_on_description_edits(self):
        text = workflow('ci.yml')
        triggers = text.split('\njobs:', 1)[0]
        pull = re.search(r'^  pull_request:\n((?:    .*\n)+)', triggers, re.MULTILINE).group(1)
        for action in ('opened', 'edited', 'synchronize', 'reopened'):
            self.assertIn(action, pull)
        link = job(text, 'issue-link')
        for action in ('opened', 'edited', 'synchronize', 'reopened'):
            self.assertIn("github.event.action == '%s'" % action, link)
        self.assertIn("github.event_name == 'pull_request'", link)
        self.assertIn('python3 scripts/ci/issue_link.py', link)
        self.assertIn('issues: read', link)
        self.assertIn('GH_TOKEN: ${{ github.token }}', link)
        self.assertNotIn('continue-on-error', link)
        self.assertNotIn('sin-backlog', link)
        ok = job(text, 'ci-ok')
        self.assertIn('issue-link', ok)
        self.assertIn('if: always()', ok)

    def test_only_dependabot_bot_is_named_exempt(self):
        source = (ROOT / 'scripts/ci/issue_link.py').read_text()
        self.assertEqual(source.count("EXEMPT_AUTHOR = 'dependabot[bot]'"), 1)
        self.assertNotIn('sin-backlog', source)
        self.assertNotIn('github-actions', source)
        self.assertNotIn("== 'app/dependabot'", source)

    def test_open_issue_on_the_first_line_passes(self):
        self.write_event('developer', 'Closes #12\n\n- Agente: cursor-harness-1\n')
        self.env['ISSUE_STATES'] = json.dumps({'12': 'open'})
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('Closes #12 está abierta', result.stdout)
        self.assertEqual(self.log.read_text(), '')

    def test_body_must_start_with_closes_and_the_issue_must_be_open(self):
        cases = (
            ('developer', 'Fixes #12', {'12': 'open'}, 1, 'no empieza por'),
            ('developer', 'closes #12', {'12': 'open'}, 1, 'no empieza por'),
            ('developer', 'Nota\nCloses #12', {'12': 'open'}, 1, 'no empieza por'),
            ('developer', '  Closes #12', {'12': 'open'}, 1, 'no empieza por'),
            ('developer', '', {'12': 'open'}, 1, 'no empieza por'),
            ('developer', 'Closes #12.', {'12': 'open'}, 0, 'está abierta'),
            ('developer', 'Closes #12', {'12': 'closed'}, 1, 'está cerrada'),
            ('developer', 'Closes #12', {'12': 'closed'}, 1, 'no se reabre'),
            ('developer', 'Closes #99', {}, 1, 'no existe'),
            ('github-actions[bot]', '', {}, 1, 'no empieza por'),
            ('app/dependabot', 'Bumps vite', {}, 1, 'no empieza por'),
            ('dependabot[bot]', '', {}, 0, 'queda exento'),
            ('dependabot[bot]', 'Closes #12', {'12': 'closed'}, 0, 'queda exento'),
            (
                'developer',
                '<!-- CURSOR_AGENT_PR_BODY_BEGIN -->\nCloses #12\n',
                {'12': 'open'},
                0,
                'está abierta',
            ),
            (
                'developer',
                '<!-- CURSOR_AGENT_PR_BODY_BEGIN -->\nFixes #12\n',
                {'12': 'open'},
                1,
                'no empieza por',
            ),
            (
                'developer',
                '<!-- otro -->\nCloses #12\n',
                {'12': 'open'},
                1,
                'no empieza por',
            ),
        )
        for author, body, states, code, needle in cases:
            with self.subTest(author=author, body=body, states=states):
                self.write_event(author, body, labels=[{'name': 'sin-backlog'}])
                self.env['ISSUE_STATES'] = json.dumps(states)
                result = self.run_check()
                self.assertEqual(result.returncode, code, result.stdout + result.stderr)
                self.assertIn(needle, result.stdout)

    def test_lookup_uses_rest_issue_state_and_fails_closed(self):
        self.write_event('developer', 'Closes #12')
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('repos/povedica/tick-tack-done/issues/12', self.log.read_text())
        self.assertIn('--jq .state', self.log.read_text())

        self.log.write_text('')
        self.env['ISSUE_HTTP'] = '404'
        self.write_event('developer', 'Closes #12')
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('no existe', result.stdout)

        self.env['ISSUE_HTTP'] = '500'
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn('No pude leer la issue #12', result.stdout)
        self.assertNotIn('no existe', result.stdout)

    def test_dependabot_does_not_call_github(self):
        self.env['GH_REJECT'] = '1'
        self.write_event('dependabot[bot]', '')
        result = self.run_check()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('queda exento', result.stdout)
        self.assertFalse(self.log.exists() and self.log.read_text())
