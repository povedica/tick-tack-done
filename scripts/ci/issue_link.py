#!/usr/bin/env python3
"""Fail unless a pull request body starts with Closes #N for an open issue.

Exenciones: scripts/backlog/exemptions.json, las reglas que nombran
issue-link. El evento trae user.login (dependabot[bot]) y user.type Bot.
gh pr view devuelve app/dependabot e is_bot; el mismo normalizador casa
los dos. Una etiqueta no exime de este check.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

_BACKLOG = Path(__file__).resolve().parents[1] / 'backlog'
if str(_BACKLOG) not in sys.path:
    sys.path.insert(0, str(_BACKLOG))

from exemptions import PolicyError, find_exemption

OPENING = re.compile(r'Closes #([0-9]+)\b')


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


def evaluate(body: str, repo: str) -> tuple[int, str]:
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
    body = pull.get('body') or ''
    repo = os.environ.get('GITHUB_REPOSITORY') or ''
    if not repo:
        print('::error::Falta GITHUB_REPOSITORY.')
        return 1
    try:
        exemption = find_exemption('issue-link', pull)
    except PolicyError as error:
        print(f'::error::{error.message}')
        return 1
    if exemption is not None:
        print(f'issue-link: queda exento por la regla {exemption.id}. {exemption.reason}')
        return 0
    code, message = evaluate(body, repo)
    print(message)
    return code


if __name__ == '__main__':
    sys.exit(main())
