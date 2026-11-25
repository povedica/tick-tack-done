#!/usr/bin/env python3
"""Reuse a green pull_request CI run when its git tree matches this push.

A squash or merge onto an up-to-date main keeps the tree. A different tree
means the push is not that pull request: the caller runs full CI. A failed,
cancelled, or incomplete run is never reused. Lookup errors count as a miss
so the push still runs the suites (the job itself stays green).
"""
import json
import os
import subprocess
import sys

MAX_PAGES = int(os.environ.get('REUSE_MAX_PAGES', '10'))


def gh(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def tree_of(repo, sha):
    try:
        commit = gh(f'repos/{repo}/commits/{sha}')
    except subprocess.CalledProcessError:
        return None
    return ((commit.get('commit') or {}).get('tree') or {}).get('sha')


def ci_ok_green(repo, run_id):
    try:
        payload = gh(f'repos/{repo}/actions/runs/{run_id}/jobs?per_page=100')
    except subprocess.CalledProcessError:
        return False
    for job in payload.get('jobs') or []:
        if job.get('name') == 'ci-ok' and job.get('conclusion') == 'success':
            return True
    return False


def find_hit(repo, tree):
    for page in range(1, MAX_PAGES + 1):
        try:
            payload = gh(
                f'repos/{repo}/actions/workflows/ci.yml/runs'
                f'?event=pull_request&status=success&per_page=100&page={page}'
            )
        except subprocess.CalledProcessError:
            return False
        runs = payload.get('workflow_runs') or []
        for run in runs:
            if run.get('conclusion') != 'success' or run.get('event') != 'pull_request':
                continue
            sha = run.get('head_sha') or ''
            if not sha or tree_of(repo, sha) != tree:
                continue
            if ci_ok_green(repo, run.get('id')):
                return True
        if len(runs) < 100:
            break
    return False


def write_hit(hit):
    line = 'hit=true\n' if hit else 'hit=false\n'
    output = os.environ.get('GITHUB_OUTPUT')
    if output:
        with open(output, 'a', encoding='utf-8') as handle:
            handle.write(line)
    else:
        sys.stdout.write(line)


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    sha = os.environ.get('GITHUB_SHA') or subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], text=True
    ).strip()
    tree = subprocess.check_output(['git', 'rev-parse', f'{sha}^{{tree}}'], text=True).strip()
    try:
        hit = find_hit(repo, tree)
    except Exception as exc:
        print(f'::warning::Tree reuse lookup failed ({exc}); running full CI', file=sys.stderr)
        hit = False
    write_hit(hit)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print(f'::warning::Tree reuse lookup failed ({exc}); running full CI', file=sys.stderr)
        write_hit(False)
        sys.exit(0)
