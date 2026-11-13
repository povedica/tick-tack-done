import gzip
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
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
if name=='age':
    sys.stdin.buffer.read(); Path(args[-1]).write_bytes(b'fixture'); sys.exit()
if name=='rclone': sys.exit()
if name=='curl':
    bad=os.environ.get('FAIL_HEALTH')=='1' and 'new' in ''.join(data.values())
    if bad: sys.exit(22)
    print(json.dumps({'status':'ok','commit':('b' if data['api' if os.environ['DEPLOY_ENVIRONMENT']=='production' else 'staging-api']=='api:new' else 'a')*40})); sys.exit()
with open(os.environ['MOCK_LOG'],'a') as log: log.write(json.dumps(args)+'\n')
if args[:2]==['image','inspect']:
    print(json.dumps(['GIT_COMMIT='+('b' if args[2]=='api:new' else 'a')*40])); sys.exit()
if args[0]=='inspect':
    print(data[args[-1]]); sys.exit()
if args[0]=='run':
    if os.environ.get('FAIL_MIGRATE')=='1' and 'migrate' in args: sys.exit(1)
    print('new-migrations' if 'api:new' in args and os.environ.get('NEW_MIGRATION')=='1' else 'same-migrations');sys.exit()
if args[0]=='compose':
    for command in ['config','ps','pull','up','exec','run']:
        if command not in args: continue
        if command=='config' and 'json' in args:
            print(json.dumps({'services':{'staging-api':{'environment':{'PUBLIC_URL':'https://staging-todo.reflexionia.com','PRE_MIGRATE_BACKUP_DIR':os.environ['MOCK_BACKUPS'],'BACKUP_RETENTION_DAYS':'30'}},'api':{'environment':{'PUBLIC_URL':'https://todo.reflexionia.com','PRE_MIGRATE_BACKUP_DIR':os.environ['MOCK_BACKUPS']}},'postgres':{'environment':{'POSTGRES_DB':'production' if os.environ['DEPLOY_ENVIRONMENT']=='production' else 'ttd_staging'}}}}))
        if command=='run' and os.environ.get('FAIL_MIGRATE')=='1': sys.exit(1)
        if command=='exec' and 'pg_dump' in args:
            if os.environ.get('FAIL_DUMP')=='1':
                print('partial dump'); sys.exit(1)
            if os.environ.get('EMPTY_DUMP')!='1': print('-- synthetic backup')
        if command=='ps': print(args[-1])
        if command=='up':
            for service in ['staging-api','staging-web','api','web']:
                if service in args: data[service]=os.environ['API_IMAGE' if service in ['staging-api','api'] else 'WEB_IMAGE']
            state.write_text(json.dumps(data))
        sys.exit()
