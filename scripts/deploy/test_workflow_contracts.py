"""Release workflow contracts, run by infra-check without extra dependencies."""
import json
import os
from pathlib import Path
import re
import subprocess
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


class PreMigrationBackupContracts(unittest.TestCase):
    def backup(self, directory, override=''):
        release=directory/'releases'/'run-1'
        release.mkdir(parents=True)
        script = r'''source "$SOURCE"
root=$RELEASE
api=staging-api
compose() {
  if [[ $1 == config ]]; then
    printf '%s\n' '{"services":{"postgres":{"environment":{"POSTGRES_DB":"fixture","POSTGRES_USER":"fixture"}},"staging-api":{"environment":{}}}}'
  else
    printf '%s\n' '-- fixture SQL'
  fi
}
backup_before_migrate
'''
        env={k:v for k,v in os.environ.items() if not k.startswith('GOOGLE_') and k not in ('BACKUP_REMOTE','PRE_MIGRATE_BACKUP_DIR','BACKUP_RETENTION_DAYS')}
        env.update(SOURCE=str(ROOT/'deploy/lib/migrate.sh'),RELEASE=str(release))
        if override: env['PRE_MIGRATE_BACKUP_DIR']=str(override)
        return subprocess.run(['bash','-euo','pipefail','-c',script],env=env,capture_output=True,text=True)

    def test_default_is_persistent_outside_releases_without_remote_credentials(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary)
            result=self.backup(directory)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(len(list((directory/'backups/pre-migrate').glob('*/db.sql.gz'))),1)
            self.assertFalse(list((directory/'releases').glob('**/db.sql.gz')))

    def test_release_paths_and_symlink_aliases_are_rejected(self):
        for kind in ('direct','symlink','parent'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                directory=Path(temporary)
                release=directory/'releases'
                release.mkdir()
                if kind=='direct': target=release/'backups'
                elif kind=='parent': target=directory/'backups/../releases/backups'
                else:
                    target=directory/'alias'
                    target.symlink_to(release,target_is_directory=True)
                result=self.backup(directory,target)
                self.assertNotEqual(result.returncode,0)
                self.assertFalse(list(release.glob('**/db.sql.gz')))

    def test_daily_cron_keeps_original_external_backup_entrypoint(self):
        source=(ROOT/'deploy/lib/migrate.sh').read_text()
        local=source.split('backup_before_migrate() (',1)[1].split('migrate_before_replace()',1)[0]
        self.assertNotRegex(local,r'GOOGLE_|BACKUP_REMOTE|seal_for_upload|scripts/backup.sh')
        self.assertIn('backup_daily_external', (ROOT/'deploy/production/cron-backup.sh').read_text())
        external=source.split('backup_daily_external() (',1)[1].split('# Local safety',1)[0]
        self.assertIn('bash "$root/scripts/backup.sh"',external)
