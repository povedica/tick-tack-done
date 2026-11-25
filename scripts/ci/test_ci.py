import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
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
        args=extra.pop('args',())
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        root=Path(temp.name);log=root/'log';out=root/'output'
        binary=root/'bin';binary.mkdir()
        for tool in ['pnpm','docker']:
            path=binary/tool;path.write_text(MOCK);path.chmod(0o755)
        env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'CI_MOCK_LOG':str(log),'GITHUB_OUTPUT':str(out),'RUN_API':'true','RUN_BROWSER':'true','DATABASE_URL':'postgresql://fixture@localhost/base','POSTGRES_CONTAINER':'fixture','POSTGRES_CONTAINER_SHARD2':'fixture2','POSTGRES_CONTAINER_SHARD3':'fixture3','POSTGRES_CONTAINER_SHARD4':'fixture4',**extra}
        result=subprocess.run(['bash',str(ROOT/'scripts/ci'/name),*args],cwd=ROOT,env=env,capture_output=True,text=True)
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
        _,output,calls=self.run_script('run-code-checks.sh',RUN_API='false',RUN_BROWSER='true')
        self.assertNotIn('browser=',output)
        self.assertFalse(any('openapi:generate' in c['args'] or 'playwright' in c['args'] or 'build' in c['args'] for c in calls))

    def test_e2e_suites_use_separate_configs_and_two_workers(self):
        # e2e left run-code-checks.sh. The two configs stay: filters on the default
        # Vite server, r80 on the preview build. workers=2 is safe because each
        # spec stubs the API on its own page and artifact paths do not collide.
        r80=self.run_script('run-e2e.sh',args=('r80',))
        filters=self.run_script('run-e2e.sh',args=('filters',))
        self.assertEqual(r80[0].returncode,0,r80[0].stderr)
        self.assertEqual(filters[0].returncode,0,filters[0].stderr)
        r80_play=[c['args'] for c in r80[2] if 'playwright' in c['args'] and 'test' in c['args']]
        filter_play=[c['args'] for c in filters[2] if 'playwright' in c['args'] and 'test' in c['args']]
        self.assertEqual(len(r80_play),1)
        self.assertEqual(len(filter_play),1)
        r80_line=' '.join(r80_play[0])
        filter_line=' '.join(filter_play[0])
        self.assertIn('playwright.r80.config.ts', r80_line)
        self.assertNotIn('filters.spec.ts', r80_line)
        self.assertIn('--workers=2', r80_line)
        self.assertIn('playwright.config.ts', filter_line)
        self.assertIn('filters.spec.ts', filter_line)
        self.assertNotIn('playwright.r80.config.ts', filter_line)
        self.assertIn('--workers=2', filter_line)
        self.assertTrue(any('build' in c['args'] for c in r80[2]))
        self.assertFalse(any('build' in c['args'] for c in filters[2]))
        code=(ROOT/'scripts/ci/run-code-checks.sh').read_text()
        self.assertNotIn('playwright', code)

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