sys.exit(1)
'''

class DeployTest(unittest.TestCase):
    def run_deploy(self, api='', web='', setup=None, **extra):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root=Path(temporary.name)
        self.last_temp_root=root
        if setup: setup(root)
        binary=root/'bin'; binary.mkdir()
        for name in ['docker','curl','sleep','age','rclone']:
            path=binary/name; path.write_text(MOCK);path.chmod(0o755)
        state=root/'mock.json';state.write_text(json.dumps({'staging-api':'api:old','staging-web':'web:old','api':'api:old','web':'web:old'}))
        for environment in ['staging','production']:
            directory=root/('.ttd-deploy-'+environment);directory.mkdir()
            (directory/'last-good.env').write_text('API_IMAGE=api:old\nWEB_IMAGE=web:old\n')
        last=root/('.ttd-deploy-'+extra.get('DEPLOY_ENVIRONMENT','staging'))/'last-good.env'
        log=root/'log';log.touch()
        incoming=root/'incoming.env';incoming.write_text(extra.pop('RUNTIME_CONTENT', 'PUBLIC_URL=https://staging-todo.reflexionia.com\nPOSTGRES_DB=ttd_staging\n'))
        runtime=root/'staging.env';runtime.write_text('PUBLIC_URL=https://staging-todo.reflexionia.com\nPOSTGRES_DB=ttd_staging\n')
        # Keep production timeouts fixed; shorten only this disposable test copy.
        script=(ROOT/'deploy/lib/deploy.sh').read_text().replace('health "$expected" 90','health "$expected" 1').replace('"$(image_commit "$old_api")" 45','"$(image_commit "$old_api")" 1')
        script=script.replace('root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"','root='+str(ROOT))
        test_script=root/'deploy.sh';test_script.write_text(script)
        env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'MOCK_LOG':str(log),'MOCK_STATE':str(state),'MOCK_BACKUPS':str(root/'backups'),'RUNTIME_ENV_FILE':str(runtime),'INCOMING_ENV_FILE':str(incoming),'PUBLIC_HEALTH_URL':'https://example.test/api/v1/health','DEPLOY_ENVIRONMENT':'staging','API_IMAGE':api,'WEB_IMAGE':web,**extra}
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

    def test_new_migration_backs_up_then_migrates_before_api_replacement(self):
        result,calls,_,_=self.run_deploy(api='api:new',NEW_MIGRATION='1')
        self.assertEqual(result.returncode,0,result.stderr)
        backup=next(i for i,c in enumerate(calls) if 'pg_dump' in c)
        migrate=next(i for i,c in enumerate(calls) if 'migrate' in c)
        up=next(i for i,c in enumerate(calls) if 'up' in c)
        self.assertLess(backup,migrate)
        self.assertLess(migrate,up)
        command = calls[migrate]
        tail = command[command.index('run'):]
        self.assertEqual(tail, ['run','--rm','--no-deps','--entrypoint','node','staging-api','node_modules/prisma/build/index.js','migrate','deploy','--schema','prisma/schema.prisma'])

    def test_local_dump_permissions_content_and_private_log_in_both_environments(self):
        for environment in ('staging', 'production'):
            with self.subTest(environment=environment):
                result,calls,_,_=self.run_deploy(api='api:new',NEW_MIGRATION='1',DEPLOY_ENVIRONMENT=environment)
                self.assertEqual(result.returncode,0,result.stderr)
                base=self.last_temp_root/'backups'
                archive=next(base.glob('*/db.sql.gz'))
                self.assertEqual(base.stat().st_mode & 0o777,0o700)
                self.assertEqual(archive.parent.stat().st_mode & 0o777,0o700)
                self.assertEqual(archive.stat().st_mode & 0o777,0o600)
                self.assertIn(b'synthetic backup',gzip.decompress(archive.read_bytes()))
                self.assertIn(str(archive),result.stdout)
                self.assertNotIn('synthetic backup',result.stdout+result.stderr)
                self.assertFalse(any('psql' in c or 'age' in c or 'rclone' in c for c in calls))

    def test_failed_or_empty_dump_aborts_before_migration_and_keeps_previous_api(self):
        for failure in ('FAIL_DUMP','EMPTY_DUMP'):
            with self.subTest(failure=failure):
                result,calls,state,running=self.run_deploy(api='api:new',NEW_MIGRATION='1',**{failure:'1'})
                self.assertNotEqual(result.returncode,0)
                self.assertFalse(any('migrate' in c or 'up' in c for c in calls))
                self.assertEqual(running['staging-api'],'api:old')
                self.assertIn('API_IMAGE=api:old',state)
                self.assertFalse(list((self.last_temp_root/'backups').glob('*/*')))

    def test_unwritable_destination_aborts_before_migration_and_keeps_previous_api(self):
        def setup(root):
            (root/'backups').write_text('a file cannot hold dumps')
        result,calls,state,running=self.run_deploy(api='api:new',NEW_MIGRATION='1',setup=setup)
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any('migrate' in c or 'up' in c for c in calls))
        self.assertEqual(running['staging-api'],'api:old')
        self.assertIn('API_IMAGE=api:old',state)

    def test_retention_removes_only_old_copies_beyond_latest_three(self):
        def setup(root):
            for day in range(1,6):
                stamp=root/'backups'/f'2020010{day}T000000Z'
                stamp.mkdir(parents=True)
                (stamp/'db.sql.gz').write_bytes(b'fixture')
                os.utime(stamp,(time.time()-40*86400,)*2)
            recent=root/'backups'/'20200106T000000Z'
            recent.mkdir(); (recent/'db.sql.gz').write_bytes(b'fixture')
        result,_,_,_=self.run_deploy(api='api:new',NEW_MIGRATION='1',setup=setup)
        self.assertEqual(result.returncode,0,result.stderr)
        remaining={p.name for p in (self.last_temp_root/'backups').iterdir()}
        self.assertIn('20200105T000000Z',remaining)
        self.assertIn('20200106T000000Z',remaining)
        self.assertNotIn('20200104T000000Z',remaining)
        self.assertEqual(len(remaining),3)

    def test_failed_migration_keeps_running_api(self):
        result,calls,state,running=self.run_deploy(api='api:new',NEW_MIGRATION='1',FAIL_MIGRATE='1')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(any('up' in c for c in calls))
        self.assertEqual(running['staging-api'],'api:old')
        self.assertIn('API_IMAGE=api:old',state)

    def test_no_migration_skips_backup_and_one_shot(self):
        result,calls,_,_=self.run_deploy(api='api:new')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertFalse(any('pg_dump' in c or 'migrate' in c for c in calls))

    def test_production_does_not_overwrite_staging_state_in_shared_env_directory(self):
        result,_,state,_=self.run_deploy(api='api:new',DEPLOY_ENVIRONMENT='production')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('API_IMAGE=api:new',state)
        staging=self.last_temp_root/'.ttd-deploy-staging'/'last-good.env'
        self.assertIn('API_IMAGE=api:old',staging.read_text())

    def test_failed_health_restores_previous_runtime_before_rollback(self):
        result,_,_,_=self.run_deploy(api='api:new',FAIL_HEALTH='1',RUNTIME_CONTENT='NEW_CONFIG=fictional\n')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.last_temp_root/'staging.env').read_text(), 'PUBLIC_URL=https://staging-todo.reflexionia.com\nPOSTGRES_DB=ttd_staging\n')
        self.assertFalse(list(self.last_temp_root.glob('.ttd-deploy-staging/runtime-previous.*')))

    def test_success_commits_incoming_runtime(self):
        result,_,_,_=self.run_deploy(api='api:new',RUNTIME_CONTENT='NEW_CONFIG=fictional\n')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.last_temp_root/'staging.env').read_text(),'NEW_CONFIG=fictional\n')

    def test_failed_migration_restores_previous_runtime(self):
        result,_,_,_=self.run_deploy(api='api:new',NEW_MIGRATION='1',FAIL_MIGRATE='1',RUNTIME_CONTENT='NEW_CONFIG=fictional\n')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('POSTGRES_DB=ttd_staging', (self.last_temp_root/'staging.env').read_text())

    def test_changed_env_recreates_both_apps_without_database_or_redis(self):
        result,calls,_,_=self.run_deploy(RUNTIME_CONTENT='NEW_CONFIG=fictional\n')
        self.assertEqual(result.returncode,0,result.stderr)
        up=next(c for c in calls if 'up' in c)
        self.assertEqual(up[-2:],['staging-api','staging-web'])
        self.assertNotIn('postgres',up)
        self.assertNotIn('redis',up)

class ProxyTest(unittest.TestCase):
    def proxy(self, same=False, restore=False):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            sites=root/'sites';sites.mkdir()
            site=sites/'todo.caddy'
            source=(ROOT/'deploy/production/todo.caddy').read_text()
            original=source if same else 'previous site'
            site.write_text(original)
            binary=root/'bin';binary.mkdir()
            log=root/'restarts'
            docker=binary/'docker';docker.write_text('#!/bin/sh\necho restart >> "$PROXY_LOG"\n');docker.chmod(0o755)
            script=(ROOT/'deploy/production/deploy.sh').read_text().replace('root="$(cd "$(dirname "$0")/../.." && pwd)"','root='+str(ROOT))
            script=script.replace('source "$root/deploy/lib/deploy.sh"','after_replace; '+('restore_proxy' if restore else 'after_success'))
            path=root/'proxy.sh';path.write_text(script)
            env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'CADDY_SITES_DIR':str(sites),'EDGE_CADDY_CONTAINER':'fixture-edge','EDGE_NETWORK':'fixture-edge','PROXY_LOG':str(log)}
            result=subprocess.run(['bash',str(path)],env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            return site.read_text(),original,log.read_text().splitlines() if log.exists() else []

    def test_unchanged_proxy_is_not_restarted(self):
        _,_,restarts=self.proxy(same=True)
        self.assertEqual(restarts,[])

    def test_changed_proxy_is_restarted_once(self):
        current,original,restarts=self.proxy()
        self.assertNotEqual(current,original)
        self.assertEqual(len(restarts),1)

    def test_proxy_is_restored_on_rollback(self):
        current,original,restarts=self.proxy(restore=True)
        self.assertEqual(current,original)
        self.assertEqual(len(restarts),2)

if __name__=='__main__': unittest.main()
