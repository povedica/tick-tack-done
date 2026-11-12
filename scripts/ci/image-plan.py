#!/usr/bin/env python3
"""Resolve immutable component revisions from history, never the previous push."""
import json
import subprocess

COMMON = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.dockerignore', 'tsconfig.base.json', 'packages/domain', '.github/workflows/images.yml', 'scripts/ci/image-plan.py']


def revision(paths):
    return subprocess.check_output(['git', 'log', '-1', '--format=%H', 'HEAD', '--', *paths], text=True).strip()


def plan():
    return {'sha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
            'api': True, 'web': True,
            'api_sha': revision(COMMON + ['apps/api']),
            'web_sha': revision(COMMON + ['apps/web', 'packages/sdk'])}


if __name__ == '__main__':
    print(json.dumps(plan()))
