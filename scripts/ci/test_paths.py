"""Exercise the actual dorny bundle against local, staged Git fixtures; no API."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
ACTION=os.environ.get('PATHS_FILTER_ACTION')

@unittest.skipUnless(ACTION, 'Set PATHS_FILTER_ACTION to the official bundled action')
class PathContracts(unittest.TestCase):
    def matches(self,path):
        source=(ROOT/'.github/workflows/ci.yml').read_text()
        lines=source.split('          filters: |\n',1)[1].splitlines()
        filters=[]
        for line in lines:
            if line and not line.startswith('            '):break
            filters.append(line[12:])
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            def git(*args):subprocess.run(['git',*args],cwd=root,check=True,capture_output=True)
            git('init','-q');git('-c','user.name=CI Fixture','-c','user.email=fixture@example.test','commit','--allow-empty','-qm','test: fixture base')
            file=root/path;file.parent.mkdir(parents=True,exist_ok=True);file.write_text('fixture\n');git('add',str(path))
            output=root/'output';output.touch()
            env={**os.environ,'INPUT_FILTERS':'\n'.join(filters),'INPUT_BASE':'HEAD','INPUT_TOKEN':'','GITHUB_OUTPUT':str(output),'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REPOSITORY':'fixture/fixture','GITHUB_WORKSPACE':str(root)}
            result=subprocess.run(['node',ACTION],cwd=root,env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr+result.stdout)
            values={}
            for match in re.finditer(r'([a-z0-9]+)<<([^\n]+)\n(.*?)\n\2',output.read_text(),re.S):values[match[1]]=match[3]
            keys=('code','api','e2e','perf','web','tooling')
            return {key:values.get(key)=='true' for key in keys}

    def test_docs_skip_e2e_and_integration(self):
        self.assertEqual(self.matches(Path('docs/probe.md')),dict(code=False,api=False,e2e=False,perf=False,web=False,tooling=False))

    def test_templates_codeowners_and_dependabot_skip_suites(self):
        for path in ('CODEOWNERS','.github/CODEOWNERS','.github/dependabot.yml','.github/ISSUE_TEMPLATE/bug.yml'):
            with self.subTest(path=path):
                self.assertEqual(self.matches(Path(path)),dict(code=False,api=False,e2e=False,perf=False,web=False,tooling=False))

    def test_web_runs_e2e_and_skips_k6_and_integration(self):
        value=self.matches(Path('apps/web/src/probe.ts'))
        self.assertEqual((value['code'],value['api'],value['e2e'],value['perf'],value['web']),(True,False,True,False,True))

    def test_api_only_skips_e2e(self):
        value=self.matches(Path('apps/api/src/tasks/probe.ts'))
        self.assertEqual((value['code'],value['api'],value['e2e'],value['perf'],value['web']),(True,True,False,True,False))

    def test_auth_and_health_require_e2e(self):
        for path in ('apps/api/src/auth/probe.ts','apps/api/src/health/probe.ts'):
            with self.subTest(path=path):
                self.assertTrue(self.matches(Path(path))['e2e'])

    def test_domain_runs_code_api_e2e_perf_and_bundle(self):
        value=self.matches(Path('packages/domain/src/probe.ts'))
        self.assertEqual((value['code'],value['api'],value['e2e'],value['perf'],value['web']),(True,True,True,True,True))

    def test_lockfile_workflows_and_prisma_are_fail_safe(self):
        lock=self.matches(Path('pnpm-lock.yaml'))
        self.assertEqual((lock['code'],lock['api'],lock['e2e'],lock['perf'],lock['web']),(True,True,True,True,True))
        workflow=self.matches(Path('.github/workflows/deploy.yml'))
        self.assertTrue(workflow['e2e'])
        self.assertTrue(workflow['tooling'])
        self.assertFalse(workflow['api'])
        self.assertFalse(workflow['perf'])
        ci=self.matches(Path('.github/workflows/ci.yml'))
        self.assertTrue(ci['e2e'] and ci['perf'] and ci['tooling'])
        self.assertFalse(ci['api'])
        prisma=self.matches(Path('apps/api/prisma/schema.prisma'))
        self.assertTrue(prisma['api'] and prisma['e2e'] and prisma['perf'] and prisma['code'])

    def test_bundle_script_runs_web_only(self):
        value=self.matches(Path('scripts/check-bundle-budget.mjs'))
        self.assertTrue(value['web'])
        self.assertFalse(value['e2e'] or value['api'] or value['perf'])

    def test_backlog_scripts_do_not_run_integration_or_e2e(self):
        value=self.matches(Path('scripts/backlog/probe.sh'))
        self.assertEqual((value['code'],value['api'],value['e2e'],value['perf']),(False,False,False,False))

if __name__=='__main__':unittest.main()
