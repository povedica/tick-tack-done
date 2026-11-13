import { readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const k6 = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const small = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const large = JSON.parse(readFileSync(process.argv[5], 'utf8'));
const destination = process.argv[6];
const sha = process.argv[7] ?? 'unknown';

const perOpen = manifest.requestsPerOpen;
const opens = k6.opens;
const planned = perOpen * (opens + 1);
const fullOpens = Math.floor(1000 / perOpen);

function ms(value) {
  return value === undefined || value === null ? '—' : String(Math.round(value));
}

function routeRow(name) {
  const route = k6.routes[name] ?? {};
  return `| \`${name}\` | ${ms(route.p50)} | ${ms(route.p95)} | ${ms(route.p99)} | ${String(route.count ?? 0)} |`;
}

function viewRows(label, report) {
  return ['year', 'openMonth', 'month', 'week']
    .map((view) => {
      const row = report.views[view];
      const title =
        view === 'openMonth'
          ? `${label} abrir mes`
          : `${label} ${view === 'year' ? 'año' : view === 'month' ? 'mes' : 'semana'}`;
      return `| ${title} | ${ms(row.coldMs)} | ${ms(row.interactionMs)} | ${ms(row.tbtMs)} | ${ms(row.maxLongTaskMs)} |`;
    })
    .join('\n');
}

const body = `# Línea base del calendario — ${destination.split('/').pop()?.replace('-linea-base.md', '') ?? ''}

Medida de F1. No activa ninguna migración de lectura.

- Commit medido: \`${sha}\`
- Comando: \`pnpm perf:baseline\`
- Seed: \`scripts/seed-perf.ts\` con \`PERF_PROFILE=x100\` (y \`s\` para el navegador) contra Postgres efímero \`reflexionia_perf\`. No usa \`TOKEN_RATE_LIMIT_TEST\`.
- k6: \`scripts/perf/k6-vista-anual.js\`. Un recorrido de completitud más ${String(opens)} aperturas. Páginas de tareas: ${String(perOpen - 3)}. Peticiones por apertura: ${String(perOpen)}.
- Playwright: proyecto \`perf\`, build de producción, Pixel 7, \`timezoneId: Europe/Madrid\`, \`locale: es-ES\`, CPU 4×, 3 repeticiones, mediana. Visible = rejilla del periodo y la marca \`PERF-SENTINEL\` del 5 de enero de 2026 (1 elemento).

## Aritmética del límite de producción

El PAT de producción admite **1000 peticiones cada 15 minutos** (\`TOKEN_RATE_LIMIT\` en \`apps/api/src/auth/token-rate-limit.ts\`).

Una apertura completa del año, con el cursor hasta el final (6600 tareas a 100 por página):

- tareas: ${String(perOpen - 3)}
- eventos, proyectos y suscripciones: 3
- total: **${String(perOpen)}**

1000 / ${String(perOpen)} = **${String(fullOpens)} aperturas completas** en 15 minutos. El escenario publicado es 1 completitud + ${String(opens)} aperturas = **${String(planned)}** peticiones, por debajo de 1000. El cliente actual, además, corta a 20 páginas; eso son menos peticiones, no más.

\`TOKEN_RATE_LIMIT_TEST\` solo existe fuera de producción. El job de CI lo define para no medir un 429. Esta línea base no lo define. Respuestas 429: **${String(k6.rate_limited)}**. Tope de cursor: **${String(k6.cursor_capped)}**.

## k6 (ms)

| Ruta | p50 | p95 | p99 | n |
|---|---:|---:|---:|---:|
${routeRow('tasks')}
${routeRow('events')}
${routeRow('projects')}
${routeRow('subscriptions')}

## Playwright (ms, mediana de 3, CPU 4×)

| Escenario | Datos correctos | Interacción | TBT | Long task máx. |
|---|---:|---:|---:|---:|
${viewRows('S', small)}
${viewRows('×100', large)}

La interacción del año es el año siguiente (la rejilla de 2026 deja de estar). «Abrir mes» es el clic en enero hasta ver la marca. Mes y semana miden el periodo siguiente. Con datos del periodo anterior todavía visibles, la espera no termina.
`;

writeFileSync(destination, body);
console.info(destination);
