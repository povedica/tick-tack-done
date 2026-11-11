import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
MOCK = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
args=sys.argv[1:]
state=Path(os.environ['MOCK_STATE'])
data=json.loads(state.read_text())
name=Path(sys.argv[0]).name
if name=='sleep':
    import time; time.sleep(.05); sys.exit()
if name=='curl':
    bad=os.environ.get('FAIL_HEALTH')=='1' and 'new' in ''.join(data.values())
    if bad: sys.exit(22)
    print(json.dumps({'status':'ok','commit':('b' if data['staging-api']=='api:new' else 'a')*40})); sys.exit()
with open(os.environ['MOCK_LOG'],'a') as log: log.write(json.dumps(args)+'\n')
if args[:2]==['image','inspect']:
    print(json.dumps(['GIT_COMMIT='+('b' if args[2]=='api:new' else 'a')*40])); sys.exit()
if args[0]=='inspect':
    print(data[args[-1]]); sys.exit()
if args[0]=='run':
    if os.environ.get('FAIL_MIGRATE')=='1' and 'migrate' in args: sys.exit(1)
    print('new-migrations' if 'api:new' in args and os.environ.get('NEW_MIGRATION')=='1' else 'same-migrations');sys.exit()
if args[0]=='compose':
    for command in ['config','ps','pull','up','exec']:
        if command not in args: continue
        if command=='config' and 'json' in args:
            print(json.dumps({'services':{'staging-api':{'environment':{'PUBLIC_URL':'https://staging-todo.reflexionia.com'}},'postgres':{'environment':{'POSTGRES_DB':'ttd_staging'}}}}))
        if command=='ps': print(args[-1])
        if command=='up':
            for service in ['staging-api','staging-web']:
                if service in args: data[service]=os.environ['API_IMAGE' if service=='staging-api' else 'WEB_IMAGE']
            state.write_text(json.dumps(data))
        sys.exit()
sys.exit(1)
'''

class DeployTest(unittest.TestCase):
    def run_deploy(self, api='', web='', **extra):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root=Path(temporary.name)
        binary=root/'bin'; binary.mkdir()
        for name in ['docker','curl','sleep']:
            path=binary/name; path.write_text(MOCK);path.chmod(0o755)
        state=root/'mock.json';state.write_text(json.dumps({'staging-api':'api:old','staging-web':'web:old'}))
        last=root/'last-good.env';last.write_text('API_IMAGE=api:old\nWEB_IMAGE=web:old\n')
        log=root/'log';log.touch()
        runtime=root/'staging.env';runtime.write_text('PUBLIC_URL=https://staging-todo.reflexionia.com\nPOSTGRES_DB=ttd_staging\n')
        # Keep production timeouts fixed; shorten only this disposable test copy.
        script=(ROOT/'deploy/lib/deploy.sh').read_text().replace('health "$expected" 90','health "$expected" 1').replace('"$(image_commit "$old_api")" 45','"$(image_commit "$old_api")" 1')
        script=script.replace('root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"','root='+str(ROOT))
        test_script=root/'deploy.sh';test_script.write_text(script)
        env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'MOCK_LOG':str(log),'MOCK_STATE':str(state),'RUNTIME_ENV_FILE':str(runtime),'PUBLIC_HEALTH_URL':'https://example.test/api/v1/health','DEPLOY_ENVIRONMENT':'staging','API_IMAGE':api,'WEB_IMAGE':web,**extra}
        result=subprocess.run(['bash',str(test_script)],env=env,capture_output=True,text=True)
        calls=[json.loads(line) for line in log.read_text().splitlines()]
        return result,calls,last.read_text(),json.loads(state.read_text())

    def test_unchanged_does_nothing(self):
        result,calls,_,_=self.run_deploy()
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any('pull' in c or 'up' in c for c in calls))

    def test_web_only_leaves_api_database_and_redis_running(self):
        result,calls,state,running=self.run_deploy(web='web:new')
        self.assertEqual(result.returncode,0,result.stderr)
        up=next(c for c in calls if 'up' in c)
        self.assertEqual(up[-1],'staging-web')
        self.assertNotIn('staging-api',up)
        self.assertNotIn('postgres',up)
        self.assertNotIn('redis',up)
        self.assertIn('WEB_IMAGE=web:new',state)
        self.assertEqual(running['staging-api'],'api:old')

    def test_api_only_checks_new_commit(self):
        result,calls,state,_=self.run_deploy(api='api:new')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('API_IMAGE=api:new',state)
        self.assertEqual(next(c for c in calls if 'up' in c)[-1],'staging-api')

    def test_failed_health_rolls_back_and_keeps_last_good(self):
        result,calls,state,running=self.run_deploy(api='api:new',FAIL_HEALTH='1')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual(sum('up' in c for c in calls),2)
        self.assertEqual(running['staging-api'],'api:old')
        self.assertIn('API_IMAGE=api:old',state)

if __name__=='__main__': unittest.main()
