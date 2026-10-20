# Especificación funcional y visual: pantalla de Estadísticas de tick-tack-done (v2)

Fecha: 2026-10-20 · Estado: propuesta para implementación (lista para agente de código)
Cambios v1 → v2: se conserva toda la parte funcional (métricas, endpoints, valor de logro, fases) y se amplía a fondo la parte visual: **diseño token a token contra la app real, maquetación por pestaña en escritorio y móvil con bocetos, estilo de cada gráfico, estados, interacciones, accesibilidad y rendimiento percibido**. Se añaden los defectos visuales detectados al revisar en vivo Reportes, Jardín, Foco y Hábitos (20-10-2026, commit desplegado `8b1ad1f`).

Ámbito: funcionalidad **nueva**, separada de la auditoría UI/UX general. Objetivo de Pablo: **igualar como mínimo y mejorar** la pantalla de Estadísticas de TickTick (`ticktick.com/webapp/#statistics/overview`), adaptada a tick-tack-done (self-hosted: tareas, hábitos, pomodoro/foco, cuenta atrás, planificación diaria).

---

## 1. Objetivo y criterio de éxito

Crear una pantalla de **Estadísticas** que responda, de un vistazo, tres preguntas:

1. ¿Estoy completando lo que me propongo? (tareas)
2. ¿Cuánto tiempo enfocado dedico y dónde? (foco/pomodoro)
3. ¿Sostengo mis hábitos? (hábitos)

Criterio de éxito: un usuario que venga de TickTick encuentre **todo lo que TickTick muestra** (tendencia de tareas completadas, tasa de completitud, valor de logro, estadísticas de foco con rejilla anual y distribución por lista/etiqueta) **y además**:

- filtros cruzados (lista, etiqueta, prioridad) que TickTick no tiene en su overview,
- unión real de tareas + foco + hábitos en una sola pantalla coherente,
- explicabilidad: cada número se puede desplegar para ver cómo se calcula,
- exportación local (CSV/JSON), coherente con la filosofía self-hosted.

Y a nivel visual: que esta pantalla sea **el escaparate de la app**. Hoy las pantallas de datos (Reportes, Jardín) son tarjetas apiladas a todo lo ancho con un número suelto; Estadísticas debe demostrar rejilla, jerarquía y gráficos cuidados.

## 2. Estado actual (verificado en producción el 2026-10-20, commit `8b1ad1f`)

### 2.1. Lo que existe

- **`/reports/weekly` ("Reportes")**: narrativa semanal en texto ("La semana fue floja. Completadas 214 de 311 creadas…"), botón "Calcular esta semana", selector de semana y 6 tarjetas sueltas: Completadas, Creadas, Vencidas arrastradas, Minutos de foco, Hábitos cumplidos, Tendencia. Sin gráficos, sin filtros, sin histórico navegable.
- **`/dashboard` ("Jardín digital")**: widgets apilados (Completadas hoy/semana, Vencidas, Próximos 7 días, Creadas, Hábitos, Tendencia, Calendario, Integraciones, Foco, Próximas cuentas atrás, Logros). Existe ya un módulo de puntuación ("Logros · Puntuación activada · 3080").
- **`/focus`**: temporizador (25:00, chips 15/25/50, botón Empezar) y una línea de texto "Racha 2 · Pomodoros 3 · Minutos de foco 397". Sin estadísticas visuales.
- **`/habits`**: check-in semanal (círculos L-D), heatmap agregado "Todos los hábitos" (365 celdas), sugerencias y tarjetas por hábito con "Ver hábito", nota y Archivar.
- **`/statistics` no existe**: la ruta redirige a `/today` (la SPA devuelve 200 y el router manda a Hoy).
- **API existente** (base sobre la que construir):
  - `GET/POST /reports/weekly`, `GET /reports/weekly/:week` (RF-2201 a RF-2204): reporte narrativo semanal.
  - `GET /focus/stats` (RF-1204): `focus_seconds`, `completed_pomodoros`, `by_list`, `by_tag`, `streak_days`, `best_hour`.
  - `GET /habits/:id/stats` (RF-1303): rachas, % de cumplimiento y heatmap anual por hábito.
  - Dashboard con widgets (`completed_today`, `completed_week`, `overdue`, `next_7_days`, `flow`, `habits`, `load`, `focus`, `next_countdowns`).
- **Modelo de datos** (Prisma, todo lo necesario ya existe): `Task` (con `completedAt`, `createdAt`, `dueDate`, `status`, `priority`, `projectId`, tags vía `TaskTag`, `repeatRule`/`seriesId`, `estimatedPomodoros`, `durationMinutes`), `Habit`/`HabitLog`, `FocusSession` (`type`, `plannedMinutes`, `actualSeconds`, `startedAt`, `completed`, `interruptedCount`, `taskId`), `Countdown`, `ActivityLog`, `WeeklyReport`, `DayPlan`.
- **Web app** (verificado en `apps/web/package.json` de main): React 19 + Vite, TanStack Query 5, Zustand 5, react-router 7, lucide-react 1.59. **No hay ninguna librería de gráficos instalada.**

### 2.2. Defectos observados (arreglar en F0; los 5 de v1 más los nuevos de esta pasada)

En `/reports/weekly`:

1. **Inconsistencia de foco**: la narrativa dice "Tiempo de foco: 132 minutos" y la tarjeta "Minutos de foco" muestra **0** en la misma semana. Dos fuentes de cálculo distintas.
2. **Tarjeta "Tendencia" sin significado**: muestra "214" sin unidad ni comparación visible (¿+214? ¿igual que la semana anterior?).
3. **"Hábitos cumplidos: 0"** sin contexto (¿0 de cuántos? ¿de hoy o de la semana?).
4. Sin estado de carga diferenciado: al entrar se ve "Todavía no hay un reporte de esta semana" aunque luego aparezca contenido calculado.
5. Las tarjetas no enlazan a nada: no se puede profundizar en el número.
6. **Tarjetas `.widget` a todo lo ancho apiladas** (medido: 879 px de ancho cada una, borde `1px dashed #d9dce3`, radio 12px, padding 12px): una columna interminable de tarjetas idénticas con un número grande y mucho aire. El borde discontinuo las hace parecer placeholders.
7. El botón **"Calcular esta semana" flota suelto** arriba a la derecha (en móvil queda a media altura, solapado con la narrativa) y la semana se elige con un `<select>` nativo de fechas (`2026-10-19`) sin etiquetas humanas ("Semana del 19 al 25 de octubre").

En `/dashboard` (Jardín digital):

8. **Widget "Tendencia" completamente vacío** (tarjeta en blanco con solo el título).
9. **Widget "Calendario" muestra solo "315"**: número sin unidad ni explicación.
10. **Widget "Creadas" duplica el rótulo**: título "Creadas" y contenido "Creadas 344 · Completadas 307 · Saldo -37".
11. **Widget "Logros" contradictorio**: título "Puntuación activada · 3080" y debajo un botón que dice "Puntuación desactivada" (¿estado o acción?). Es el embrión del valor de logro de esta spec: unificar (§8).
12. "Completadas esta semana: 307 · Tendencia 307": otra vez "Tendencia" como número suelto sin comparación.

