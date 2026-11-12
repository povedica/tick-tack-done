# BKL-046 · Candidato anterior 6ede440 (carrera de navegación del test)

Método: API de Actions. Duración desde created_at hasta el último completed_at; incluye cola.
Runner-min = suma de duración de jobs activos (skipped excluidos). p90 por rango más próximo.
La muestra solo incluye PR runs de esta rama con la misma definición de CI y scripts que el candidato.
Los candidatos previos y cancelaciones causadas por cambiar el diseño no se mezclan en esta muestra.
Se conservan resultados fallidos/cancelados si pertenecen a esta definición; no se filtran para mejorar estadísticas.
Fecha y datos exactos: [bkl-046-runs.json](bkl-046-candidate-6ede-runs.json).

La línea base de #158 es de 30 runs (11/11/2026). Objetivos de Pablo: ≤3:30 mediana, ≤4:30 p90 y ≤7,9 runner-min.
No se da por aceptado el candidato sin medir la muestra suficiente y el head verde.

| Métrica              | Antes | Después |
| -------------------- | ----- | ------- |
| Nº de runs           | 30    | 3       |
| Duración mediana     | 4:38  | 2:50    |
| Duración p90         | 5:45  | 2:54    |
| Runner-min mediana   | 11,3  | 7.42    |
| Reducción runner-min | —     | 34.4 %  |

## Runs

| Run                                                                                | SHA       | Resultado | Duración | Cola | Runner-min |
| ---------------------------------------------------------------------------------- | --------- | --------- | -------- | ---- | ---------- |
| [43117956330](https://github.com/povedica/tick-tack-done/actions/runs/43117956330) | `6ede440` | success   | 2:50     | 0:02 | 7.52       |
| [43118529362](https://github.com/povedica/tick-tack-done/actions/runs/43118529362) | `9c92f9c` | success   | 2:46     | 0:02 | 7.42       |
| [43118941115](https://github.com/povedica/tick-tack-done/actions/runs/43118941115) | `8a799f9` | failure   | 2:54     | 0:02 | 7.07       |

## Jobs correctos

Quality, OpenAPI y navegador son checks de resultado; su ejecución real comparte el job code-checks.
No comparar sus segundos de resumen con los antiguos jobs completos. Unitarios e integración ejecutan sus suites completas.

| Job                   | N   | Mediana | p90  |
| --------------------- | --- | ------- | ---- |
| changes               | 3   | 0:06    | 0:06 |
| ci-ok                 | 2   | 0:02    | 0:03 |
| code-checks           | 3   | 2:12    | 2:20 |
| infra-check           | 3   | 0:27    | 0:31 |
| openapi-check         | 3   | 0:04    | 0:04 |
| public-tree-guard     | 3   | 0:18    | 0:18 |
| quality               | 3   | 0:03    | 0:03 |
| r80-browser-contracts | 2   | 0:04    | 0:04 |
| test-integration      | 3   | 2:37    | 2:40 |
| test-unit             | 3   | 1:35    | 1:40 |

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
