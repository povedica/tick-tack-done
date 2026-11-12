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
            for match in re.finditer(r'([a-z]+)<<([^\n]+)\n(.*?)\n\2',output.read_text(),re.S):values[match[1]]=match[3]
            return {key:values.get(key)=='true' for key in ['code','api','browser','tooling']}

    def test_docs_skip_integration_and_browser(self):
        self.assertEqual(self.matches(Path('docs/probe.md')),dict(code=False,api=False,browser=False,tooling=False))

    def test_web_skips_integration(self):
        value=self.matches(Path('apps/web/src/probe.ts'))
        self.assertEqual((value['code'],value['api'],value['browser']),(True,False,True))

    def test_api_skips_browser(self):
        value=self.matches(Path('apps/api/src/tasks/probe.ts'))
        self.assertEqual((value['code'],value['api'],value['browser']),(True,True,False))

    def test_auth_requires_browser_contracts(self):
        self.assertTrue(self.matches(Path('apps/api/src/auth/probe.ts'))['browser'])

    def test_domain_runs_all_code_checks(self):
        value=self.matches(Path('packages/domain/src/probe.ts'))
        self.assertEqual((value['code'],value['api'],value['browser']),(True,True,True))

    def test_backlog_scripts_do_not_run_integration_or_browser(self):
        value=self.matches(Path('scripts/backlog/probe.sh'))
        self.assertEqual((value['code'],value['api'],value['browser']),(False,False,False))

if __name__=='__main__':unittest.main()