En `/focus` y `/habits`:

13. Foco muestra sus estadísticas como **una línea de texto plano** ("Racha 2 · Pomodoros 3 · Minutos de foco 397"), sin tarjetas ni gráficos; y "Minutos de foco 397" no cuadra con "2 h 12 min" del widget Foco del Jardín para hoy (revisar fuentes, mismo problema que el punto 1).
14. Hábitos: los círculos de día L-D miden ~30 px (**bajo el mínimo táctil de 44 px**, `--tap: 2.75rem`); el heatmap "Todos los hábitos" son celdas de 9×9 px **sin radio** y todas grises (`--border-strong`, sin escala de intensidad); el botón "Ver hábito" es un botón nativo gris estirado que parece un input.
15. En móvil (390 px) Reportes y Jardín heredan la pila de tarjetas con márgenes correctos pero **sin aprovechar rejilla de 2 columnas para KPIs pequeños**, y el botón "Calcular esta semana" queda en mitad del texto.

## 3. Referencias analizadas

| Referencia                                                                                | Qué aporta                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TickTick – Achievements & Statistics** (help.ticktick.com/articles/7082302534169133056) | Valor de logro con 12 niveles; puntos por completar, penalización por vencer; solo acciones propias (listas compartidas excluidas); tendencia de tareas completadas por día/semana/mes; **tasa de completitud = completadas / planificadas para ese período**. Los puntos se actualizan a las 00:00, no en tiempo real.                                       |
| **TickTick – Focus Statistics** (help.ticktick.com/articles/7055781966800486400)          | Tendencia de foco por semana/mes/año; **línea temporal del día** (bloques sobre regla de 24 h); hora más enfocada del mes; **Year Grids** (rejilla anual, intensidad de color = minutos de foco); distribución del tiempo por lista/etiqueta/tarea con selector Día/Semana/Mes/Personalizado; registros de foco filtrables por fecha, duración y vinculación. |
| **TickTick – acceso**                                                                     | La entrada a Estadísticas es **avatar → "Statistics"** en el menú de cuenta; dentro, pestañas (Tasks / Focus). Es el patrón a replicar (§5).                                                                                                                                                                                                                  |
| **Todoist – Karma**                                                                       | Gamificación simple: puntos por completar a tiempo, rachas, objetivos diarios/semanales configurables. Referencia para el valor de logro.                                                                                                                                                                                                                     |
| **Habitify**                                                                              | Métricas de hábitos claras: racha actual, mejor racha, % cumplimiento, calendario-heatmap por hábito.                                                                                                                                                                                                                                                         |
| **GitHub – contribution graph**                                                           | Referencia de heatmap anual: celdas cuadradas con radio pequeño, 5 niveles de intensidad, tooltip por día, leyenda "Menos → Más".                                                                                                                                                                                                                             |

Conclusión: para "igualar" a TickTick hacen falta (a) tendencia de completadas, (b) tasa de completitud, (c) valor de logro con niveles, (d) estadísticas de foco con heatmap anual y distribución, (e) equivalente para hábitos. Para "mejorar": filtros cruzados, explicabilidad, exportación y unión de las tres áreas.

## 4. Alcance

**Dentro:** pantalla `/statistics` con cuatro pestañas (Resumen, Tareas, Foco, Hábitos), selector de rango temporal, filtros, endpoints agregados nuevos, valor de logro, exportación, corrección de los defectos de §2.2, y **todo el diseño visual de §10**.

**Fuera (no tocar):** motor del reporte narrativo semanal (RF-2201 a RF-2204 se mantienen; la nueva pantalla enlaza a él), pantalla de Foco (timer), pantalla de Hábitos (check-in), widgets del dashboard. La auditoría UI/UX general y el capítulo de Hábitos van en documentos separados. Los defectos visuales de §2.2 puntos 6-15 se corrigen aquí solo en lo que afecta a Estadísticas; el resto va a la auditoría general (referenciarlos).

## 5. Acceso y navegación

- Entrada principal: **menú de la cuenta** (foto de perfil, esquina superior izquierda), opción "Estadísticas", replicando el patrón de TickTick (Settings, Statistics…). Dependencia: ese menú de cuenta aún no existe; forma parte de la auditoría general. Si se implementa Estadísticas antes, la entrada temporal es un ítem "Estadísticas" en el sidebar principal (junto a Reportes), que luego se mueve al menú de cuenta.
- Ruta: `/statistics` con subrutas `/statistics/tasks`, `/statistics/focus`, `/statistics/habits` (deep-linkable, pestaña activa en la URL). Hoy `/statistics` redirige a `/today`; crear la ruta real.
- Rango y filtros también en la URL (`?range=week&from=…&to=…&list=…&tag=…&priority=…`) para compartir/enlazar y para que el botón atrás funcione.
- Desde `/reports/weekly` añadir enlace "Ver estadísticas" y viceversa ("Ver reporte semanal narrativo").
- En móvil la entrada temporal vive en el menú **"Más"** de la barra inferior.
- _Decisión abierta D1:_ si "Reportes" del sidebar pasa a llamarse "Estadísticas" y absorbe el reporte narrativo como una pestaña más. **Propuesta por defecto: no**; mantener dos entradas (Reportes = narrativa semanal; Estadísticas = cuadro de mando), porque responden a momentos distintos.

## 6. Estructura de la pantalla (funcional)

### 6.1. Cabecera (común a las 4 pestañas)

- **Selector de rango**: Hoy · Semana · Mes · Año · Personalizado (date-picker desde/hasta, máximo 2 años). Semana = lunes a domingo (locale es-ES). Persistir la última selección en `localStorage` y reflejarla en la URL.
- **Filtros** (multi-selección, aplican a todas las pestañas salvo donde se indique): Lista/proyecto, Etiqueta, Prioridad. Chips activos visibles con opción de quitar.
- **Acciones**: botón Exportar (CSV y JSON del rango filtrado), enlace "Reporte semanal".
- Debajo del título, una frase-resumen honesta en texto (heredando el espíritu del reporte narrativo): "Esta semana: 214 completadas de 311 planificadas (69 %), 2 h 12 min de foco, hábitos al 0 %."

### 6.2. Pestaña Resumen

Tarjetas KPI (clicables, llevan a la pestaña correspondiente con el filtro aplicado):

1. **Completadas** en el rango (+ variación frente al rango anterior equivalente, con flecha y %).
2. **Tasa de completitud**: completadas / planificadas para el rango (definición TickTick: tareas con fecha en el rango que se completaron dentro del rango). Mostrar numerador/denominador al pasar el ratón.
3. **Tiempo de foco** total (+ nº de pomodoros completados).
4. **Hábitos cumplidos**: % medio de cumplimiento de los hábitos activos en el rango (n/m días).
5. **Racha de días productivos**: días consecutivos con ≥1 tarea completada (actual y mejor del año).
6. **Valor de logro** con nivel actual y progreso al siguiente nivel (ver §8).

Gráficos:

- **Tendencia de completadas vs creadas**: línea o barras por día (rango semana/mes) o por semana (rango año). Es el gráfico central de TickTick; debe ser el protagonista visual.
- **Mejor momento**: mini-gráfico de completadas por día de la semana (lunes-domingo) y por franja horaria (mañana/tarde/noche), para responder "cuándo rindo más".

