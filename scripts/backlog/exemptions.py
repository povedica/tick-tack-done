#!/usr/bin/env python3
"""Política declarativa de exenciones del backlog.

La usan `sync.sh pr-check` e `scripts/ci/issue_link.py`. Añadir un bot,
una etiqueta o un conjunto de rutas es una regla en `exemptions.json`:
no hace falta tocar el script. El formato está en `LEEME.md`.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

ALLOWED_CHECKS = frozenset({'pr-check', 'issue-link'})
WHEN_KEYS = frozenset({'author', 'labels_any', 'paths_all'})
AUTHOR_KEYS = frozenset({'login', 'bot'})
DEFAULT_CONFIG = Path(__file__).with_name('exemptions.json')


class PolicyError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class Exemption:
    id: str
    reason: str


@dataclass(frozen=True)
class PullView:
    login: str
    is_bot: bool
    labels: tuple[str, ...]
    paths: tuple[str, ...]


def normalize_login(login: str) -> str:
    """`app/dependabot`, `dependabot[bot]` y `dependabot` son el mismo login."""
    value = login.strip().lower()
    if value.startswith('app/'):
        value = value[4:]
    if value.endswith('[bot]'):
        value = value[:-5]
    return value


def load_policy(path: Path | None = None) -> dict:
    source = path or DEFAULT_CONFIG
    try:
        raw = source.read_text(encoding='utf-8')
        policy = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        raise PolicyError(f'No pude leer la política de exenciones ({source}): {error}') from error
    if not isinstance(policy, dict) or policy.get('version') != 1:
        raise PolicyError('La política de exenciones tiene que ser version 1.')
    rules = policy.get('rules')
    if not isinstance(rules, list) or not rules:
        raise PolicyError('La política de exenciones no tiene reglas.')
    for rule in rules:
        _validate_rule(rule)
    return policy


def find_exemption(check: str, payload: dict, path: Path | None = None) -> Exemption | None:
    if check not in ALLOWED_CHECKS:
        raise PolicyError(f'Check desconocido: {check}.')
    policy = load_policy(path)
    view = pull_view(payload)
    for rule in policy['rules']:
        if check not in rule['checks']:
            continue
        if _matches(rule['when'], view):
            return Exemption(id=rule['id'], reason=rule['reason'])
    return None


def permission_verdict(headers: str) -> str:
    """`write`, `read` o `unknown` a partir de las cabeceras de la API de GitHub.

    Un token de GitHub App (el de Actions, también el de Dependabot y el de
    un fork) anuncia el permiso real en `x-accepted-github-permissions`.
    Un PAT classic lo anuncia en `x-oauth-scopes`. Sin esas cabeceras no
    se afirma nada: el llamador puede intentar la escritura.
    """
    parsed: dict[str, str] = {}
    for line in headers.splitlines():
        if ':' not in line:
            continue
        name, value = line.split(':', 1)
        parsed[name.strip().lower()] = value.strip().lower()
    accepted = parsed.get('x-accepted-github-permissions', '')
    if accepted:
        permissions = _pairs(accepted)
        if permissions.get('issues') == 'write' or permissions.get('pull_requests') == 'write':
            return 'write'
        return 'read'
    scopes = parsed.get('x-oauth-scopes', '')
    if scopes:
        names = {item.strip() for item in scopes.split(',') if item.strip()}
        if 'repo' in names or 'public_repo' in names:
            return 'write'
        return 'read'
    return 'unknown'


def pull_view(payload: dict) -> PullView:
    """Acepta el JSON de `gh pr view` y el `pull_request` del evento de Actions."""
    if not isinstance(payload, dict):
        raise PolicyError('La PR no es un objeto JSON.')
    if 'user' in payload and 'author' not in payload:
        user = payload.get('user') or {}
        author = user if isinstance(user, dict) else {}
    else:
        author = payload.get('author') or {}
        if not isinstance(author, dict):
            author = {}
    login = author.get('login') if isinstance(author.get('login'), str) else ''
    return PullView(
        login=login,
        is_bot=_is_bot(author),
        labels=tuple(_label_names(payload.get('labels'))),
        paths=tuple(_paths(payload.get('files'))),
    )


def _is_bot(author: dict) -> bool:
    if 'is_bot' in author and author.get('is_bot') is not None:
        return author.get('is_bot') is True
    return str(author.get('type') or '').lower() == 'bot'


def _label_names(labels: object) -> list[str]:
    if not isinstance(labels, list):
        return []
    names: list[str] = []
    for label in labels:
        if isinstance(label, str):
            names.append(label)
        elif isinstance(label, dict) and isinstance(label.get('name'), str):
            names.append(label['name'])
    return names


def _paths(files: object) -> list[str]:
    if not isinstance(files, list):
        return []
    paths: list[str] = []
    for item in files:
        if isinstance(item, str):
            paths.append(item)
        elif isinstance(item, dict) and isinstance(item.get('path'), str):
            paths.append(item['path'])
    return paths


def _validate_rule(rule: object) -> None:
    if not isinstance(rule, dict):
        raise PolicyError('Una regla de exención no es un objeto.')
    rule_id = rule.get('id')
    reason = rule.get('reason')
    checks = rule.get('checks')
    when = rule.get('when')
    if not isinstance(rule_id, str) or not rule_id.strip():
        raise PolicyError('Una regla de exención no tiene id.')
    if not isinstance(reason, str) or not reason.strip():
        raise PolicyError(f'La regla {rule_id} no tiene motivo.')
    if not isinstance(checks, list) or not checks or any(item not in ALLOWED_CHECKS for item in checks):
        raise PolicyError(f'La regla {rule_id} nombra un check desconocido.')
    if not isinstance(when, dict) or not when or any(key not in WHEN_KEYS for key in when):
        raise PolicyError(f'La regla {rule_id} tiene un when vacío o desconocido.')
    author = when.get('author')
    if author is not None:
        if (
            not isinstance(author, dict)
            or any(key not in AUTHOR_KEYS for key in author)
            or not isinstance(author.get('login'), str)
            or not author['login'].strip()
            or not isinstance(author.get('bot'), bool)
        ):
            raise PolicyError(
                f'La regla {rule_id} tiene que decir login y bot (true o false) del autor.'
            )
    for key in ('labels_any', 'paths_all'):
        values = when.get(key)
        if values is None:
            continue
        if not isinstance(values, list) or not values or any(not isinstance(item, str) or not item for item in values):
            raise PolicyError(f'La regla {rule_id} tiene {key} vacío o mal formado.')


def _matches(when: dict, view: PullView) -> bool:
    author = when.get('author')
    if author is not None:
        if normalize_login(view.login) != normalize_login(author['login']):
            return False
        if author['bot'] is not view.is_bot:
            return False
    labels = when.get('labels_any')
    if labels is not None and not any(label in view.labels for label in labels):
        return False
    patterns = when.get('paths_all')
    if patterns is not None:
        if not view.paths:
            return False
        if any(not any(_glob_match(path, pattern) for pattern in patterns) for path in view.paths):
            return False
    return True


def _glob_match(path: str, pattern: str) -> bool:
    escaped = re.escape(pattern).replace(r'\*\*', '§').replace(r'\*', '[^/]*').replace('§', '.*')
    return re.fullmatch(escaped, path) is not None


def _pairs(header: str) -> dict[str, str]:
    permissions: dict[str, str] = {}
    for part in header.split(','):
        if '=' not in part:
            continue
        key, value = part.split('=', 1)
        permissions[key.strip()] = value.strip()
    return permissions


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in ('match', 'permissions'):
        print('Uso: exemptions.py {match --check NOMBRE [--config RUTA]|permissions}', file=sys.stderr)
        return 2
    try:
        if argv[1] == 'permissions':
            print(permission_verdict(sys.stdin.read()))
            return 0
        check, config = _match_args(argv[2:])
        found = find_exemption(check, json.load(sys.stdin), config)
    except PolicyError as error:
        print(f'::error::{error.message}', file=sys.stderr)
        return 2
    except json.JSONDecodeError as error:
        print(f'::error::La PR no es JSON válido: {error}', file=sys.stderr)
        return 2
    if found is not None:
        print(f'{found.id}\t{found.reason}')
    return 0


def _match_args(argv: list[str]) -> tuple[str, Path | None]:
    check = ''
    config: Path | None = None
    index = 0
    while index < len(argv):
        arg = argv[index]
        if arg == '--check' and index + 1 < len(argv):
            check = argv[index + 1]
            index += 2
            continue
        if arg == '--config' and index + 1 < len(argv):
            config = Path(argv[index + 1])
            index += 2
            continue
        raise PolicyError(f'Argumento desconocido: {arg}.')
    if not check:
        raise PolicyError('Falta --check.')
    return check, config


if __name__ == '__main__':
    sys.exit(main(sys.argv))
