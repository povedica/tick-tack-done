import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]
MOCK=r'''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
with open(os.environ['CI_MOCK_LOG'],'a') as out:
    out.write(json.dumps({'args':sys.argv[1:],'database':os.environ.get('DATABASE_URL'),'redis':os.environ.get('REDIS_URL')})+'\n')
a=' '.join(sys.argv[1:])
for arg in sys.argv[1:]:
    if arg.startswith('--outputFile='): Path(arg.split('=',1)[1]).write_text(json.dumps({'numPassedTests':11,'numFailedTests':0,'testResults':[]}))
if os.environ.get('FAIL_QUALITY') and 'lint:ci' in a: sys.exit(1)
if os.environ.get('FAIL_BENCHMARK') and 'year-index.spec.ts' in a: sys.exit(1)
if os.environ.get('FAIL_SHARD') and '--shard=4/4' in a: sys.exit(1)
'''

class CIContracts(unittest.TestCase):
    def run_script(self,name,**extra):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        root=Path(temp.name);log=root/'log';out=root/'output'
        binary=root/'bin';binary.mkdir()
        for tool in ['pnpm','docker']:
            path=binary/tool;path.write_text(MOCK);path.chmod(0o755)
        env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'CI_MOCK_LOG':str(log),'GITHUB_OUTPUT':str(out),'RUN_API':'true','RUN_BROWSER':'true','DATABASE_URL':'postgresql://fixture@localhost/base','POSTGRES_CONTAINER':'fixture','POSTGRES_CONTAINER_SHARD2':'fixture2','POSTGRES_CONTAINER_SHARD3':'fixture3','POSTGRES_CONTAINER_SHARD4':'fixture4',**extra}
        result=subprocess.run(['bash',str(ROOT/'scripts/ci'/name)],cwd=ROOT,env=env,capture_output=True,text=True)
        return result,out.read_text() if out.exists() else '',[json.loads(x) for x in log.read_text().splitlines()]

    def test_failure_is_recorded_for_required_quality_check(self):
        result,output,_=self.run_script('run-code-checks.sh',FAIL_QUALITY='1')
        self.assertEqual(result.returncode,0)
        self.assertIn('quality=1',output)
        self.assertIn('unit=0',output)

    def test_isolated_budget_failure_fails_unit_check(self):
        _,output,_=self.run_script('run-code-checks.sh',FAIL_BENCHMARK='1')
        self.assertIn('unit=1',output)

    def test_unneeded_api_and_browser_are_not_executed(self):
        _,output,calls=self.run_script('run-code-checks.sh',RUN_API='false',RUN_BROWSER='false')
        self.assertIn('browser=0',output)
        self.assertFalse(any('openapi:generate' in c['args'] or 'build' in c['args'] for c in calls))

    def test_dedicated_units_are_not_duplicated_on_shared_runner(self):
        result,_,calls=self.run_script('run-code-checks.sh',RUN_UNIT='false')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any('test:ci' in c['args'] or any('year-index.spec.ts' in x for x in c['args']) for c in calls))

    def test_integration_shards_have_distinct_databases_and_redis(self):
        result,_,calls=self.run_script('run-integration.sh')
        self.assertEqual(result.returncode,0,result.stderr)
        tests=[c for c in calls if any(arg.startswith('--shard=') for arg in c['args'])]
        self.assertEqual(len(tests),4)
        self.assertEqual(len({c['database'] for c in tests}),4)
        self.assertEqual(len({c['redis'] for c in tests}),4)

    def test_latency_group_runs_once_after_parallel_shards(self):
        result,_,calls=self.run_script('run-integration.sh')
        self.assertEqual(result.returncode,0,result.stderr)
        tests=[c for c in calls if 'vitest' in c['args']]
        self.assertEqual(len(tests),5)
        budget=tests[-1]['args']
        self.assertTrue(any(arg.startswith('--outputFile=') for arg in budget))
        self.assertFalse(any(arg.startswith('--shard=') for arg in budget))
        self.assertIn('test/stats.e2e-spec.ts',budget)

    def test_failed_integration_shard_fails_job(self):
        result,_,_=self.run_script('run-integration.sh',FAIL_SHARD='1')
        self.assertNotEqual(result.returncode,0)

if __name__=='__main__':unittest.main()