### 6.3. Pestaña Tareas

- Tendencia de completadas y creadas (como en Resumen, aquí a pantalla completa).
- **Tasa de completitud** por semana/mes, con línea de tendencia.
- **Distribución de completadas**: por lista, por etiqueta, por prioridad (barras horizontales con %).
- **Puntualidad**: % completadas a tiempo vs tarde (respecto a `dueDate`); media y mediana de días de retraso.
- **Edad de la tarea al completar**: media y mediana desde `createdAt` hasta `completedAt`.
- **Vencidas arrastradas**: evolución del stock de vencidas sin completar (área apilada por antigüedad: <7 días, 7-30, >30).
- **Estimaciones**: precisión pomodoro cuando `estimatedPomodoros` existe vs sesiones reales de foco asociadas (media de desviación). _Decisión abierta D6 (fase posterior)._

### 6.4. Pestaña Foco

Todo lo de TickTick Focus Statistics, calculado desde `FocusSession`:

- **Minutos de foco y pomodoros** por día/semana/mes (tendencia).
- **Línea temporal del día seleccionado**: bloques de foco sobre una regla de 24 h (tipo timeline de TickTick).
- **Hora más enfocada**: histograma por hora de inicio (equivalente a `best_hour` ya expuesto por `GET /focus/stats`).
- **Rejilla anual** (heatmap estilo GitHub/TickTick Year Grids): intensidad = minutos de foco del día; clic en un día → detalle del día.
- **Distribución del foco** por lista, por etiqueta y por tarea (barras con minutos y %). Las sesiones sin tarea van al grupo "Sin tarea".
- **Calidad**: % de sesiones completadas vs abandonadas, media de interrupciones (`interruptedCount`) por sesión.
- Filtros de la cabecera aplican; además filtro propio por tipo de sesión (foco/descanso corto/descanso largo), por defecto solo foco.

### 6.5. Pestaña Hábitos

- Tarjeta por hábito activo: nombre, icono/color, **racha actual**, **mejor racha**, **% de cumplimiento** en el rango, mini-heatmap del año (reutilizar la lógica de `GET /habits/:id/stats`).
- **Vista agregada**: % de cumplimiento global por día (línea), ranking de hábitos más y menos cumplidos, **día de la semana más flojo** por hábito.
- Los filtros de lista/etiqueta no aplican aquí (los hábitos no tienen listas); mostrar solo el selector de rango.

## 7. Modelo de datos y endpoints

### 7.1. Origen de cada métrica (todo deriva de tablas existentes; no hace falta ingesta nueva)

| Métrica              | Tabla y campos                                         | Notas de cálculo                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completadas          | `Task.completedAt`, `status`                           | `deletedAt IS NULL`; en zona horaria del usuario (`User`/tarea `timeZone`, por defecto Europe/Madrid).                                                                                |
| Creadas              | `Task.createdAt`                                       | Igual.                                                                                                                                                                                |
| Tasa de completitud  | `Task.dueDate` + `completedAt`                         | Denominador: tareas con `dueDate` en el rango (o creadas en el rango si no hay fecha — _decisión abierta D2_). Canceladas ("No haré", `status = cancelled`) excluidas de ambos lados. |
| Puntualidad          | `dueDate` vs `completedAt`                             | A tiempo = `completedAt <= dueDate` (+ tolerancia de día completo si `isAllDay`).                                                                                                     |
| Vencidas arrastradas | `dueDate < now`, `status = active`                     | Stock a fecha de corte de cada punto del gráfico.                                                                                                                                     |
| Recurrentes          | `seriesId`, ocurrencias                                | Cada ocurrencia completada cuenta como una completada en su fecha. No duplicar la serie (usa la misma lógica de expansión que el resto de la app).                                    |
| Foco                 | `FocusSession`                                         | `type = focus`, `actualSeconds`, `startedAt`, `completed`, `interruptedCount`; distribución vía `taskId → projectId, tags`. Sesiones sin tarea = grupo "Sin tarea".                   |
| Hábitos              | `Habit` (`goal`, `frequency`), `HabitLog`              | Cumplimiento diario = `count >= goal` en días que la `frequency` marca como esperados. Reutilizar el cálculo de `habits.service.stats` para no divergir.                              |
| Valor de logro       | derivado de `ActivityLog` o de las métricas anteriores | Ver §8. Ya existe un módulo de puntuación en el Jardín ("Logros · 3080"): **unificar**, no crear una segunda puntuación paralela.                                                     |

### 7.2. Endpoints nuevos propuestos (módulo `stats`, RF-2301+)

```
GET /stats/overview?from&to&tz&list&tag&priority   → KPIs de Resumen + serie tendencia
GET /stats/tasks?from&to&tz&list&tag&priority      → series y distribuciones de la pestaña Tareas
GET /stats/focus?from&to&tz&list&tag&type          → series, timeline, heatmap anual, distribución
GET /stats/habits?from&to&tz                       → tarjetas por hábito + agregados
GET /stats/achievement                             → valor de logro, nivel, historial de cambios
GET /stats/export?from&to&format=csv|json          → exportación del rango filtrado
```

- **Scope OAuth nuevo `stats:read`** (o composición de `tasks:read` + `focus:read` + `habits:read`; _decisión abierta D3_, propuesta por defecto: scope nuevo, más claro para tokens MCP/API).
- Respuestas **agregadas en servidor** (SQL con `date_trunc`/buckets en la zona horaria pedida): el cliente nunca descarga filas crudas para pintar. Parámetro `tz` obligatorio (la web manda `Europe/Madrid`).
- Siempre filtrar `deletedAt IS NULL` y `ownerId = usuario autenticado`.
- **Una sola fuente de cálculo por métrica**: los agregados de foco y hábitos deben salir del mismo SQL que alimenta Reportes y los widgets del Jardín (hoy divergen: 132 min vs 0; 397 min vs 2 h 12 min). Extraer el cálculo a un servicio compartido `metrics.service` usado por `reports`, `dashboard` y `stats`.
- **Caché/precálculo**: _decisión abierta D4_. Propuesta por defecto: **cálculo bajo demanda en F1-F2** (volúmenes de un solo usuario lo permiten) y añadir tabla `stats_daily` materializada por día solo si los tiempos superan ~500 ms en la pestaña Resumen. Revisar índices: `(owner_id, completed_at)` en `tasks`, `(owner_id, started_at)` en `focus_sessions`, `(owner_id, habit_id, date)` en `habit_logs`.

## 8. Valor de logro (gamificación)

Equivalente al Achievement Value de TickTick / Karma de Todoist, con mejora de **transparencia**:

