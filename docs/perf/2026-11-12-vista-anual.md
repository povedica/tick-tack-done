# Vista anual — medición del 12 de noviembre de 2026

Informe de la issue #109. La base de la PR sigue siendo `perf/f1`. Staging no
sirve esta rama, así que el navegador y k6 se midieron en local contra una
base efímera `reflexionia_perf`. No se tocó producción ni la base de demo.

El cliente instalado marca `prefetchQuery` como obsoleto. La precarga del día
usa `queryClient.query(...).catch(() => undefined)`.

## Antes

Cifras ya publicadas en #109, perfil ×100, CPU 4×, camino anterior:

| Medida                                                     | Valor    |
| ---------------------------------------------------------- | -------- |
| Año en frío                                                | 9.462 ms |
| TBT                                                        | 4.577 ms |
| Tarea larga                                                | 2.924 ms |
| `events` p95 (F1, 28 oct, antes de las lecturas por rango) | 2.309 ms |

## Navegador, seed S

Playwright `perf`, CPU 4×, Pixel 7, `Europe/Madrid`, tres repeticiones por
pasada. La mediana de cada pasada:

| Pasada | Año en frío | Año siguiente |    TBT | Tarea larga |
| ------ | ----------: | ------------: | -----: | ----------: |
| 1      |    1.158 ms |        225 ms | 271 ms |      156 ms |
| 2      |      733 ms |        251 ms | 245 ms |      142 ms |
| 3      |    1.122 ms |        237 ms | 261 ms |      144 ms |

Presupuesto estricto de la §1: año ≤ 1.000 ms, año siguiente ≤ 200 ms, TBT ≤
200 ms, tarea larga ≤ 150 ms. Con el margen del 30 % de la §5.2 los topes de
CI quedan en 1.300 ms, 300 ms, 260 ms y 200 ms. La §5.2 no lista el TBT; 260 ms
es el 30 % sobre 200 ms.

El año en frío y la tarea larga entran en el tope de CI. El año siguiente
también (queda por encima de 200 ms). El TBT entra solo en la pasada 2. La
mediana de las tres pasadas es 261 ms, 1 ms por encima de 260. No se sube el
tope.

## Navegador, perfil ×100

Una pasada, mediana de tres repeticiones, CPU 4×, Pixel 7, `vite preview`
contra la API efímera. No es un umbral y no hace fallar la CI.

| Vista     |  En frío | Interacción |    TBT | Tarea larga |
| --------- | -------: | ----------: | -----: | ----------: |
| Año       | 1.489 ms |      311 ms | 553 ms |      275 ms |
| Abrir mes | 1.539 ms |    1.541 ms | 639 ms |      291 ms |
| Mes       | 1.942 ms |      142 ms | 847 ms |      579 ms |
| Semana    | 1.374 ms |      164 ms | 488 ms |      234 ms |

La interacción del año es el gesto al año siguiente. Frente a los 9.462 ms,
4.577 ms y 2.924 ms del camino anterior, el año baja, y sigue por encima del
presupuesto estricto de la §1.

## Peticiones de la vista

En el servidor de desarrollo, con el usuario demo. Esa cuenta tiene la copia
local importada (516 tareas activas, 385 con fecha):

- CA-R1-1: una petición de resumen, una de suscripciones y una de proyectos.
  Cero `GET /tasks/:id`. El listado de vencidas del raíl y los proyectos
  archivados de la barra lateral no cuentan como peticiones de la vista.
- CA-R1-3: la segunda carga del resumen responde 304. El cliente guarda
  `{etag, body}` en `sessionStorage` y manda `If-None-Match`.
- CA-R1-4: la mediana de tres aperturas de día, con CPU 4× y la precarga en
  `pointerdown`, queda en 200 ms o menos.

## k6

Escenario de la §6.4: `usuario` (1 VU) y después `rafaga` (10 iteraciones por
segundo). Cada iteración pide resumen, proyectos, suscripciones, una página de
tareas, los eventos del año y el rango del día centinela. Umbrales, solo con
`TTD_GATE=1`: p95 de ráfaga < 200 ms en resumen, tareas, eventos, suscripciones
y rango; proyectos < 150 ms; errores < 0,1 %; `Server-Timing total` p95 < 50 ms
en `usuario`. Suscripciones y rango usan el «todas las llamadas de la vista» de
CA-R4. El script rechaza cualquier base que no sea localhost efímero.

Seed S, 1 min + 1 min, umbral activo, salida 0. p95 de ráfaga (n = 600):

| Llamada       |     p95 |
| ------------- | ------: |
| resumen       | 11,0 ms |
| proyectos     |  8,2 ms |
| suscripciones |  6,5 ms |
| tareas        | 11,6 ms |
| eventos       | 10,3 ms |
| rango         |  6,2 ms |

`Server-Timing total` en `usuario`: p95 5,8 ms (n = 13.518).

Perfil ×100, 30 s + 30 s, sin umbral de CI. p95 de ráfaga (n = 300):

| Llamada       |    p95 |
| ------------- | -----: |
| resumen       | 8,8 ms |
| proyectos     | 5,1 ms |
| suscripciones | 4,7 ms |
| tareas        | 4,1 ms |
| eventos       | 4,1 ms |
| rango         | 3,5 ms |

`Server-Timing total` en `usuario`: p95 0,5 ms. Esa pasada heredó el umbral y
k6 salió por `http_req_failed` (por encima del 0,1 %). No quedó el porcentaje
exacto. La pasada siguiente, de 5 s + 5 s, tuvo 0 fallos en 6.234 peticiones
y un p95 global de 2,1 ms.

El job `perf-k6-vista` aplica el umbral al seed S. El job `perf-k6` anterior
sigue siendo la línea base ×100 sin estos p95.

## Lighthouse

`scripts/perf/lighthouse-year.mjs` contra `vite preview` y
`scripts/perf/lighthouse-api.mjs` (la API simulada). Móvil, 4G lento simulado.
Umbrales de R3, sin bajarlos: Performance ≥ 85, LCP ≤ 2,5 s, TBT ≤ 200 ms.

| Pasada     | Performance |      LCP |    TBT |
| ---------- | ----------: | -------: | -----: |
| Script     |          67 | 4.325 ms | 515 ms |
| Repetición |          62 | 4.378 ms | 687 ms |

El elemento de LCP es el botón «Sincronizar ahora» de la barra del calendario.
El 90 % del LCP es espera de render. R3 no se cumple. El script sale con error
y no está en CI: un job rojo dejaría la PR en rojo con el umbral intacto, y
bajar el umbral no corresponde.

## Carga progresiva

El año pinta primero el mes visible y los dos vecinos. El resto entra en
`requestIdleCallback` (400 ms) o, si no existe, en un temporizador de 1 ms. El
trimestre, de tres meses, se pinta entero. Las tarjetas ya tenían
`content-visibility: auto`. No hay endpoint nuevo: partir el resumen rompería
el tope de tres peticiones. La API y el MCP no cambian.
