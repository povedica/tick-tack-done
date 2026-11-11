# BKL-046 · Mediciones de CI

Método: API de Actions. Duración desde created_at hasta el último completed_at; incluye cola.
Runner-min = suma de duración de jobs activos (skipped excluidos). p90 por rango más próximo.
La muestra solo incluye PR runs de esta rama con la misma definición de CI y scripts que el candidato.
Los candidatos previos y cancelaciones causadas por cambiar el diseño no se mezclan en esta muestra.
Se conservan resultados fallidos/cancelados si pertenecen a esta definición; no se filtran para mejorar estadísticas.
Fecha y datos exactos: [bkl-046-runs.json](bkl-046-runs.json).

La línea base de #158 es de 30 runs (11/11/2026). Objetivos de Pablo: ≤3:30 mediana, ≤4:30 p90 y ≤7,9 runner-min.
No se da por aceptado el candidato sin medir la muestra suficiente y el head verde.

| Métrica              | Antes | Después |
| -------------------- | ----- | ------- |
| Nº de runs           | 30    | 1       |
| Duración mediana     | 4:38  | 3:39    |
| Duración p90         | 5:45  | 3:39    |
| Runner-min mediana   | 11,3  | 7.92    |
| Reducción runner-min | —     | 29.9 %  |

## Runs

| Run                                                                                | SHA       | Resultado | Duración | Cola | Runner-min |
| ---------------------------------------------------------------------------------- | --------- | --------- | -------- | ---- | ---------- |
| [43111610312](https://github.com/povedica/tick-tack-done/actions/runs/43111610312) | `4bcd63e` | success   | 3:39     | 0:32 | 7.92       |

## Jobs correctos

Quality, OpenAPI y navegador son checks de resultado; su ejecución real comparte el job code-checks.
No comparar sus segundos de resumen con los antiguos jobs completos. Unitarios e integración ejecutan sus suites completas.

| Job                   | N   | Mediana | p90  |
| --------------------- | --- | ------- | ---- |
| changes               | 1   | 0:16    | 0:16 |
| ci-ok                 | 1   | 0:03    | 0:03 |
| code-checks           | 1   | 2:39    | 2:39 |
| infra-check           | 1   | 0:22    | 0:22 |
| openapi-check         | 1   | 0:04    | 0:04 |
| public-tree-guard     | 1   | 0:17    | 0:17 |
| quality               | 1   | 0:02    | 0:02 |
| r80-browser-contracts | 1   | 0:04    | 0:04 |
| test-integration      | 1   | 2:10    | 2:10 |
| test-unit             | 1   | 1:58    | 1:58 |

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