- **Puntuación**: sube por completar tareas (más si es a tiempo, más cuanto mayor prioridad), por pomodoros completados y por check-ins de hábitos; baja por tareas que vencen sin completar. Fórmula exacta documentada y visible en la propia pantalla ("¿Cómo se calcula?") — TickTick la oculta; aquí será abierta.
- **12 niveles** con nombres propios y umbral visible; barra de progreso al siguiente nivel.
- **Reglas anti-fraude** (copiadas de TickTick): solo cuentan acciones propias; en listas compartidas, las tareas completadas por otros ni suman ni restan; las asignadas a otros que se retrasan no penalizan.
- Actualización: TickTick lo hace a las 00:00; propuesta: **en tiempo real** (es barato al derivarse de agregados) con histórico diario para la curva de evolución.
- **Unificar con el módulo "Logros" del Jardín**: ya existe una puntuación (3080). Esta spec la absorbe: misma puntuación, mismo historial; el widget del Jardín pasa a enlazar a `/statistics`. Corregir su botón contradictorio ("Puntuación activada" / "Puntuación desactivada") — §2.2 punto 11.
- _Decisión abierta D5_: permitir desactivar la gamificación en Ajustes. **Propuesta por defecto: sí**, visible por defecto y ocultable.

## 9. Privacidad y seguridad

- Self-hosted: todo el cálculo ocurre en el servidor del propio usuario; **ningún dato sale a terceros** (sin analytics externo en esta pantalla; la librería de gráficos se sirve en el bundle, nada de CDN).
- Multiusuario: cada endpoint filtra por `ownerId` del token; en listas compartidas, las estadísticas muestran **solo la actividad del propio usuario** (completadas por él, foco suyo), salvo que se decida una vista de equipo futura (fuera de alcance).
- Exportación CSV/JSON generada en local, sin registro adicional.
- Tokens MCP/PAT: el scope `stats:read` permite leer agregados sin exponer contenido de tareas (los agregados no devuelven títulos salvo en la distribución por tarea de Foco, que requerirá además `tasks:read` — documentarlo).

## 10. Diseño visual, maquetación y UX (nuevo en v2)

Todo lo medido abajo viene de la app en producción (20-10-2026). Regla de oro: **Estadísticas consume los tokens existentes, no inventa valores**. Si un valor no existe como token, se propone añadirlo al theme, no hardcodearlo.

### 10.1. Design tokens reales de la app (extraídos en vivo)

`<html lang="es" data-theme="light" data-density="comfortable" data-accent="indigo">` — la app ya soporta **tema claro/oscuro, densidad y color de acento**. Los gráficos deben leer los tokens en render y volver a pintarse al cambiar `data-theme`/`data-accent`.

**Color (claro / oscuro):**

| Token                                                          | Claro                                         | Oscuro                          | Uso en Estadísticas                                                |
| -------------------------------------------------------------- | --------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `--accent`                                                     | `#4772fa`                                     | `#4772fa`                       | serie principal, KPI activo, nivel de logro                        |
| `--accent-hover` / `--accent-active`                           | `#6c8efb` / `#3e60cd`                         | iguales                         | estados hover/activo, 2º tono de la serie                          |
| `--accent-soft`                                                | `rgba(71,114,250,.12)`                        | `rgba(71,114,250,.34)`          | áreas de relleno, fondo de chips, segmento seleccionado            |
| `--success`                                                    | `#1f9d55`                                     | `#3dbe74`                       | variación positiva, "a tiempo", hábito cumplido                    |
| `--warning`                                                    | `#faa80c`                                     | `#faa80c`                       | avisos, antigüedad 7-30 días                                       |
| `--danger`                                                     | `#e03131`                                     | `#e03131`                       | variación negativa, vencidas, ">30 días"                           |
| `--prio-high` / `--prio-medium` / `--prio-low` / `--prio-none` | `#e13e39` / `#faa80c` / `#4772fa` / `#b3b3b3` | iguales                         | distribución por prioridad (mismos colores que el resto de la app) |
| `--bg`                                                         | `#ffffff`                                     | `#242424`                       | fondo de página                                                    |
| `--surface`                                                    | `#ffffff`                                     | `#222222`                       | tarjetas                                                           |
| `--surface-2` / `--surface-3`                                  | `rgba(25,25,25,.04)` / `.03`                  | `rgba(255,255,255,.04)` / `.03` | fondos sutiles, pista de barras de progreso, nivel 0 del heatmap   |
| `--ink`                                                        | `#191919`                                     | `#ffffff`                       | texto principal, números KPI                                       |
| `--ink-2` / `--ink-faint`                                      | `rgba(25,25,25,.6)` / `.55`                   | `rgba(255,255,255,.6)` / `.45`  | etiquetas, ejes, texto secundario                                  |
| `--border` / `--border-strong`                                 | `rgba(25,25,25,.05)` / `#d9dce3`              | `rgba(255,255,255,.06)` / `.14` | bordes de tarjeta, gridlines                                       |
| `--info` = `--accent`, `--info-soft` = `--accent-soft`         |                                               |                                 | alias disponibles                                                  |

**Paleta categórica para distribuciones** (por lista/etiqueta/tarea). No existe hoy; propuesta de 8 tonos derivados de los tokens (nuevo token `--chart-1…8`): `#4772fa`, `#1f9d55`, `#faa80c`, `#e13e39`, `#6c8efb`, `#3e60cd`, `#3dbe74`, `#b3b3b3`. El último se reserva para "Sin tarea" / "Otros". En tema oscuro se mantienen los mismos hex salvo `--chart-6 → #8ea6ff` por contraste. Cuando la distribución es por prioridad, **no** usar la paleta categórica: usar los `--prio-*` (coherencia con checkboxes y chips de la app).

**Tipografía (tokens reales):** `--font-sans: system-ui, -apple-system, "Segoe UI", Roboto…`; `--font-mono: ui-monospace, "SF Mono", Menlo…`; tamaños `--fs-xs .75rem`, `--fs-sm .8125rem`, `--fs-base .875rem`, `--fs-md 1rem`, `--fs-lg 1.25rem`, `--fs-xl 1.5rem`, `--fs-2xl 1.75rem`; interlineados `--lh-base 1.5`, `--lh-tight 1.25`. Los números de gráficos y KPIs usan `font-variant-numeric: tabular-nums` (proponer token `--nums: tabular-nums` o utilidad) para que no bailen al actualizarse.

**Espaciado y forma (tokens reales):** escala `--sp-1 … --sp-12` (.25rem → 3rem, base 4px); radios `--radius-sm .375rem`, `--radius-md .625rem`, `--radius-lg .75rem`, `--radius-xl 1rem`, `--radius-full`; sombras `--shadow-sm/md/lg`; `--row-h 2.5rem`, `--tap 2.75rem` (44px), `--dur-fast .15s`, `--dur-base .2s`, `--ease cubic-bezier(.4,0,.2,1)`; `--content-max 46rem`.

**Breakpoints reales en el CSS de la app** (usar estos, no otros): `1024px` (min-width, escritorio), `800px`, `760px`, `720px`, `699px`, `640px`, `639px`. Propuesta: Estadísticas usa **dos cortes**: `≥1024px` escritorio, `<1024px` apilado tipo móvil/tablet. Los demás cortes quedan para ajustes finos (p. ej. heatmap).

### 10.2. Rejilla y layout general

**Escritorio (≥1024px, referencia 1280px):**

