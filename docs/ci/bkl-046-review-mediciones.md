# BKL-046 · Revisión de Pablo: mediciones de CI

Esta muestra corresponde a la revisión del 12/11 y al merge de main con BKL-058. Son dos runs nuevos, no otra muestra de diez. La muestra anterior de diez runs permanece en [bkl-046-mediciones.md](bkl-046-mediciones.md). #95 aún no está fusionada: perf-k6 no forma parte de estas cifras.

Método: API de Actions. Duración desde created_at hasta el último completed_at; incluye cola.
Runner-min = suma de duración de jobs activos (skipped excluidos). p90 por rango más próximo.
La muestra solo incluye PR runs de esta rama con la misma definición de CI y scripts que el candidato.
Los candidatos previos y cancelaciones causadas por cambiar el diseño no se mezclan en esta muestra.
Se conservan resultados fallidos/cancelados si pertenecen a esta definición; no se filtran para mejorar estadísticas.
Fecha y datos exactos: [bkl-046-review-runs.json](bkl-046-review-runs.json).

La línea base de #158 es de 30 runs (11/11/2026). Objetivos de Pablo: ≤3:30 mediana, ≤4:30 p90 y ≤7,9 runner-min.
No se da por aceptado el candidato sin medir la muestra suficiente y el head verde.

| Métrica              | Antes | Después |
| -------------------- | ----- | ------- |
| Nº de runs           | 30    | 2       |
| Duración mediana     | 4:38  | 2:52    |
| Duración p90         | 5:45  | 2:52    |
| Runner-min mediana   | 11,3  | 6.88    |
| Reducción runner-min | —     | 39.2 %  |

## Runs

| Run                                                                                | SHA       | Resultado | Duración | Cola | Runner-min |
| ---------------------------------------------------------------------------------- | --------- | --------- | -------- | ---- | ---------- |
| [43210038754](https://github.com/povedica/tick-tack-done/actions/runs/43210038754) | `cd883d6` | success   | 2:52     | 0:02 | 6.78       |
| [43210517532](https://github.com/povedica/tick-tack-done/actions/runs/43210517532) | `bedbae0` | success   | 2:51     | 0:02 | 6.97       |

## Jobs correctos

Quality, OpenAPI y navegador son checks de resultado; su ejecución real comparte el job code-checks.
No comparar sus segundos de resumen con los antiguos jobs completos. Unitarios e integración ejecutan sus suites completas.

| Job                   | N   | Mediana | p90  |
| --------------------- | --- | ------- | ---- |
| changes               | 2   | 0:07    | 0:07 |
| ci-ok                 | 2   | 0:04    | 0:04 |
| code-checks           | 2   | 2:11    | 2:26 |
| infra-check           | 2   | 0:23    | 0:24 |
| openapi-check         | 2   | 0:04    | 0:04 |
| public-tree-guard     | 2   | 0:16    | 0:16 |
| quality               | 2   | 0:04    | 0:04 |
| r80-browser-contracts | 2   | 0:04    | 0:04 |
| test-integration      | 2   | 2:25    | 2:34 |
| test-unit             | 2   | 1:17    | 1:17 |

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
