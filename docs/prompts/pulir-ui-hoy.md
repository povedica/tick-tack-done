# Pulir Hoy y la barra para acercarlas a la spec de UI

Copia el bloque de abajo en un chat nuevo. Ábrelo en `~/CodeProjects/todo`, ya en `main`, después de mergear la PR #5. No reutilices `~/CodeProjects/todo-ui-shell`: ese worktree se elimina al cerrar el corte.

```
Continúa la UI de tick-tack-done desde main, en una rama nueva
feat/ui-today-polish. No toques el roadmap del punto 7 (PAT ni MCP),
no despliegues y no abras Kanban, calendario, notas ni Focus.

Lee docs/handoff.md y docs/spec/tick-tack-done-ui-spec-v1.0.md
(secciones 4, 5, 7 y 9.2). La PR #5 ya está en main: shell de tres
paneles, tokens, tema claro/oscuro/auto, rutas del mapa y Hoy conectado
al SDK (UI-401, UI-402, UI-404). El plan de hoy sigue vacío a propósito
hasta que exista GET /api/v1/review/daily. No lo inventes.

El corte que falta es visual. Hoy y la barra no se parecen a TickTick:
el título es grande, las filas no llevan metadatos, la fecha de hoy parece
un enlace y la barra no tiene contadores, listas ni filtros. Acércalo a
la spec sin cambiar la paleta (UI-D2: fondo cálido, tinta piedra, acento
índigo; no copies el azul de TickTick).

En este corte:
- Barra más densa (sección 4.5): smart lists con contador real, listas con
  punto de color y contador, filtros fijados si existen. El pie no puede
  ser tres botones a ancho completo.
- Hoy (sección 7): cabecera contenida, fila «Añadir tarea», grupos compactos
  con el contador junto al nombre, checkbox circular del color de la
  prioridad, título, nombre de lista y fecha a la derecha (roja solo si está
  vencida).
- No implementes el resto de la spec. El detalle de ?task= sigue en aviso.
  Agrupar por etiqueta puede seguir mostrando el id: el SDK no lista etiquetas.
- apps/api/tsconfig.json es NodeNext. No lo reviertas a CommonJS.
- No edites packages/sdk, apps/api ni packages/domain salvo que el corte
  no pueda leer un dato que la API ya expone.

Verifica en el navegador, no solo con tests. No uses pnpm dev si choca
con otro stack: API del worktree en un puerto libre y
pnpm --filter web exec vite --port <libre> --strictPort --host 127.0.0.1

Al terminar: lint, typecheck y test de web en verde, Conventional Commit
en inglés (feat(web): …), PR pequeña contra main citando las secciones 4.5,
7 y 9.2. Actualiza docs/handoff.md.
```