- La página va en el contenedor de contenido estándar (scroll en `.outlet`), pero **sin el límite `--content-max: 46rem`**: una pantalla de datos necesita ancho. Propuesta: contenedor propio `max-width: 1080px`, centrado, padding lateral `--sp-6` (24px).
- **Rejilla de 12 columnas, gutter 16px (`--sp-4`)** dentro de ese contenedor. Todo bloque de Estadísticas ocupa 12, 8, 6 o 4 columnas.
- Cabecera pegajosa (`position: sticky; top: 0; background: var(--bg); z-index` sobre los gráficos) para que rango y filtros sigan visibles al hacer scroll.
- Orden vertical: cabecera → pestañas → frase-resumen → contenido de la pestaña.

**Móvil (<1024px, referencia 390px):**

- Una columna, padding lateral `--sp-4` (16px).
- Los KPI pasan a **rejilla de 2 columnas** (3 filas × 2), no a pila de tarjetas a todo lo ancho como hoy en Reportes/Jardín.
- Las pestañas se convierten en **segmented control** a todo lo ancho con scroll horizontal si no caben.
- Los gráficos ocupan el ancho completo; solo el heatmap anual y la regla de 24 h llevan scroll horizontal propio (con indicador de desplazamiento).
- La cabecera no es sticky en móvil (roba alto de pantalla); el segmented control de pestañas sí.

### 10.3. Cabecera: maquetación

Escritorio, una fila de 48px de alto, de izquierda a derecha:

1. **Título "Estadísticas"** (`--fs-xl`, peso 700, `--ink`).
2. **Selector de rango** como segmented control: `Hoy · Semana · Mes · Año · Personalizado`. Estilo: contenedor `background: var(--surface-2); border-radius: var(--radius-full); padding: 2px`; cada opción 32px de alto, `--fs-base`, seleccionada con `background: var(--surface); box-shadow: var(--shadow-sm); color: var(--ink)` (no seleccionada: `--ink-2`). Con "Personalizado", aparece a su derecha el date-picker desde/hasta.
3. **Filtros**: botón "Filtros" con icono `sliders-horizontal` (lucide) y contador (`Filtros · 2`); abre un popover con tres grupos multi-selección (Lista, Etiqueta, Prioridad). Los filtros activos se materializan como **chips** junto al botón: `background: var(--accent-soft); color: var(--accent-ink); border-radius: var(--radius-full); height: 28px; --fs-sm` con × para quitar.
4. **Acciones a la derecha**: botón icono Exportar (`download`, lucide) con menú CSV/JSON; enlace texto "Reporte semanal" (`--accent-ink`).

En móvil: fila 1 = título + icono exportar; fila 2 = segmented de rango a todo lo ancho; fila 3 = chips de filtros con scroll horizontal. "Reporte semanal" pasa al menú ⋯ o al pie.

### 10.4. Pestañas

- Escritorio: tabs de texto con subrayado (`Resumen · Tareas · Foco · Hábitos`): `--fs-md`, activa `color: var(--ink); border-bottom: 2px solid var(--accent)`, inactiva `--ink-2` con hover a `--ink`. Altura 40px. Navegables con flechas de teclado (patrón `tablist` WAI-ARIA).
- Móvil: segmented control (mismo estilo que el selector de rango) a todo lo ancho; si no caben las 4, scroll horizontal sin cortar texto.
- Estado activo sincronizado con la URL (`/statistics/focus` ↔ pestaña Foco) y con `localStorage` como respaldo.

### 10.5. Tarjetas KPI

Rejilla: escritorio 6 KPI en **3 columnas × 2 filas** (cada una 4/12); móvil 2 columnas × 3 filas.

Estilo de tarjeta (sustituye al `.widget` actual con borde dashed):

```
background: var(--surface);
border: 1px solid var(--border-strong);   /* sólido, no dashed */
border-radius: var(--radius-lg);          /* 12px */
padding: var(--sp-4);                      /* 16px */
box-shadow: none;                          /* plano, como el resto de la app */
```

Estructura interna (de arriba abajo):

- **Etiqueta** (`--fs-sm`, `--ink-2`, peso 500): "Completadas".
- **Valor** (`--fs-2xl`, 700, `--ink`, `tabular-nums`): "214". Unidad pequeña junto al número cuando aplica ("2 h 12 min", "69 %").
- **Variación** (`--fs-sm` + icono `trending-up`/`trending-down`/`minus` de lucide): "▲ 12 % vs semana anterior". Verde `--success` si mejora, rojo `--danger` si empeora, `--ink-faint` si sin cambio. Ojo: para "Vencidas" subir es malo — la semántica de color es por métrica, no por signo.
- **Sparkline** opcional (40×14px, trazo 1.5px `--accent`, sin ejes) en las KPI con serie diaria.
- Toda la tarjeta es un `<a>`/`<button>`: hover con `border-color: var(--accent)` y transición `--dur-fast`; focus visible con `--focus-ring`; al hacer clic lleva a la pestaña correspondiente con el rango/filtro aplicado.

La tarjeta de **Valor de logro** es la única distinta: incluye medalla/nivel (icono `award`), nombre del nivel ("Nivel 5 · Constante"), barra de progreso al siguiente nivel (pista `--surface-2`, relleno `--accent`, alto 6px, radio full) y "¿Cómo se calcula?" como enlace que abre un popover con la fórmula pública.

### 10.6. Estilo de los gráficos

Reglas comunes a todos:

- **Fondo transparente** sobre tarjeta `--surface` con el mismo estilo de tarjeta que los KPI (título `--fs-md` 600 + subtítulo `--fs-sm` `--ink-2` cuando haga falta).
- **Ejes**: texto `--fs-xs` en `--ink-faint`; gridlines solo horizontales, `1px var(--border)`, sin bordes de caja ni eje Y visible; números con `tabular-nums` y abreviatura ("1,2 k" solo a partir de 10.000; debajo, número completo).
- **Fechas en español humano**: "lun 19", "19 oct", "sem 42"; nunca ISO crudo (`2026-10-19`) salvo en exportación.
- **Tooltip**: flotante `background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-md); box-shadow: var(--shadow-md); padding: var(--sp-2) var(--sp-3)`; contenido: fecha humana + una fila por serie con punto de color, nombre y valor exacto ("214 completadas · 311 creadas · 69 %"). En táctil, el tooltip se abre con tap y se cierra con tap fuera.
- **Leyenda**: solo cuando hay ≥2 series; fila de pastillas con punto de color + nombre, `--fs-sm`, al pie del gráfico; clic en una pastilla muestra/oculta la serie.
- **Animación**: entrada de 300 ms (`--dur-slow`) como mucho, desactivada con `prefers-reduced-motion`; sin animaciones en bucle.
- **Sin datos en un punto**: hueco honesto (la línea se corta), nunca interpolar a 0.

Por gráfico:

1. **Tendencia completadas vs creadas** (Resumen y Tareas): barras por día (rango semana/mes) o por semana (año). Completadas = barras `--accent` (radio superior 3px); creadas = línea `--ink-3` 1.5px con puntos, o segunda serie de barras `--border-strong`. Eje Y entero (tareas). Alto 260px escritorio / 200px móvil.
2. **Tasa de completitud**: línea `--success` 2px con área suave `--success` al 8 % de opacidad; eje Y 0-100 %; línea de referencia discontinua en 80 % (objetivo) con etiqueta. Tooltip: "69 % (214 de 311)".
3. **Distribución por lista/etiqueta/tarea**: barras horizontales. Cada fila 28px: nombre (truncado con ellipsis a 140px), barra con color de la paleta categórica (o el color propio de la lista/etiqueta si existe en la app), valor y % a la derecha (`--ink-2`). Máximo 8 filas + "Otros" agregado. Orden descendente. Las barras crecen con transición `--dur-base`.
4. **Distribución por prioridad**: mismas barras horizontales pero con `--prio-high/medium/low/none`.
5. **Puntualidad (a tiempo vs tarde)**: barra única apilada al 100 % (verde `--success` / rojo `--danger`), con % grande a cada lado; debajo, "Retraso medio 1,8 días · mediana 0 días". Evitar donut: con dos valores la barra apilada lee mejor y rinde igual en estrecho.
6. **Vencidas arrastradas**: área apilada por antigüedad: `<7 días` `--warning` al 50 %, `7-30` `--warning`, `>30` `--danger`. Eje Y en tareas. Tooltip con el desglose.
7. **Foco: tendencia de minutos/pomodoros**: barras `--accent` (minutos) con línea de pomodoros `--accent-active` en eje secundario, o toggle Minutos/Pomodoros (segmented mini). Tooltip: "25 min · 1 pomodoro".
8. **Foco: línea temporal del día**: regla horizontal 0-24 h (alto 48px) con bloques `--accent` por sesión (radio 3px, alto 24px centrado); marcas cada 3 h; la sesión con `taskId` muestra el título en el tooltip. Debajo, la regla de "hoy" si el rango incluye el día actual.
9. **Foco: hora más enfocada**: histograma 24 columnas (hora de inicio), `--accent`, columna destacada `--accent-active` para la hora punta con etiqueta "Tu mejor hora: 10-11 h".
10. **Foco: rejilla anual (heatmap)**: columnas = semanas, filas = L-D; celda 10×10px, gap 3px, `border-radius: 2px`. Escala de 5 niveles: nivel 0 `--surface-2`; niveles 1-4 de `--accent` al 25 %, 50 %, 75 % y 100 %. Umbrales por cuartiles del año del propio usuario (no absolutos), documentados en el tooltip. Cabeceras de mes `--fs-xs` `--ink-faint`; tooltip "19 oct · 85 min · 3 pomodoros"; clic → abre el detalle del día (popover con sesiones). Leyenda "Menos → Más" al pie. En móvil, scroll horizontal empezando por el final (hoy visible). **El heatmap actual de Hábitos (9×9px, radio 0, un solo gris) queda sustituido por este mismo componente.**
11. **Hábitos: tarjetas por hábito**: misma tarjeta base; cabecera con icono/color del hábito + nombre; fila de 3 mini-métricas (Racha actual `flame` / Mejor racha / % en rango); debajo, mini-heatmap anual con la escala en el **color del hábito** en vez de `--accent`.
12. **Hábitos: cumplimiento global**: línea diaria de % (0-100) en `--success`, misma estética que el gráfico 2.
13. **Edad de la tarea al completar / precisión pomodoro**: tarjeta de texto con 2-4 números grandes (media y mediana), sin gráfico; no toda métrica merece una serie.

### 10.7. Bocetos (wireframes)

Convención: `⟦ ⟧` tarjeta, `▤` gráfico de barras/línea, `░▒▓█` heatmap. Medidas de referencia: escritorio 1280×800, móvil 390×844.

**Escritorio — Resumen (≥1024px, contenedor 1080px):**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Estadísticas   [Hoy|Semana|Mes|Año|Personalizado]  [Filtros·2] [casa ×]  │
│                                                    [etiqueta ×]   ⬇  ⋯   │
│ Resumen   Tareas   Foco   Hábitos                                        │
│ ────────                                                               │
│ Esta semana: 214 completadas de 311 planificadas (69 %) · 2 h 12 min de  │
│ foco · hábitos al 0 %.                                                   │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                       │
│ │ Completadas  │ │ Tasa compl.  │ │ Tiempo foco  │                       │
│ │ 214  ▲12 %   │ │ 69 %  ▲4 pt  │ │ 2 h 12 min   │                       │
│ │ ╱╲_╱╲        │ │ 214/311      │ │ 5 pomodoros  │                       │
│ └──────────────┘ └──────────────┘ └──────────────┘                       │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                       │
│ │ Hábitos      │ │ Racha días   │ │ Valor logro  │                       │
│ │ 0 %  ▼       │ │ 3 días       │ │ 🏅 Nivel 5   │                       │
│ │ 0/7 días     │ │ mejor: 21    │ │ ▓▓▓▓░░ 68 %  │                       │
│ └──────────────┘ └──────────────┘ └──────────────┘                       │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Tendencia: completadas vs creadas (12 cols, protagonista)          │ │
│ │   ▤  ▤  ▤  ▤  ▤  ▤  ▤    barras --accent + línea creadas · tooltip │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────┐ ┌────────────────────────────────┐   │
│ │ Mejor momento (6 cols)        │ │ Tasa de completitud (6 cols)   │   │
│ │ barras L-D + franja horaria   │ │ línea 0-100 % --success        │   │
│ └───────────────────────────────┘ └────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Escritorio — Tareas:**

```
⟦ Tendencia completadas/creadas (12 cols, alto 260px) ⟧
⟦ Tasa de completitud (6) ⟧        ⟦ Puntualidad (6): barra 100 %      ⟧
⟦ Distribución por lista (4) ⟧ ⟦ por etiqueta (4) ⟧ ⟦ por prioridad (4) ⟧
   barras horizontales, máx 8 + "Otros", colores categóricos / --prio-*
⟦ Vencidas arrastradas: área apilada (6) ⟧ ⟦ Edad al completar (6):    ⟧
                                            media 4,2 d · mediana 1 d
```

**Escritorio — Foco:**

```
⟦ KPI fila: Minutos foco ▲ │ Pomodoros │ % sesiones completadas │ Interrupciones/sesión ⟧
⟦ Tendencia foco (8 cols: barras min + línea pomodoros) ⟧ ⟦ Hora más enfocada (4) ⟧
⟦ Línea temporal del día (12): regla 0-24 h con bloques de sesión ⟧
⟦ Rejilla anual (12):                                               ⟧
   oct        nov        dic  …
   ░░▒▓░▓█░  ░▓░█▒░█░  ▒░░▓░█  ← celdas 10px, radio 2px, escala --accent 25-100 %
   Menos ░▒▓█ Más        clic en día → popover con sesiones
⟦ Distribución del foco: [Lista|Etiqueta|Tarea] (12, barras horizontales) ⟧
```

**Escritorio — Hábitos:**

```
⟦ Cumplimiento global: línea % diaria (12) ⟧
⟦ Tarjeta hábito (4) ⟧ ⟦ Tarjeta hábito (4) ⟧ ⟦ Tarjeta hábito (4) ⟧
   🔥 3 · mejor 21 · 64 % + mini-heatmap anual en el color del hábito
⟦ Ranking más/menos cumplidos + día más flojo por hábito (12, tabla simple) ⟧
```

**Móvil — Resumen (390px):**