def load_preflight():
    path=ROOT/'scripts/deploy/release_preflight.py'
    spec=importlib.util.spec_from_file_location('release_preflight',path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def workflow_jobs(text):
    body=text.split('\njobs:\n',1)[1]
    names=re.findall(r'^  ([a-z0-9-]+):\n',body,re.M)
    blocks={}
    for name,block in re.findall(r'^  ([a-z0-9-]+):\n(.*?)(?=^  [a-z0-9-]+:\n|\Z)',body,re.S|re.M):
        blocks[name]=block
    return names,blocks


def suite_selected(event,group,hit='false',mode=''):
    full=(
        event=='schedule'
        or (event=='push' and hit!='true')
        or (event=='workflow_dispatch' and mode=='full')
    )
    filtered=event in ('pull_request','workflow_dispatch') and group=='true'
    return full or filtered


class WorkflowSelection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text=(ROOT/'.github/workflows/ci.yml').read_text()
        cls.names,cls.blocks=workflow_jobs(cls.text)
        cls.preflight=load_preflight()

    def test_push_no_longer_forces_every_job(self):
        self.assertNotIn("github.event_name == 'push' ||",self.text)
        self.assertNotIn('on:\n  pull_request:\n    paths:',self.text)

    def test_ci_ok_needs_every_other_job_and_fails_closed(self):
        needs_text=self.blocks['ci-ok'].split('needs:',1)[1].split('runs-on:',1)[0]
        needed=re.findall(r'([a-z0-9-]+)',needs_text)
        self.assertEqual(set(needed),set(self.names)-{'ci-ok'})
        for name in self.preflight.SUITE_JOBS:
            self.assertIn(name,needed)
            self.assertIn("needs.reuse.outputs.hit != 'true'",self.blocks[name])
            self.assertIn("github.event_name == 'schedule'",self.blocks[name])
            self.assertIn("github.event.inputs.mode == 'full'",self.blocks[name])
        self.assertIn('if: always()',self.blocks['ci-ok'])
        program=re.search(r"jq -e '([^']+)'",self.blocks['ci-ok']).group(1)
        def judge(results):
            return subprocess.run(['jq','-e',program],input=json.dumps(results),text=True,capture_output=True).returncode==0
        ok={name:{'result':'skipped'} for name in needed}
        ok['changes']={'result':'success'}
        ok['reuse']={'result':'success'}
        ok['public-tree-guard']={'result':'success'}
        self.assertTrue(judge(ok))
        failed=dict(ok)
        failed['test-unit']={'result':'failure'}
        self.assertFalse(judge(failed))
        cancelled=dict(ok)
        cancelled['e2e-r80']={'result':'cancelled'}
        self.assertFalse(judge(cancelled))

    def test_push_without_a_reused_tree_runs_full_ci_and_a_hit_skips_suites(self):
        for name,group in (
            ('code-checks','code'),('test-integration','api'),('e2e-r80','e2e'),
            ('perf-k6','perf'),('web','web'),('infra-check','tooling'),
        ):
            self.assertIn(f'outputs.{group} == \'true\'',self.blocks[name])
        self.assertTrue(suite_selected('push','false',hit='false'))
        self.assertFalse(suite_selected('push','true',hit='true'))
        self.assertTrue(suite_selected('schedule','false'))
        self.assertTrue(suite_selected('workflow_dispatch','false',mode='full'))
        self.assertFalse(suite_selected('pull_request','false'))
        self.assertTrue(suite_selected('pull_request','true'))
        self.assertFalse(suite_selected('workflow_dispatch','false',mode='filtered'))
        self.assertNotIn("needs.reuse.outputs.hit",self.blocks['public-tree-guard'])
        self.assertNotIn("needs.reuse.outputs.hit",self.blocks['issue-link'])

    def test_docs_format_is_the_complement_of_the_code_job(self):
        self.assertIn("github.event_name == 'pull_request' && needs.changes.outputs.code != 'true'",self.blocks['docs-format'])


GH=r'''#!/usr/bin/env python3
import json,os,sys
url=sys.argv[2]
open(os.environ['GH_LOG'],'a').write(url+'\n')
fixtures=json.loads(open(os.environ['GH_FIXTURES']).read())
item=fixtures.get(url)
if not item or item.get('missing'):
    sys.stderr.write('not found\n')
    sys.exit(1)
if item.get('status'):
    sys.exit(item['status'])
json.dump(item['body'],sys.stdout)
'''


class ReuseTree(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        binary=root/'bin';binary.mkdir()
        stub=binary/'gh';stub.write_text(GH);stub.chmod(0o755)
        self.fixtures={}
        self.fix=root/'fixtures.json'
        self.log=root/'gh.log';self.log.write_text('')
        self.out=root/'output'
        self.env=os.environ.copy()
        self.env['PATH']=str(binary)+os.pathsep+self.env['PATH']
        self.env['GH_FIXTURES']=str(self.fix)
        self.env['GH_LOG']=str(self.log)
        self.env['GITHUB_OUTPUT']=str(self.out)
        self.env['GITHUB_REPOSITORY']='povedica/tick-tack-done'
        self.env['GITHUB_SHA']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
        self.tree=subprocess.check_output(['git','rev-parse',self.env['GITHUB_SHA']+'^{tree}'],cwd=ROOT,text=True).strip()

    def save(self):
        self.fix.write_text(json.dumps(self.fixtures))

    def execute(self):
        self.save()
        result=subprocess.run([sys.executable,'-B',str(ROOT/'scripts/ci/reuse-tree.py')],cwd=ROOT,env=self.env,capture_output=True,text=True)
        text=self.out.read_text() if self.out.exists() else ''
        return result,text,self.log.read_text()

    def page(self,number,runs):
        self.fixtures[f'repos/povedica/tick-tack-done/actions/workflows/ci.yml/runs?event=pull_request&status=success&per_page=100&page={number}']={'body':{'workflow_runs':runs}}

    def commit(self,sha,tree):
        self.fixtures[f'repos/povedica/tick-tack-done/commits/{sha}']={'body':{'commit':{'tree':{'sha':tree}}}}

    def jobs(self,run_id,conclusion):
        self.fixtures[f'repos/povedica/tick-tack-done/actions/runs/{run_id}/jobs?per_page=100']={'body':{'jobs':[{'name':'ci-ok','conclusion':conclusion}]}}

    def test_matching_green_tree_is_reused_and_a_red_run_is_not(self):
        self.page(1,[
            {'id':1,'conclusion':'failure','event':'pull_request','head_sha':'red'},
            {'id':2,'conclusion':'cancelled','event':'pull_request','head_sha':'gone'},
            {'id':3,'conclusion':'success','event':'pull_request','head_sha':'other'},
            {'id':4,'conclusion':'success','event':'pull_request','head_sha':'same'},
        ])
        self.commit('other','b'*40)
        self.commit('same',self.tree)
        self.jobs(4,'success')
        result,text,log=self.execute()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('hit=true',text)
        self.assertNotIn('/commits/red',log)
        self.assertNotIn('/runs/1/jobs',log)

    def test_green_workflow_with_a_failed_ci_ok_is_not_reused(self):
        self.page(1,[{'id':5,'conclusion':'success','event':'pull_request','head_sha':'same'}])
        self.commit('same',self.tree)
        self.jobs(5,'failure')
        _,text,_=self.execute()
        self.assertIn('hit=false',text)

    def test_different_tree_and_empty_pages_miss(self):
        self.page(1,[{'id':6,'conclusion':'success','event':'pull_request','head_sha':'other'}])
        self.commit('other','c'*40)
        _,text,_=self.execute()
        self.assertIn('hit=false',text)

    def test_pagination_reaches_the_second_page_and_stops_at_the_cap(self):
        filler=[{'id':1000+i,'conclusion':'success','event':'pull_request','head_sha':f'h{i}'} for i in range(100)]
        self.page(1,filler)
        for i in range(100):
            self.commit(f'h{i}','d'*40)
        self.page(2,[{'id':9,'conclusion':'success','event':'pull_request','head_sha':'same'}])
        self.commit('same',self.tree)
        self.jobs(9,'success')
        _,text,log=self.execute()
        self.assertIn('hit=true',text)
        self.assertIn('page=2',log)
        self.env['REUSE_MAX_PAGES']='1'
        self.log.write_text('')
        _,text,log=self.execute()
        self.assertIn('hit=false',text)
        self.assertNotIn('page=2',log)

    def test_lookup_errors_do_not_fail_the_job_or_reuse(self):
        self.fixtures['repos/povedica/tick-tack-done/actions/workflows/ci.yml/runs?event=pull_request&status=success&per_page=100&page=1']={'status':1}
        result,text,_=self.execute()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('hit=false',text)


QUEUE=r'''#!/usr/bin/env python3
import json,os,sys
path=os.environ['GH_QUEUE']
queue=json.loads(open(path).read())
item=queue.pop(0)
open(path,'w').write(json.dumps(queue))
open(os.environ['GH_LOG'],'a').write('call\n')
if item.get('exit'):
    sys.stderr.write(item.get('stderr','fail\n'))
    sys.exit(item['exit'])
print(json.dumps(item['body']))
'''


class WaitForPushCI(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        binary=root/'bin';binary.mkdir()
        stub=binary/'gh';stub.write_text(QUEUE);stub.chmod(0o755)
        self.queue=root/'queue.json'
        self.log=root/'gh.log';self.log.write_text('')
        self.env=os.environ.copy()
        self.env.update(PATH=str(binary)+os.pathsep+self.env['PATH'],GH_QUEUE=str(self.queue),GH_LOG=str(self.log),GITHUB_REPOSITORY='povedica/tick-tack-done',GITHUB_SHA='a'*40,CI_WAIT_INTERVAL_SECONDS='0')

    def execute(self,items,budget='30'):
        self.queue.write_text(json.dumps(items))
        self.env['CI_WAIT_BUDGET_SECONDS']=budget
        return subprocess.run(['bash',str(ROOT/'scripts/ci/wait-for-push-ci.sh')],env=self.env,capture_output=True,text=True)

    def test_success_pending_then_success_and_terminal_failure(self):
        ok={'body':{'workflow_runs':[{'head_branch':'main','conclusion':'success'}]}}
        pending={'body':{'workflow_runs':[{'head_branch':'main','conclusion':None}]}}
        failed={'body':{'workflow_runs':[{'head_branch':'main','conclusion':'failure'}]}}
        self.assertEqual(self.execute([ok]).returncode,0)
        self.assertEqual(self.execute([pending,ok]).returncode,0)
        self.log.write_text('')
        result=self.execute([failed])
        self.assertEqual(result.returncode,1)
        self.assertIn('did not pass',result.stderr)
        self.assertEqual(self.log.read_text().count('call'),1)

    def test_timeout_is_not_treated_as_success(self):
        pending={'body':{'workflow_runs':[]}}
        result=self.execute([pending],budget='0')
        self.assertEqual(result.returncode,1)
        self.assertIn('Timed out',result.stderr)


class NightlyIssue(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        binary=root/'bin';binary.mkdir()
        stub=binary/'gh';stub.write_text(GH);stub.chmod(0o755)
        self.fixtures={}
        self.fix=root/'fixtures.json'
        self.log=root/'log';self.log.write_text('')
        self.posts=root/'posts'
        self.env=os.environ.copy()
        self.env.update(PATH=str(binary)+os.pathsep+self.env['PATH'],GH_FIXTURES=str(self.fix),GH_LOG=str(self.log),GITHUB_REPOSITORY='povedica/tick-tack-done',GITHUB_RUN_ID='99',GITHUB_SHA='abc',GITHUB_SERVER_URL='https://github.com',RESULTS='{}')
        # POST-aware mock replaces GH for this class.
        stub.write_text(r'''#!/usr/bin/env python3
import json,os,sys
args=sys.argv[1:]
url=next(a for a in args if a.startswith('repos/'))
open(os.environ['GH_LOG'],'a').write(('POST ' if '--method' in args else 'GET ')+url+'\n')
if '--method' in args:
    open(os.environ['GH_POSTS'],'a').write(sys.stdin.read()+'\n')
    print('{}')
else:
    print(json.dumps(json.loads(open(os.environ['GH_FIXTURES']).read())[url]))
''')
        stub.chmod(0o755)
        self.env['GH_POSTS']=str(self.posts)

    def execute(self,results):
        self.fix.write_text(json.dumps(self.fixtures))
        self.env['RESULTS']=json.dumps(results)
        return subprocess.run([sys.executable,'-B',str(ROOT/'scripts/ci/nightly-issue.py')],env=self.env,capture_output=True,text=True)

    def test_success_does_not_call_github(self):
        result=self.execute({'test-unit':{'result':'success'},'e2e-r80':{'result':'skipped'}})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(self.log.read_text(),'')

    def test_failure_opens_once_and_a_second_failure_comments_the_same_issue(self):
        self.fixtures['repos/povedica/tick-tack-done/issues?state=open&per_page=100&page=1']=[]
        result=self.execute({'test-unit':{'result':'failure'}})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('POST repos/povedica/tick-tack-done/issues\n',self.log.read_text())
        created=json.loads(self.posts.read_text().strip())
        self.assertEqual(created['title'],'CI nightly failed')
        self.log.write_text('');self.posts.write_text('')
        self.fixtures['repos/povedica/tick-tack-done/issues?state=open&per_page=100&page=1']=[
            {'number':4,'title':'CI nightly failed','pull_request':{}},
            {'number':7,'title':'CI nightly failed'},
            {'number':8,'title':'something else'},
        ]
        self.fixtures['repos/povedica/tick-tack-done/issues/7/comments?per_page=100']=[]
        result=self.execute({'e2e-filters':{'result':'cancelled'}})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('POST repos/povedica/tick-tack-done/issues/7/comments',self.log.read_text())
        self.assertNotIn('POST repos/povedica/tick-tack-done/issues\n',self.log.read_text())
        self.fixtures['repos/povedica/tick-tack-done/issues/7/comments?per_page=100']=[{'body':'https://github.com/povedica/tick-tack-done/actions/runs/99'}]
        self.log.write_text('')
        result=self.execute({'e2e-filters':{'result':'failure'}})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertNotIn('POST',self.log.read_text())

if __name__=='__main__':unittest.main()
