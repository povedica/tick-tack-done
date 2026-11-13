#!/usr/bin/env python3
"""Fail unless a pull request body starts with Closes #N for an open issue.

The issue-link job in CI reads the workflow event. pull_request.user.login for
Dependabot is dependabot[bot]. gh pr view --json author returns app/dependabot
and must not be used for the exemption.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

OPENING = re.compile(r'Closes #([0-9]+)\b')
EXEMPT_AUTHOR = 'dependabot[bot]'


class LookupFailed(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def opening_issue(body: str) -> str | None:
    """Return the issue number when Closes #N is the first real line.

    HTML comments and blank lines at the start do not count. A tool marker
    such as <!-- CURSOR_AGENT_PR_BODY_BEGIN --> is one of those comments.
    """
    if not body:
        return None
    text = body
    while text:
        if text[0] in '\r\n':
            text = text[1:]
            continue
        if text[0] in ' \t':
            line, _, rest = text.partition('\n')
            if line.strip() == '':
                text = rest
                continue
            break
        if text.startswith('<!--'):
            end = text.find('-->')
            if end == -1:
                return None
            text = text[end + 3:].lstrip(' \t')
            continue
        break
    if not text:
        return None
    match = OPENING.match(text.splitlines()[0])
    return match.group(1) if match else None


def issue_state(repo: str, number: str) -> str:
    """Return open, closed, or missing."""
    fixture = os.environ.get('ISSUE_STATES')
    if fixture is not None:
        states = json.loads(fixture)
        return states.get(number, 'missing')
    result = subprocess.run(
        ['gh', 'api', f'repos/{repo}/issues/{number}', '--jq', '.state'],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or '').strip()
        if '404' in detail or 'Not Found' in detail:
            return 'missing'
        raise LookupFailed(f'::error::No pude leer la issue #{number}.')
    state = result.stdout.strip()
    if state in ('open', 'closed'):
        return state
    raise LookupFailed(f'::error::Respuesta inesperada al leer la issue #{number}.')


def evaluate(author: str, body: str, repo: str) -> tuple[int, str]:
    if author == EXEMPT_AUTHOR:
        return 0, 'issue-link: dependabot[bot] queda exento.'
    number = opening_issue(body or '')
    if number is None:
        return 1, '::error::El cuerpo de la PR no empieza por «Closes #N».'
    try:
        state = issue_state(repo, number)
    except LookupFailed as error:
        return 1, error.message
    if state == 'missing':
        return 1, f'::error::La issue #{number} no existe.'
    if state != 'open':
        return (
            1,
            f'::error::La issue #{number} está cerrada. '
            'Un ajuste va en una issue nueva con la etiqueta ajuste; no se reabre ni se reutiliza.',
        )
    return 0, f'issue-link: Closes #{number} está abierta.'


def main() -> int:
    event_path = os.environ.get('GITHUB_EVENT_PATH')
    if not event_path:
        print('::error::Falta GITHUB_EVENT_PATH.')
        return 1
    with open(event_path, encoding='utf-8') as handle:
        event = json.load(handle)
    pull = event.get('pull_request') or {}
    author = ((pull.get('user') or {}).get('login')) or ''
    body = pull.get('body') or ''
    repo = os.environ.get('GITHUB_REPOSITORY') or ''
    if not repo:
        print('::error::Falta GITHUB_REPOSITORY.')
        return 1
    code, message = evaluate(author, body, repo)
    print(message)
    return code


if __name__ == '__main__':
    sys.exit(main())