```
┌─────────────────────────────┐
│ Estadísticas            ⬇   │
│ [Hoy|Semana|Mes|Año|Pers.]  │
│ [casa ×] [trabajo ×]      → │
│ [Resumen|Tareas|Foco|Háb.]  │
│ Esta semana: 214/311 (69 %) │
│ ┌───────────┐ ┌───────────┐ │
│ │Completadas│ │Tasa 69 %  │ │
│ │ 214 ▲12 % │ │ ▲4 pt     │ │
│ └───────────┘ └───────────┘ │
│ ┌───────────┐ ┌───────────┐ │
│ │Foco 2h12m │ │Hábitos 0 %│ │
│ └───────────┘ └───────────┘ │
│ ┌───────────┐ ┌───────────┐ │
│ │Racha 3 d  │ │🏅 Nivel 5 │ │
│ └───────────┘ └───────────┘ │
│ ⟦ Tendencia ▤▤▤▤ (200px) ⟧  │
│ ⟦ Mejor momento ▤▤ ⟧        │
│ ⟦ Tasa de completitud ╱ ⟧   │
└─────────────────────────────┘
```

**Móvil — Foco (detalle heatmap):** la rejilla anual mantiene tamaño de celda (10px) y lleva scroll horizontal con las semanas recientes visibles al entrar; un sutil degradado en el borde derecho indica que hay más. La regla de 24 h igual: scroll horizontal con la hora actual centrada.

### 10.8. Tipografía y formato de números

- Jerarquía: título de página `--fs-xl` 700; título de tarjeta `--fs-md` 600; KPI `--fs-2xl` 700; etiquetas `--fs-sm`; ejes y tooltips `--fs-xs`/`--fs-sm`.
- Números: `tabular-nums` siempre; separador de miles con punto y decimales con coma (es-ES): "1.214", "4,2 días", "68,5 %".
- Duraciones humanas: "2 h 12 min" (nunca "132 minutos" ni "2,2 h"); segundos solo dentro del timer de Foco, no en estadísticas.
- Fechas: "19 oct", "semana del 19 al 25 de octubre", "martes". Nada de ISO en la UI.
- Plurales correctos desde i18n (`1 tarea`, `2 tareas`, `1 pomodoro`): usar las reglas de plural de ICU, nunca `n + " tareas"`.

### 10.9. Estados

- **Carga**: skeleton con la silueta real de cada bloque (tarjeta KPI con línea corta + número fantasma; gráfico con eje y área fantasma), `background: var(--surface-2)` con pulso suave. Nunca mostrar "No hay datos" mientras carga (hoy Reportes enseña "Todavía no hay un reporte de esta semana" durante el fetch — defecto §2.2.4).
- **Vacío (sin datos en el rango)**: mensaje honesto y accionable por bloque: "Completa tu primera tarea para empezar a ver tendencias", "Aún no hay sesiones de foco en este rango. Empieza una desde Foco." con enlace. Icono lucide suave (`bar-chart-3`, `timer`, `sprout`) en `--ink-faint`.
- **Vacío (filtros demasiado estrechos)**: distinto del anterior: "Ningún dato coincide con estos filtros" + botón "Quitar filtros".
- **Error por bloque**: la tarjeta/gráfico afectado muestra "No se pudo cargar" + botón Reintentar (reintenta solo esa query de TanStack Query); el resto de la pantalla sigue funcionando.
- **Exportación**: estado de generación en el propio botón (spinner + "Generando…").

### 10.10. Interacciones

- **Rango**: cambiar el segmented recarga todas las queries del rango; "Personalizado" abre el date-picker y aplica al cerrar. Semana actual por defecto. Flechas ‹ › junto al selector para moverse al período anterior/siguiente (gesto natural de "pasear" por el histórico).
- **Filtros**: se aplican a todas las pestañas (salvo Hábitos, que los ignora y lo indica: "Los filtros no aplican a hábitos"); persisten en URL + `localStorage`.
- **KPI → detalle**: clic en una KPI abre su pestaña con el mismo rango/filtros.
- **Hover** (escritorio): tooltip en gráficos; highlight de la barra/punto (opacidad del resto al 40 %).
- **Táctil**: targets ≥ 44px (`--tap`); tooltip por tap; scroll horizontal solo en heatmap y regla 24 h, con `scroll-snap` por semana.
- **Clic en heatmap / timeline**: popover con el detalle del día (sesiones de foco con hora y duración, tareas completadas ese día).
- **Deep-link**: todo el estado (pestaña, rango, filtros, día seleccionado) vive en la URL; el botón atrás del navegador deshace cambios de pestaña/rango.
- **Teclado**: tabs con flechas, segmented con flechas, tarjetas KPI enfocables, `Esc` cierra popovers.

### 10.11. Accesibilidad

- Cada gráfico lleva **tabla de datos alternativa** en un `<details>` "Ver como tabla" (también sirve para copiar datos).
- `role="img"` + `aria-label` con el resumen del gráfico ("Completadas por día: máximo 58 el martes, mínimo 12 el domingo"); el tooltip no es la única vía al dato.
- Contraste AA: texto `--ink`/`--ink-2` sobre `--surface` cumple; verificar la paleta categórica a 4,5:1 para etiquetas de texto sobre tarjeta y a 3:1 para elementos gráficos adyacentes al fondo; el nivel 0 del heatmap necesita borde sutil en tema claro para no desaparecer sobre `--surface`.
- No codificar información solo con color: la variación de KPI lleva flecha + texto; las series se distinguen también por forma (barra vs línea) y la puntualidad por etiqueta directa.
- `prefers-reduced-motion`: sin animaciones de entrada ni transiciones de barras.
- Navegación completa por teclado (§10.10) y focus visible con `--focus-ring`.

### 10.12. Rendimiento percibido

- Agregación en servidor (§7.2): el cliente recibe buckets, no filas; objetivo < 500 ms por endpoint con el volumen real de Pablo.
- TanStack Query: `staleTime` 5 min por (endpoint, rango, filtros); al cambiar de rango, `placeholderData: keepPreviousData` para que la pantalla no parpadee a skeleton — la data anterior queda atenuada hasta que llega la nueva.
- Las 4 pestañas precargan en segundo plano al entrar en Resumen (prefetch de `/stats/tasks|focus|habits` del rango activo).
- El heatmap anual se calcula de una vez (365 celdas SVG o divs); sin virtualización necesaria.
- Presupuesto: la pantalla no debe añadir más de ~60 KB al bundle (Recharts tree-shaken ≈ 45-55 KB gzip); carga perezosa del módulo de gráficos (`React.lazy`) para no penalizar el resto de la app.

### 10.13. Componentes a reutilizar y librería de gráficos

Reutilizar de la app: tarjetas base, chips, botones y segmented control del sistema de diseño; iconos **lucide-react** (ya instalada: `trending-up`, `flame`, `award`, `timer`, `calendar-days`, `download`, `sliders-horizontal`, `bar-chart-3`, `sprout`); el heatmap nuevo sustituye y unifica el de Hábitos (componente `<YearHeatmap color scale>` compartido); popover/tooltip del detail panel si ya existe uno accesible.

