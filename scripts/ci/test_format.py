import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[2]

class FormatContracts(unittest.TestCase):
    def exercise(self,event):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True,stderr=subprocess.DEVNULL)
            git('init','-q')
            for file in ['untouched.md','changed.md','deleted.md']:(root/file).write_text('before\n')
            git('add','.')
            git('-c','user.name=CI Fixture','-c','user.email=fixture@example.test','commit','-qm','test: base')
            base=git('rev-parse','HEAD').strip()
            (root/'changed.md').write_text('after\n');(root/'new.md').write_text('new\n');(root/'deleted.md').unlink()
            git('add','-A');git('-c','user.name=CI Fixture','-c','user.email=fixture@example.test','commit','-qm','test: change')
            binary=root/'bin';binary.mkdir()
            pnpm=binary/'pnpm';pnpm.write_text('#!/usr/bin/env python3\nimport os,json,sys\nopen(os.environ["FORMAT_LOG"],"w").write(json.dumps(sys.argv[1:]))\n');pnpm.chmod(0o755)
            log=root/'log'
            env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'FORMAT_LOG':str(log),'CI':'true','GITHUB_EVENT_NAME':event,'FORMAT_BASE_SHA':base}
            subprocess.run(['node',str(ROOT/'scripts/ci/format-check.mjs')],cwd=root,env=env,check=True,capture_output=True)
            return json.loads(log.read_text())

    def test_pr_checks_every_changed_file_but_not_deleted_or_unchanged_files(self):
        args=self.exercise('pull_request')
        self.assertIn('changed.md',args);self.assertIn('new.md',args)
        self.assertNotIn('untouched.md',args);self.assertNotIn('deleted.md',args)

    def test_main_still_checks_the_complete_tree(self):
        self.assertEqual(self.exercise('push'),['exec','prettier','--check','.'])

if __name__=='__main__':unittest.main()
