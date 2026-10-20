# Especificación: Matriz Eisenhower por lista (y en Hoy)

19 oct 2026 · tick-tack-done · commit base `26a02b2`
Documento listo para Cursor. Describe la funcionalidad completa: qué se pide, qué existe hoy, qué hay que construir, criterios de aceptación y plan de PRs.

---

## 1. Qué pide Pablo

Poder ver la matriz Eisenhower (urgente/importante) filtrada por contexto, no solo global:

- Una vista Matriz **dentro de cada lista** (y dentro de Hoy), con un selector de ámbito.
- La matriz global actual se mantiene como un ámbito más ("Todas").
- Coherencia con TickTick, donde la matriz es un módulo de primer nivel accesible desde la barra de iconos.

## 2. Qué existe hoy (estado real del código)

- Ruta `/matrix` → `MatrixPage` en `apps/web/src/features/places/Places.tsx` (~L1046).
- Clasificación en `quadrantOf()` (`apps/web/src/features/tasks/model.ts` L170-188):
  - **Urgente:** `due_date` dentro de las próximas 24 h o ya vencida.
  - **Importante:** prioridad `high` o `medium`.
  - do = urgente+importante · schedule = importante no urgente · delegate = urgente no importante · drop = ni una cosa ni otra.
- Carga de datos: `api.listTasks({ status: 'active', limit: 100, flat: true })` → TODAS las tareas activas, sin paginar ni filtrar por lista. Con 95+ activas ya roza el límite de 100: hoy se pierden tareas silenciosamente y mañana no escala.
- Drag & drop entre cuadrantes aplica `DEFAULT_QUADRANT_EFFECTS`: parchea `priority` y/o `due_date` para mover la tarea al cuadrante soltado.
- Sin concepto de lista/ámbito: la matriz es siempre global.

## 3. Definición de la funcionalidad

### 3.1 Selector de ámbito

Arriba de la matriz, un selector con:

- **Todas** (comportamiento actual, por defecto en `/matrix`).
- **Hoy** (tareas con fecha hoy, vencidas incluidas).
- **Cada lista del usuario** (listas personales y proyectos).
- (Fase 2) filtros guardados y etiquetas.

El ámbito se refleja en la URL para poder compartir/guardar: `/matrix?scope=all` (por defecto), `/matrix?scope=today`, `/matrix?scope=list/<listId>`.

### 3.2 Matriz dentro de la página de lista

En la página de cada lista (`/list/:id`, `/lists/:id`) y en Hoy (`/today`), añadir un conmutador de vista **Lista | Matriz** (segmented control arriba a la derecha, persistente por lista en localStorage).

- Vista Matriz = misma matriz con el ámbito fijado a esa lista, sin selector de ámbito (el contexto ya es la lista).
- En móvil, el conmutador va en el header de la lista.

### 3.3 Reglas de clasificación

Se mantiene `quadrantOf()` sin cambios semánticos en la fase 1 (urgente = vence ≤24 h o vencida; importante = prioridad alta/media). Documentar en la UI con una "i" discreta qué significa cada cuadrante. El drag & drop sigue aplicando `DEFAULT_QUADRANT_EFFECTS`.

Decisión abierta para fase 2 (NO hacer ahora): umbrales configurables (p.ej. urgente = próximos 3 días) y/o eje de "esfuerzo".

### 3.4 Datos: filtrado en servidor

Eliminar el `limit: 100` global:

- Ampliar `api.listTasks` con el parámetro `list_id` (el backend ya filtra por lista en otras vistas) y con `due_before`/`due_after` si hiciera falta.
- `MatrixPage` pasa a pedir: `listTasks({ status:'active', list_id: scope.listId })` para listas, y para `all` usar paginación real (`limit`/`cursor` en bucle o un endpoint agregado `matrixCounts`).
- Query keys de react-query por ámbito: `['matrix-tasks', scope]` para cachear por separado.

### 3.5 Layout y móvil

- Escritorio: grid 2x2 con las 4 columnas actuales.
- Móvil: en vez de 4 listas apiladas de bullets (estado actual, ilegible), tabs por cuadrante ("Hacer 12 · Programar 8 · Delegar 3 · Eliminar 5") con la lista del cuadrante activo debajo; drag & drop se sustituye en móvil por "Mover a cuadrante" en el menú de la tarea.
- Cada tarjeta de tarea muestra: título, lista (solo en ámbito Todas), fecha y prioridad con los mismos estilos de fila de `TodayPage`.

### 3.6 Entradas y toggle

- La Matriz sigue en la franja azul (IconRail) y entra en la nueva sección Ajustes → Funciones (ver documento de auditoría): si el módulo Matriz está desactivado, se ocultan el icono del rail, el conmutador Lista|Matriz y la ruta redirige a /today.
- En la hoja "Más" de la bottom bar móvil, añadir Matriz (falta hoy, ver auditoría punto 7).

## 4. Criterios de aceptación

1. En `/matrix` puedo cambiar el ámbito entre Todas / Hoy / cada lista, y la URL lo refleja.
2. En una lista y en Hoy puedo alternar Lista | Matriz y la elección se recuerda.
3. Con 200+ tareas activas, la matriz global muestra TODAS (sin límite 100) y carga en < 1 s en ámbito lista.
4. Arrastrar una tarea a otro cuadrante actualiza prioridad/fecha igual que hoy, y al volver a la vista lista el cambio se ve.
5. En móvil (390px) navego por cuadrantes con tabs y puedo mover una tarea de cuadrante desde su menú.
6. Con el módulo Matriz desactivado en Ajustes → Funciones, no queda ninguna entrada visible a la matriz.
7. Ninguna tarea de tipo nota (`kind !== 'task'`) aparece en la matriz (comportamiento actual que se conserva).

## 5. Plan de PRs (pequeños, en orden)

1. **PR-1 datos:** parámetro `list_id` en `listTasks` + quitar `limit:100` fijo en `MatrixPage` (paginación o endpoint agregado). Sin cambios visuales.
2. **PR-2 selector de ámbito:** selector + query param `scope` en `/matrix` + query keys por ámbito.
3. **PR-3 conmutador en lista/Hoy:** vista Lista|Matriz embebida con persistencia local.
4. **PR-4 móvil:** tabs por cuadrante + acción "Mover a cuadrante" en el menú de tarea + entrada Matriz en la bottom bar.
5. **PR-5 toggle:** módulo Matriz en Ajustes → Funciones (junto con Cuenta atrás y Foco).
6. **PR-6 (fase 2, opcional):** ámbito por filtro/etiqueta y umbrales configurables de urgencia.

## 6. Riesgos y notas

- El umbral de 24 h de "urgente" hará que muchas tareas con fecha de mañana salten de cuadrante solas; el tooltip "i" del punto 3.3 evita confusión.
- En ámbito Todas, la tarjeta debe mostrar la lista de origen o se pierde contexto.
- `flat: true` ya excluye subtareas anidadas de primer nivel; confirmar que las subtareas NO aparecen como tarjetas sueltas en la matriz (hoy no aparecen; mantener).