**Librería de gráficos — decisión D7.** Verificado en `apps/web/package.json` (main, 20-10-2026): no hay ninguna librería de gráficos. Propuesta por defecto: **Recharts 3.x** (compatible con React 19; SVG; cubre barras, líneas, áreas y tooltips con poco código; tree-shakeable). El **heatmap anual y la regla de 24 h se hacen con SVG propio** (son rejillas simples; meterlos en Recharts sale más caro que hacerlos a mano) y quedan como componentes propios reutilizables. Alternativas descartadas: visx (más control, mucho más trabajo), Chart.js (canvas, peor para tooltips accesibles y temas por CSS).

Los colores de los gráficos se leen de los tokens con `getComputedStyle` o, mejor, se pasan por un módulo `chart-theme.ts` que mapea tokens → constantes y se suscribe a cambios de `data-theme`/`data-accent` (`MutationObserver` sobre `<html>`), repintando al cambiar de tema.

### 10.14. Tema oscuro, densidad y acento

- **Oscuro**: verificado que existe `[data-theme="dark"]` con tokens propios (`--bg #242424`, `--surface #222222`, bordes y tintes invertidos). Nada de colores hardcodeados: todo gráfico toma color del módulo `chart-theme`. Gridlines y nivel 0 del heatmap usan los tokens `--border`/`--surface-2` del tema activo.
- **Densidad** (`data-density="comfortable"`): Estadísticas respeta la densidad para alto de filas de barras horizontales y padding de tarjetas (compact: `--sp-3`).
- **Acento** (`data-accent="indigo"`): si el usuario cambia el acento en Ajustes, la serie principal, el heatmap y las barras de progreso cambian con él (es el punto de personalización; las series semánticas `--success`/`--danger`/`--warning` no cambian).

### 10.15. Chequeo visual de aceptación

Antes de dar F4 por cerrada, revisión visual obligatoria (como esta auditoría): capturas inspeccionadas de las 4 pestañas en 1280px y 390px, en tema claro y oscuro, con datos y con rango vacío. Criterio: ningún texto crudo (UUID, ISO, inglés), ningún número sin unidad, ninguna tarjeta vacía sin estado, ningún gráfico con colores fuera de la paleta.

## 11. Fases y criterios de aceptación

**F0 – Saneamiento del reporte actual** (rápido, independiente)

- Corregidos los 15 defectos de §2.2 (o movidos a la auditoría general los que no son de Estadísticas); narrativa y tarjetas usan la misma fuente de cálculo para foco y hábitos (`metrics.service` compartido).

**F1 – Resumen + Tareas (igualar a TickTick)**

- `/statistics` con cabecera (rango + filtros), pestaña Resumen con las 6 KPI y tendencia completadas/creadas, pestaña Tareas completa, con la maquetación de §10 (rejilla 12 cols / 2 cols, tarjetas sólidas, paleta de tokens).
- Criterios: los números de la tasa de completitud coinciden con un conteo manual en una semana de prueba; los filtros cambian todos los gráficos; semanas empiezan en lunes; tiempos < 1 s con el volumen real de Pablo; capturas en 1280/390 verificadas (§10.15).

**F2 – Foco**

- Pestaña Foco completa (tendencia, timeline diario, heatmap anual, distribución, calidad).
- Criterios: el heatmap anual muestra intensidad correcta verificada contra `focus_sessions` de 3 días concretos; la distribución por lista suma el 100 % del tiempo del rango; el heatmap es el mismo componente que usará Hábitos.

**F3 – Hábitos + Valor de logro**

- Pestaña Hábitos y módulo de valor de logro con niveles, fórmula pública y reglas anti-fraude, unificado con la puntuación del Jardín.
- Criterios: racha y % de un hábito coinciden con `GET /habits/:id/stats`; la fórmula publicada reproduce exactamente la puntuación mostrada en un caso de prueba documentado; el widget "Logros" del Jardín enlaza a `/statistics` y ya no se contradice.

**F4 – Exportación y pulido**

- CSV/JSON, tablas accesibles, entrada desde menú de cuenta (si ya existe), chequeo visual §10.15 completo (claro/oscuro, con y sin datos).
- Criterios: el CSV exportado abre en hoja de cálculo con columnas correctas y totales que cuadran con la pantalla.

## 12. Decisiones abiertas (propuesta por defecto incluida)

| #   | Decisión                                                             | Propuesta por defecto                                                                    |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| D1  | ¿"Reportes" se renombra/fusiona con "Estadísticas"?                  | No: dos entradas (narrativa vs cuadro de mando)                                          |
| D2  | Denominador de la tasa de completitud cuando la tarea no tiene fecha | Contar solo tareas con fecha (definición TickTick); sin fecha se excluyen                |
| D3  | Scope OAuth                                                          | `stats:read` nuevo                                                                       |
| D4  | Precálculo en tabla `stats_daily`                                    | No al principio; añadir solo si >500 ms                                                  |
| D5  | Gamificación desactivable                                            | Sí, visible por defecto, ocultable en Ajustes                                            |
| D6  | Métrica de precisión de estimaciones pomodoro                        | Fase posterior (F4+), no bloquea                                                         |
| D7  | Librería de gráficos                                                 | Recharts 3.x + SVG propio para heatmap y regla 24 h                                      |
| D8  | Entrada mientras no exista el menú de cuenta                         | Ítem "Estadísticas" en el sidebar, se mueve después                                      |
| D9  | Paleta categórica para distribuciones                                | 8 tonos derivados de tokens (`--chart-1…8`, §10.1); por prioridad se usan los `--prio-*` |
| D10 | ¿El valor de logro absorbe la puntuación "Logros" del Jardín?        | Sí: una sola puntuación; el widget enlaza a `/statistics`                                |

## 13. Referencias

- TickTick, Achievements & Statistics: https://help.ticktick.com/articles/7082302534169133056
- TickTick, Focus Statistics: https://help.ticktick.com/articles/7055781966800486400
- TickTick Statistics (referencia de acceso, avatar → Statistics): https://ticktick.com/webapp/#statistics/overview
- Estado actual verificado en: https://todo.reflexionia.com/reports/weekly, /dashboard, /focus, /habits (2026-10-20, commit `8b1ad1f`, capturas en 1280px y 390px)
- Tokens medidos en vivo: `--accent #4772fa`, `--sidebar-bg #f2f5fe`, escala `--sp-*`, radios, breakpoints 1024/800/720/640, `data-theme`/`data-density`/`data-accent` (§10.1)
- Repo: github.com/povedica/tick-tack-done (`apps/api/src/modules/reports`, `focus`, `habits`; `apps/api/prisma/schema.prisma`; `apps/web/package.json` sin librería de gráficos, lucide-react 1.59)

## Seguimiento de implementación — revisión de 20 de octubre de 2026

La PR #54 corrige RF-2321–2324 y los hallazgos F-01–F-11 sin reabrir D1–D10. Por instrucción del usuario, la entrada temporal D8 se sitúa en el rail principal inmediatamente antes de Buscar y se retira del sidebar secundario. El [informe de cierre](../../reviews/cierre-estadisticas-v2-2026-10-20.md) registra pruebas, límites de verificación y deuda explícita de granularidad de errores por endpoint. Las propuestas de esta spec se conservan como fuente de verdad; este seguimiento no altera sus criterios.
