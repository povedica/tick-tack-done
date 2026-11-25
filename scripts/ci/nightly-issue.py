#!/usr/bin/env python3
"""Open or comment on one stable issue when nightly CI fails. Never closes it."""
import json
import os
import subprocess
import sys

TITLE = 'CI nightly failed'


def gh_get(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def gh_post(path, payload):
    subprocess.run(
        ['gh', 'api', '--method', 'POST', '--input', '-', path],
        input=json.dumps(payload),
        text=True,
        check=True,
    )


def open_issues(repo):
    found = []
    for page in range(1, 11):
        batch = gh_get(f'repos/{repo}/issues?state=open&per_page=100&page={page}')
        if not isinstance(batch, list):
            break
        found.extend(batch)
        if len(batch) < 100:
            break
    return [
        item for item in found
        if 'pull_request' not in item and item.get('title') == TITLE
    ]


def main():
    results = json.loads(os.environ.get('RESULTS') or '{}')
    bad = sorted(
        name
        for name, info in results.items()
        if isinstance(info, dict) and info.get('result') in ('failure', 'cancelled')
    )
    if not bad:
        print('Nightly CI succeeded; no issue update')
        return 0
    repo = os.environ['GITHUB_REPOSITORY']
    server = os.environ.get('GITHUB_SERVER_URL', 'https://github.com')
    run_id = os.environ['GITHUB_RUN_ID']
    sha = os.environ.get('GITHUB_SHA', '')
    run_url = f'{server}/{repo}/actions/runs/{run_id}'
    body = (
        'La CI nocturna ha fallado.\n\n'
        f'- Run: {run_url}\n'
        f'- SHA: `{sha}`\n'
        f'- Jobs: {", ".join(bad)}\n'
    )
    matches = open_issues(repo)
    if matches:
        number = min(item['number'] for item in matches)
        comments = gh_get(f'repos/{repo}/issues/{number}/comments?per_page=100')
        if any(run_url in (comment.get('body') or '') for comment in comments):
            print(f'Issue #{number} already mentions this run')
            return 0
        gh_post(f'repos/{repo}/issues/{number}/comments', {'body': body})
        print(f'Commented on issue #{number}')
        return 0
    gh_post(f'repos/{repo}/issues', {'title': TITLE, 'body': body})
    print('Opened CI nightly failed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
