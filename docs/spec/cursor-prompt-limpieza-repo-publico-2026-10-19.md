# Prompt para Cursor: limpiar el repo público sin tocar funcionalidad

Repo: `tick-tack-done` (https://github.com/povedica/tick-tack-done), público.
Fecha: 2026-10-19. Una sola rama `chore/limpieza-repo-publico`, una sola PR contra `main`.

## Objetivo

Quitar del repo público todo lo que dice en voz alta que el look y la funcionalidad se copiaron/midieron de TickTick, y dejar el proyecto presentado como lo que es: un gestor de tareas propio con su propio sistema de diseño, con una capa de compatibilidad con la Open API pública de TickTick (eso sí es legal y se queda). **No cambies comportamiento, ni el look, ni la API, ni un solo token de color** (salvo el paso 9, opcional y marcado como tal).

## Reglas de oro

1. Solo se tocan documentación, nombres de ficheros de documentación, metadatos (`package.json`, `.cursor/rules/`) y comentarios. Nada de código ejecutable.
2. No renombres campos de API, endpoints, variables de entorno ni identificadores TypeScript. La capa de compatibilidad `/open/v1` con los nombres de campo de la Open API de TickTick (`projectId`, `repeatFlag`, `sortOrder`, prioridades 0/1/3/5) es interoperabilidad legítima y se queda tal cual.
3. No borres requisitos: donde la spec diga "replicar el comportamiento de TickTick", reformula como requisito funcional propio ("la app hace X") sin citar la fuente.
4. Español en docs, inglés en código, como hasta ahora.

## Paso 1 — LICENSE (pendiente de Pablo, no inventes)

No hay fichero `LICENSE`. Pablo decide entre MIT (recomendada: máxima reutilización, proyecto personal), Apache-2.0 (igual pero con licencia de patentes explícita) y AGPLv3 (si quiere que los derivados sigan abiertos). Cuando confirme, añade `LICENSE` en raíz con el texto oficial:

- MIT: https://opensource.org/license/mit (año 2026, copyright "Pablo Poveda")
- Apache-2.0: https://www.apache.org/licenses/LICENSE-2.0.txt
- AGPLv3: https://www.gnu.org/licenses/agpl-3.0.txt

Y una línea en `README.md`: `Licencia: <la elegida> (ver LICENSE).`

## Paso 2 — Renombrar ficheros de spec (git mv)

```
git mv docs/spec/ticktick-clone-spec-v1.1.md docs/spec/especificacion-producto-v1.1.md
git mv docs/spec/cursor-prompt-ui-look-ticktick-v1.2.md docs/spec/cursor-prompt-ui-look-v1.2.md
git mv docs/spec/cursor-prompt-bugs-migracion-ticktick-2026-10-18.md docs/spec/cursor-prompt-bugs-importacion-2026-10-18.md
```

Actualiza las referencias al primer nombre en: `.prettierignore` (línea 7), `README.md` (línea 7), `AGENTS.md` (líneas 3-5), `.cursor/rules/00-project.mdc` (líneas 7-8), `docs/prompts/implementar-rf.md` (línea 4), `docs/prompts/terminar-spec.md` (líneas 7 y 9), `docs/prompts/cerrar-fase-1.md` (líneas 7 y 9), `docs/spec/bugs-prueba-canales-2026-10-18.md` (líneas 6 y 35), `docs/handoff.md` (línea 11) y `scripts/init-harness.sh` (ver paso 8).

## Paso 3 — Quitar "clon de TickTick" de la presentación

Sustituciones exactas:

- `README.md` línea 3: `Gestor de tareas personal extensible (clon de TickTick) en todo.reflexionia.com.` → `Gestor de tareas personal extensible en todo.reflexionia.com: listas, etiquetas, filtros inteligentes, prioridades, subtareas, recurrencias, recordatorios, calendario, vistas Kanban/Timeline, hábitos, Pomodoro, offline-first, servidor MCP y API REST con tokens por scopes.`
- `README.md`: añade al final de la intro la línea: `Proyecto personal, sin afiliación con TickTick ni Appest. La capa /open/v1 solo ofrece compatibilidad con su Open API pública.`
- `package.json` línea 5, `description`: quita ` (clon de TickTick)`.
- `AGENTS.md` línea 3: `gestor de tareas personal extensible (clon de TickTick) desplegado en` → `gestor de tareas personal extensible desplegado en`.
- `.cursor/rules/00-project.mdc` línea 7: `Clon extensible de TickTick.` → `Gestor de tareas personal extensible.`; línea 17: `importador TickTick aplazado` → `importador desde la Open API de TickTick aplazado (RF-1701)`.
- `.cursor/rules/20-typescript.mdc` línea 11: `Los mapeos con TickTick (priority 0/1/3/5) solo en la capa de compatibilidad` → `Los mapeos de prioridad numérica (0/1/3/5) solo en la capa de compatibilidad`.

## Paso 4 — Spec de UI: los valores son decisiones propias

En `docs/spec/tick-tack-done-ui-spec-v1.0.md` (29 menciones) y `docs/spec/cursor-prompt-ui-look-v1.2.md` (17 menciones) aplica estas sustituciones de patrón, conservando todos los valores hex/px tal cual:

- `Look tipo TickTick medido sobre la app real (tema blue-gradient-theme, 2026-10-18)` → `Sistema visual del proyecto (definido 2026-10-18)`.
- `Paleta oscura medida (night-dark-theme)` → `Paleta oscura del proyecto`.
- `Todos los valores de abajo son REALES, medidos en la app web de TickTick (tema blue-gradient-theme) el 2026-10-18: computed styles del DOM y su CSS compilado. No son aproximaciones.` → `Valores del sistema de diseño del proyecto. Son los valores de producción: no los cambies sin actualizar tokens.css.`
- `Tema claro, valores medidos de TickTick:` → `Tema claro:`
- `[verificado]`, `[verificado en TickTick: …]`, `(verificado en su app web, …)`, `verificado en la app web de TickTick` → eliminar la marca y su contenido, dejando el requisito como afirmación propia.
- `Anatomía (de TickTick [verificado] y ampliada)` → `Anatomía:`
- Sección 25: `## 25. Anexo A — Notas de paridad con TickTick (verificado en la app web de TickTick, 17 oct 2025)` → `## 25. Anexo A — Notas de diseño`.
- Dentro de esa sección y en el resto, `TickTick` como comparador (`como TickTick`, `como el Today de TickTick`, `estilo TickTick`, `paridad TickTick`) → reescribir como requisito propio: `como el Today de TickTick` → `agrupación por prioridad por defecto`, etc. Donde la mención aporte cero información, bórrala.
- `estilo editorial serif propio en vez del sans/plano de TickTick` (línea ~959) → `sans del sistema en toda la UI (UI-D3)`.

## Paso 5 — Spec de producto: requisitos propios

En `docs/spec/especificacion-producto-v1.1.md` (71 menciones):

- Título (línea 1): `# Especificación de producto: gestor de tareas propio (clon extensible de TickTick)` → `# Especificación de producto: gestor de tareas personal extensible`.
- Introducción: `replica la funcionalidad de TickTick` → enumera la función como propia: `cubre tareas, listas, etiquetas, filtros inteligentes, prioridades, subtareas, recurrencias, recordatorios, calendario, vistas Kanban/Timeline, Pomodoro y hábitos`. El apartado que empieza `El usuario usa TickTick a diario y le encaja su modelo mental… pero TickTick:` puede quedarse como motivación personal, o mejor: reformular como `El modelo mental objetivo es el de un gestor de tareas con listas, etiquetas, filtros, Pomodoro, hábitos y calendario, con estas carencias habituales:`.
- Sección 8 `Paridad y mejoras respecto a TickTick` → `Alcance funcional y extensiones propias`. La tabla comparativa `| Función | TickTick | Este producto |` → `| Función | Gestores de referencia | Este producto |`.
- Frases `TickTick lo hace`, `como TickTick`, `igual que TickTick`, `estilo TickTick` en las tablas de modelo de datos y RF-xx → borrar la referencia dejando el requisito (`TickTick permite notas dentro de listas` → `se permiten notas dentro de listas`).
- **Se conservan tal cual** (uso nominativo de interoperabilidad, legal): la sección 10.4 `Compatibilidad TickTick`, RF-503 (mapeo de prioridades), RF-1701 (importador aplazado), la sección 22 `Apéndice A: referencia de la Open API de TickTick` y las URLs públicas developer.ticktick.com / ticktick.com/features. Donde diga `Capa de compatibilidad GET /open/v1/... que replica la forma de la Open API de TickTick` → `…compatible con la forma de la Open API pública de TickTick`.

## Paso 6 — Doc de migración

En `docs/spec/cursor-prompt-bugs-importacion-2026-10-18.md` (ya renombrado):

- `El 18/10/2026 se copió TickTick (solo lectura) a este API.` → `El 18/10/2026 se importaron los datos propios del usuario desde su gestor anterior (solo lectura) a este API.`
- `En TickTick no es así. Una tarea puede tener parentId de otra lista.` → `En el formato de origen una tarea puede tener parentId de otra lista.`
- `No toques el repo ticktick.` → `No toques el importador externo.`
- Resto de menciones (`lo que manda TickTick`, `hábitos… de TickTick`) → `el formato de origen`.

## Paso 7 — Handoff, roadmap y prompts

- `docs/handoff.md` línea 3: `El look medido de TickTick está en main (PR #13)` → `El sistema visual definido en la spec de UI está en main (PR #13)`. Línea 11: `Look de TickTick en la PR #13… UI-D2 es la paleta medida` → `Sistema visual en la PR #13… UI-D2 es la paleta`. Línea 115: `Hay que acercarla a una interfaz similar a TickTick` → `Hay que llevarla al sistema visual de la spec de UI (sección 7)`. Línea 143 `## Look TickTick (18 oct 2026)` → `## Sistema visual (18 oct 2026)`; línea 145 `Los valores medidos están en…` → `Los valores están en…`.
- `docs/roadmap.md` línea 7: `El look medido de TickTick entró en la PR #13` → `El sistema visual entró en la PR #13`.
- `docs/prompts/pulir-ui-hoy.md` línea 16: `Hoy y la barra no se parecen a TickTick:` → `Hoy y la barra no siguen la spec de UI:`; línea 20: `no copies el azul de TickTick` → se queda (es una instrucción de no copiar).
- `docs/prompts/terminar-spec.md` línea 15 `Look TickTick en main (PR #13)` → `Sistema visual en main (PR #13)`; línea 33 `importador TickTick` → `importador externo (RF-1701)`; `No ejecutar el prompt de UI TickTick` → `No ejecutar el prompt de look de UI`.
- `docs/prompts/cerrar-fase-1.md` línea 41: `RF-1701 (importador TickTick) sigue aplazado. No pulir el look. No ejecutar el prompt de UI TickTick.` → misma reforma.
- `docs/spec/bugs-prueba-canales-2026-10-18.md`: solo actualiza la ruta renombrada.

## Paso 8 — scripts/init-harness.sh

Es una instantánea empaquetada del repo entero (unas 80 menciones, incluida la spec vieja completa) pensada para restaurar el proyecto desde cero; el repo en GitHub ya cumple esa función. Recomendación: `git rm scripts/init-harness.sh`. Si Pablo prefiere conservarlo, hay que aplicarle los mismos renombres y sustituciones de los pasos 2-7 (si no, cualquier restauración reintroduce todo el texto problemático).

## Paso 9 — OPCIONAL: un punto de identidad visual propia

Solo si Pablo lo pide explícitamente. El acento/rail `#4772fa` es el valor más reconocible del tema de referencia. Cambiarlo por un tono propio (p. ej. un índigo `#4f5dd5` o un teal `#0f8a8a`) se hace en un solo sitio — `apps/web/src/styles/tokens.css` (`--rail-bg`, `--accent`, `--accent-hover`, `--accent-active`, `--accent-soft`, `--accent-ink`, `--info`, `--info-soft`, `--focus-ring`, `--prio-low`) — y actualizando los mismos hex en la spec de UI (UI-D2/UI-D5). Verifica contraste AA de `--accent-ink` sobre fondos claros. Nada más cambia; el comportamiento es idéntico. Si Pablo no lo pide, no toques ningún token.

## Lo que NO se toca

- Código: `packages/domain/src/open/ticktick.ts`, `priority/priority.ts`, `transfer/csv.ts`, `apps/api/src/open/open.controller.ts`, `apps/api/src/modules/transfer/transfer.controller.ts`, `apps/api/openapi.json`, `packages/sdk/src/generated/schema.d.ts`, tests. Las menciones a TickTick ahí describen compatibilidad con su API pública: correctas y legales.
- Nombres de producto: `tick-tack-done` (nombre, PWA manifest, favicons propios, iconos lucide) ya son independientes. Sin cambios.
- Historial git: qué hacer con el historial (niveles A/B/C) está cubierto en la spec de seguridad `spec-seguridad-tick-tack-done-2026-10-19-v2.md`, sección 5. No lo dupliques aquí; si Pablo elige B o C, se hace después de mergear esta PR.

## Verificación (obligatoria antes de abrir la PR)

```bash
# 1. Sin restos fuera de la lista blanca:
grep -rIn -i 'ticktick' docs/ README.md AGENTS.md package.json .cursor/ scripts/ .prettierignore
# Esperado: SOLO menciones en docs/spec/especificacion-producto-v1.1.md secciones 10.4 y 22,
# RF-503 y RF-1701, y las URLs públicas de la Open API. Todo lo demás, cero.

# 2. Frases de procedencia eliminadas:
grep -rIn -iE 'medid[oa].*(ticktick|dom)|css compilado|oscuro real|clon' docs/ README.md AGENTS.md package.json .cursor/ scripts/
# Esperado: sin resultados.

# 3. Sin referencias al nombre antiguo:
grep -rIn 'ticktick-clone-spec' . --exclude-dir=node_modules --exclude-dir=.git
# Esperado: sin resultados.

# 4. Todo sigue funcionando:
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

5. UI intacta: `git diff main...HEAD --stat -- apps/ packages/ ':!*.md'` debe mostrar cero cambios (o solo `tokens.css` si se hizo el paso 9). Levanta la web y comprueba a ojo Hoy, una lista y Ajustes: idénticas a antes.

## Checklist

- [ ] Paso 1: LICENSE (tras decisión de Pablo) + línea en README
- [ ] Paso 2: 3 renombres con `git mv` + referencias actualizadas
- [ ] Paso 3: README, package.json, AGENTS.md, rules 00 y 20
- [ ] Paso 4: spec de UI + prompt de look reformulados (valores intactos)
- [ ] Paso 5: spec de producto reformulada (conservar 10.4, 22, RF-503, RF-1701)
- [ ] Paso 6: doc de migración reformulado
- [ ] Paso 7: handoff, roadmap y prompts
- [ ] Paso 8: init-harness.sh eliminado (o reformulado igual)
- [ ] Paso 9: OPCIONAL, solo si Pablo lo pide
- [ ] Verificación 1-5 en verde
- [ ] PR única `chore/limpieza-repo-publico` contra `main`
