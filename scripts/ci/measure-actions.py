#!/usr/bin/env python3
"""Read public Actions metadata; never read credentials or change remote state."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import statistics
import subprocess
from urllib.parse import urlencode

DEFINITION = [
    '.github/workflows/ci.yml', '.github/actions/setup/action.yml',
    'scripts/ci/format-check.mjs', 'scripts/ci/run-code-checks.sh', 'scripts/ci/run-integration.sh',
    'package.json', 'apps/api/package.json', 'apps/web/package.json',
    'packages/domain/package.json', 'packages/sdk/package.json', 'pnpm-lock.yaml',
]


def command(args):
    return subprocess.check_output(args, text=True)


def github(repo, path):
    return json.loads(command(['gh', 'api', f'repos/{repo}/{path}']))


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def fingerprint(sha):
    digest = hashlib.sha256()
    for path in DEFINITION:
        digest.update(command(['git', 'show', f'{sha}:{path}']).encode())
    return digest.hexdigest()


def percentile(values, quantile):
    return sorted(values)[math.ceil(quantile * len(values)) - 1]


def duration(value):
    seconds = round(value)
    return f'{seconds // 60}:{seconds % 60:02}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default='povedica/tick-tack-done')
    parser.add_argument('--branch', required=True)
    parser.add_argument('--since-sha', required=True)
    parser.add_argument('--json', required=True, dest='json_path')
    parser.add_argument('--markdown', required=True)
    args = parser.parse_args()
    since = command(['git', 'rev-parse', args.since_sha]).strip()
    eligible = set(command(['git', 'rev-list', '--ancestry-path', f'{since}..HEAD']).split()) | {since}
    expected = fingerprint(since)
    old = Path(args.json_path)
    cached = {r['id']: r for r in json.loads(old.read_text()).get('runs', [])} if old.exists() else {}
    query = urlencode({'branch': args.branch, 'event': 'pull_request', 'per_page': 100})
    candidates = github(args.repo, 'actions/workflows/ci.yml/runs?' + query)['workflow_runs']
    runs = []
    for run in candidates:
        if run['status'] != 'completed' or run['head_sha'] not in eligible:
            continue
        if fingerprint(run['head_sha']) != expected:
            continue
        if run['id'] in cached:
            runs.append(cached[run['id']]); continue
        jobs = github(args.repo, f"actions/runs/{run['id']}/jobs?per_page=100")['jobs']
        active = [j for j in jobs if j['started_at'] and j['completed_at'] and j['conclusion'] != 'skipped']
        runs.append({
            'id': run['id'], 'sha': run['head_sha'], 'created_at': run['created_at'],
            'conclusion': run['conclusion'], 'url': run['html_url'],
            'seconds': (max(instant(j['completed_at']) for j in active) - instant(run['created_at'])).total_seconds(),
            'queue_seconds': (min(instant(j['started_at']) for j in active) - instant(run['created_at'])).total_seconds(),
            'runner_min': sum((instant(j['completed_at']) - instant(j['started_at'])).total_seconds() for j in active) / 60,
            'jobs': {j['name']: {'seconds': (instant(j['completed_at']) - instant(j['started_at'])).total_seconds(), 'conclusion': j['conclusion']} for j in active},
        })
    runs.sort(key=lambda r: r['created_at'])
    summary = {}
    if runs:
        summary = {'n': len(runs), 'median_seconds': statistics.median(r['seconds'] for r in runs),
                   'p90_seconds': percentile([r['seconds'] for r in runs], .9),
                   'median_runner_min': statistics.median(r['runner_min'] for r in runs),
                   'results': dict(Counter(r['conclusion'] for r in runs))}
    report = {'measured_at': datetime.now(timezone.utc).isoformat(), 'since_sha': since,
              'definition_sha256': expected, 'summary': summary, 'runs': runs}
    old.parent.mkdir(parents=True, exist_ok=True)
    old.write_text(json.dumps(report, indent=2) + '\n')
    text = '''# BKL-046 · Mediciones de CI

Método: API de Actions. Duración desde created_at hasta el último completed_at; incluye cola.
Runner-min = suma de duración de jobs activos (skipped excluidos). p90 por rango más próximo.
La muestra solo incluye PR runs de esta rama con la misma definición de CI y scripts que el candidato.
Los candidatos previos y cancelaciones causadas por cambiar el diseño no se mezclan en esta muestra.
Se conservan resultados fallidos/cancelados si pertenecen a esta definición; no se filtran para mejorar estadísticas.
Fecha y datos exactos: [bkl-046-runs.json](bkl-046-runs.json).

La línea base de #158 es de 30 runs (11/11/2026). Objetivos de Pablo: ≤3:30 mediana, ≤4:30 p90 y ≤7,9 runner-min.
No se da por aceptado el candidato sin medir la muestra suficiente y el head verde.

'''
    if summary:
        text += '| Métrica | Antes | Después |\n| --- | --- | --- |\n'
        text += f"| Nº de runs | 30 | {summary['n']} |\n"
        text += f"| Duración mediana | 4:38 | {duration(summary['median_seconds'])} |\n"
        text += f"| Duración p90 | 5:45 | {duration(summary['p90_seconds'])} |\n"
        text += f"| Runner-min mediana | 11,3 | {summary['median_runner_min']:.2f} |\n"
        text += f"| Reducción runner-min | — | {(1-summary['median_runner_min']/11.3)*100:.1f} % |\n\n"
    text += '## Runs\n\n| Run | SHA | Resultado | Duración | Cola | Runner-min |\n| --- | --- | --- | --- | --- | --- |\n'
    for run in runs:
        text += f"| [{run['id']}]({run['url']}) | `{run['sha'][:7]}` | {run['conclusion']} | {duration(run['seconds'])} | {duration(run['queue_seconds'])} | {run['runner_min']:.2f} |\n"
    grouped = defaultdict(list)
    for run in runs:
        for name, job in run['jobs'].items():
            if job['conclusion'] == 'success': grouped[name].append(job['seconds'])
    text += '\n## Jobs correctos\n\nQuality, OpenAPI y navegador son checks de resultado; su ejecución real comparte el job code-checks.\nNo comparar sus segundos de resumen con los antiguos jobs completos. Unitarios e integración ejecutan sus suites completas.\n\n| Job | N | Mediana | p90 |\n| --- | --- | --- | --- |\n'
    for name, values in sorted(grouped.items()):
        text += f'| {name} | {len(values)} | {duration(statistics.median(values))} | {duration(percentile(values,.9))} |\n'
    text += '''
## Límites de evidencia

Los perfiles docs/web/api se verifican con el bundle oficial dorny en repositorios locales temporales, en CI.
No se crearon PRs adicionales: la revisión automática las rechazó por la regla de una issue/una PR.
No hay medición real de CI solo docs: ≤1:00 sigue sin acreditar; no se presenta una estimación como resultado.
Imágenes GHCR, caché GHA de imágenes y deploy externo quedan pendientes de M1–M9 según #158.

## Imágenes locales

Muestras únicas locales con cachés compartidas; no constituyen un benchmark frío controlado ni la medida GHA.
API original: 1,85 GB de uso de disco / 370 MB de contenido; final: 729 MB / 162 MB.
Web: 96,7 MB de disco / 27,2 MB de contenido en ambas versiones.
Primer build API original medido: 106,15 s; nueva imagen: 41,54–62,29 s según revisión; repetición caliente: 1,83 s.
Web original 22,32 s; nueva 21,13 s. Smoke read-only y migración real/fallida con Postgres desechable pasan.
'''
    Path(args.markdown).write_text(text)
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
