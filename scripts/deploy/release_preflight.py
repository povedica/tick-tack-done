#!/usr/bin/env python3
"""Pure decisions for the deploy preflight, plus a thin gh CLI.

Images on main starts from workflow_run of CI. That Images run's own head_sha
is the default-branch tip, not the commit CI tested. The deployable commit is
plan["sha"] (CI's head_sha). Push and workflow_dispatch still match head_sha.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SUITE_JOBS = (
    'code-checks',
    'quality',
    'test-unit',
    'test-integration',
    'openapi-check',
    'e2e-r80',
    'e2e-filters',
    'web',
    'perf-k6',
    'perf-k6-vista',
    'infra-check',
)

PRODUCTION_MESSAGE = (
    'Production requires a full CI run of this SHA on main: '
    'a schedule run, a workflow_dispatch with mode=full, or a push '
    'whose suite jobs succeeded and were not skipped.'
)


def _sha(value):
    return (value or '').lower()


def push_ci_succeeded(runs, target):
    target = _sha(target)
    return any(
        _sha(run.get('head_sha')) == target
        and run.get('head_branch') == 'main'
        and run.get('event') == 'push'
        and run.get('conclusion') == 'success'
        for run in runs
    )


def suite_jobs_succeeded(jobs):
    by_name = {job.get('name'): job.get('conclusion') for job in jobs}
    return all(by_name.get(name) == 'success' for name in SUITE_JOBS)


def full_ci_run(runs, jobs_by_id, target):
    target = _sha(target)
    for run in runs:
        if _sha(run.get('head_sha')) != target:
            continue
        if run.get('head_branch') != 'main' or run.get('conclusion') != 'success':
            continue
        if run.get('event') not in ('push', 'schedule', 'workflow_dispatch'):
            continue
        if suite_jobs_succeeded(jobs_by_id.get(run.get('id'), [])):
            return run
    return None


def images_text(run):
    return f"{run.get('name') or ''} {run.get('display_title') or ''}"


def images_candidate(run, target):
    if run.get('conclusion') != 'success' or run.get('head_branch') != 'main':
        return False
    event = run.get('event')
    target = _sha(target)
    if event in ('push', 'workflow_dispatch'):
        return _sha(run.get('head_sha')) == target
    if event == 'workflow_run':
        return target in images_text(run).lower().split()
    return False


def images_verified(run, target, plan):
    if run.get('conclusion') != 'success' or run.get('head_branch') != 'main':
        return False
    if not isinstance(plan, dict) or _sha(plan.get('sha')) != _sha(target):
        return False
    event = run.get('event')
    if event in ('push', 'workflow_dispatch'):
        return _sha(run.get('head_sha')) == _sha(target)
    return event == 'workflow_run'


def select_images_run(runs, target, plan_for, inspect_limit=15):
    seen = set()
    for run in runs:
        if not images_candidate(run, target):
            continue
        seen.add(run.get('id'))
        if images_verified(run, target, plan_for(run)):
            return run
    inspected = 0
    for run in runs:
        if run.get('id') in seen or run.get('event') != 'workflow_run':
            continue
        if run.get('conclusion') != 'success' or run.get('head_branch') != 'main':
            continue
        inspected += 1
        if inspected > inspect_limit:
            break
        if images_verified(run, target, plan_for(run)):
            return run
    return None


def gh_json(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def paginate_runs(path):
    runs = []
    for page in range(1, 11):
        separator = '&' if '?' in path else '?'
        payload = gh_json(f'{path}{separator}page={page}')
        batch = payload.get('workflow_runs') or []
        runs.extend(batch)
        if len(batch) < 100:
            break
    return runs


def list_ci_runs(repo, target):
    return paginate_runs(
        f'repos/{repo}/actions/workflows/ci.yml/runs?head_sha={target}&status=success&per_page=100'
    )


def list_images_runs(repo):
    return paginate_runs(
        f'repos/{repo}/actions/workflows/images.yml/runs?branch=main&status=success&per_page=100'
    )


def list_jobs(repo, run_id):
    jobs = []
    for page in range(1, 6):
        payload = gh_json(f'repos/{repo}/actions/runs/{run_id}/jobs?per_page=100&page={page}')
        batch = payload.get('jobs') or []
        jobs.extend(batch)
        if len(batch) < 100:
            break
    return jobs


def download_plan(repo, run_id):
    with tempfile.TemporaryDirectory() as directory:
        result = subprocess.run(
            [
                'gh', 'run', 'download', str(run_id), '--repo', repo,
                '--name', 'deployment-plan', '--dir', directory,
            ],
            capture_output=True,
            text=True,
        )
        path = Path(directory) / 'plan.json'
        if result.returncode != 0 or not path.exists():
            return None
        return json.loads(path.read_text())


def wait_until(predicate, attempts, pause, fetch):
    for index in range(attempts):
        if predicate(fetch()):
            return True
        if index + 1 < attempts and pause:
            time.sleep(pause)
    return False


def cmd_staging(args):
    attempts = int(os.environ.get('CI_LOOKUP_ATTEMPTS', '6'))
    pause = int(os.environ.get('CI_LOOKUP_INTERVAL', '10'))
    if wait_until(
        lambda runs: push_ci_succeeded(runs, args.target),
        attempts,
        pause,
        lambda: list_ci_runs(args.repo, args.target),
    ):
        return 0
    print('CI on main must pass before deployment', file=sys.stderr)
    return 1


def cmd_production(args):
    runs = list_ci_runs(args.repo, args.target)
    jobs_by_id = {
        run['id']: list_jobs(args.repo, run['id'])
        for run in runs
        if run.get('conclusion') == 'success'
        and run.get('event') in ('push', 'schedule', 'workflow_dispatch')
    }
    if full_ci_run(runs, jobs_by_id, args.target):
        return 0
    print(PRODUCTION_MESSAGE, file=sys.stderr)
    return 1


def cmd_find_images(args):
    runs = list_images_runs(args.repo)
    chosen = select_images_run(runs, args.target, lambda run: download_plan(args.repo, run['id']))
    if not chosen:
        print('No successful Images run on main for the target SHA', file=sys.stderr)
        return 1
    print(chosen['id'])
    return 0


def cmd_verify_images(args):
    run = json.loads(Path(args.run).read_text())
    plan = json.loads(Path(args.plan).read_text())
    if images_verified(run, args.target, plan):
        return 0
    print(
        'Successful Images run on main required for the real target SHA '
        '(deployment plan sha / CI head_sha), not the workflow_run head SHA',
        file=sys.stderr,
    )
    return 1


def main():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--repo', default=os.environ.get('GITHUB_REPOSITORY', ''))
    common.add_argument('--target', default='')
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('staging-ci', 'production-ci', 'find-images'):
        sub.add_parser(name, parents=[common])
    verify = sub.add_parser('verify-images', parents=[common])
    verify.add_argument('--run', required=True)
    verify.add_argument('--plan', required=True)
    args = parser.parse_args()
    if not args.target or (args.command != 'verify-images' and not args.repo):
        parser.error('--target is required, and --repo is required except for verify-images')
    commands = {
        'staging-ci': cmd_staging,
        'production-ci': cmd_production,
        'find-images': cmd_find_images,
        'verify-images': cmd_verify_images,
    }
    return commands[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
