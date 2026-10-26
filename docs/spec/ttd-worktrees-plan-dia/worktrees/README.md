# tick-tack-done · Paquetes de trabajo en paralelo (worktrees) tras la revisión r80/r105

- **Fecha:** 23/10/2026 (hora de Madrid)
- **Base:** `main` = producción = `318fbd9`
- **Origen:**
  - `ttd-codex-r105.md` (TTD-AUD-105..111 y 125);
  - `r80-test-report.md` (bugs de API 112..124 y la sección 6 «Resultados de la prueba UI»: 126..135).
- **Objetivo:** 5 documentos autónomos que Codex puede trabajar **a la vez**, cada uno en su worktree, sin que ninguno necesite el merge de otro.

## 1. Paquetes

| Paquete | Documento / prompt | Rama | Puntos | N.º | Prioridad | Tamaño | Capa |
|---|---|---|---|---|---|---|---|
| **A · Calendario UI** | `ttd-wt-a-calendario.md` / `-prompt.txt` | `codex/wt-a-calendario` | 105, 106, 107, 130, 131, 132, 133 | 7 | P1 | L | web |
| **B · Listas y Kanban** | `ttd-wt-b-kanban.md` / `-prompt.txt` | `codex/wt-b-kanban` | 108, 109, 110, 128 | 4 | P1 | M | web |
| **C · Telegram y notificaciones** | `ttd-wt-c-telegram.md` / `-prompt.txt` | `codex/wt-c-telegram` | 125 (+114), 135 | 2 (+1 absorbido) | **P1 urgente** | M-L | API + migración + web |
| **D · API/MCP backend** | `ttd-wt-d-api-mcp.md` / `-prompt.txt` | `codex/wt-d-api-mcp` | 111, 112, 113, 115, 116, 117, 118, 119, 122, 123 | 10 | P1 | L | API/MCP |
| **E · Ajustes, Foco e Informes** | `ttd-wt-e-ajustes-foco-informes.md` / `-prompt.txt` | `codex/wt-e-ajustes-foco-informes` | 126 (+95, +124), 127 (97), 129 (+120, +121), 134 | 4 (+5 absorbidos) | P2 | M | API (foco, informes) + web |

**Paquete secuencial (v0.3.1, después de A–E):**

| Paquete | Documento / prompt | Rama | Puntos | Prioridad | Tamaño | Capa |
|---|---|---|---|---|---|---|
| **F · Planifica tu día** (versión simple aprobada el 25/10) | `ttd-wt-f-plan-del-dia.md` / `-prompt.txt` (diseño en `../plan-del-dia-mejoras.md` §7; capturas en `ttd-wt-f-assets/`) | `codex/wt-f-plan-del-dia` | M1–M13, M19, M20 · BUG-145…155 (IDs propuestos, sin registrar) | P1 | L | dominio + API + MCP + web |

F **no** se lanza en paralelo con A–E: toca zonas que eran de B (Hoy), D (`planning` y MCP) y E (`product`). `check-ownership.sh` ya tiene el caso `f` (incluye `docs/audit/ttd-wt-f-assets/`). F tiene 30 criterios (F-AC-1…F-AC-30), puerto Playwright 4196 y BD de test `ttd_wt_f`.

**Cobertura:** los 31 IDs pendientes (105–135) están asignados a un único paquete.

| Paquete | IDs |
|---|---|
| A | 105, 106, 107, 130, 131, 132, 133 |
| B | 108, 109, 110, 128 |
| C | 114, 125, 135 |
| D | 111, 112, 113, 115, 116, 117, 118, 119, 122, 123 |
| E | 120, 121, 124, 126, 127, 129, 134 |

**IDs nuevos de esta ronda** (126–135, abiertos por la prueba UI de r80):

| ID | Título | Paquete |
|---|---|---|
| 126 | Reporte semanal diario | E |
| 127 | Tarjeta Google única | E |
| 128 | 🔗 en la fila | B |
| 129 | Foco: presets, validación y API | E |
| 130 | «+N» anclado | A |
| 131 | Hora en el bloque de 30 min | A |
| 132 | Hoja de fecha cortada | A |
| 133 | Periodo en formato local | A |
| 134 | Botón para corregir el ancla | E |
| 135 | Push «No configurado» / Telegram «@» | C |

## 2. Cómo arrancar los 5 en paralelo

```bash
git checkout main && git pull
git worktree add ../ttd-wt-a -b codex/wt-a-calendario main
git worktree add ../ttd-wt-b -b codex/wt-b-kanban main
git worktree add ../ttd-wt-c -b codex/wt-c-telegram main
git worktree add ../ttd-wt-d -b codex/wt-d-api-mcp main
git worktree add ../ttd-wt-e -b codex/wt-e-ajustes-foco-informes main
# En cada worktree: pnpm install --frozen-lockfile (no se regenera el lockfile)
```

Pega en cada sesión de Codex el `…-prompt.txt` de su paquete y copia el `.md` al worktree, en `docs/audit/`, o en `test-artifacts/audit/` si `docs/` no existe.

**Recursos separados por worktree:**

| Paquete | Puerto Playwright | BD de tests de integración |
|---|---|---|
| A | 4191 | — |
| B | 4192 | — |
| C | 4193 | `ttd_wt_c` |
| D | — | `ttd_wt_d` |
| E | 4195 | `ttd_wt_e` |

## 3. Reglas comunes que hacen posible el paralelismo

1. **Propiedad exclusiva de ficheros:** cada fichero editable tiene **un solo** paquete dueño (sección 4 de cada documento). Los demás lo pueden **usar** (importar), no editar.
2. **i18n:** nadie edita `i18n/es.ts`, `en.ts` ni `extra.ts`. Cada paquete web tiene su diccionario `i18n-wt-<x>.ts` con su hook y su spec de paridad es/en.
3. **Tokens CSS:** nadie edita `styles/tokens.css`. Cada paquete tiene su `*-wt-<x>.css`, con prefijos propios.
4. **Playwright:** config y specs propios (`playwright.wt-<x>.config.ts`, `e2e/wt-<x>-*.spec.ts`, `e2e/wt-<x>.fixture.ts`). Nadie edita `playwright.r80.config.ts` ni `r80.fixture.ts`.
5. **Prisma:** **solo C** tiene migración (`20261024100000_telegram_link_bot_id_cleanup`). D y E no cambian el esquema.
6. **Sin dependencias nuevas:** nadie toca `package.json`, `pnpm-lock.yaml`, `.github/` ni `CHANGELOG.md`. El changelog va en la descripción de la PR y Pablo lo consolida.
7. **Generados de la API** (`openapi.json`, `mcp/api-operations.json`, `sdk/.../schema.d.ts`) se regeneran en un commit aparte `chore(api): regenerate openapi`. Nunca se editan a mano.

## 4. Matriz de ficheros compartidos

**Ficheros editados por más de un paquete:** solo los generados de la API. Todo lo demás tiene un único dueño.

| Fichero | A | B | C | D | E | Riesgo | Mitigación |
|---|---|---|---|---|---|---|---|
| `apps/api/openapi.json` | — | — | regen | regen | regen | El job `openapi-check` de CI falla en la segunda PR que se fusione si no regenera | Tras fusionar una PR de API, las otras hacen `git rebase main`, descartan su versión (`git checkout --theirs` o la de `main`) y regeneran: `pnpm --filter api build && pnpm --filter api openapi:generate && pnpm --filter @reflexionia/sdk generate`. Commit `chore(api): regenerate openapi`. |
| `apps/api/src/mcp/api-operations.json` | — | — | regen | regen | regen | Igual | Igual (lo genera el mismo comando). |
| `packages/sdk/src/generated/schema.d.ts` | — | — | regen | regen | regen | Igual | Igual. |

**Mismo directorio, ficheros distintos** (sin conflicto de git; cada fichero tiene un solo dueño):

| Directorio | Reparto |
|---|---|
| `apps/web/src/features/settings/` | C: `TelegramCard`, `TelegramBotSettings`, `NotificationsPage`, `telegram.css`, `notifications.css` · E: `FocusSettingsPage`, `DriveCard`, `GoogleCalendarsCard` |
| `apps/web/src/features/tasks/` | B: `TaskList.tsx` + ficheros nuevos `Kanban*` · E: **solo** el bloque del aviso de ancla en `TaskDetail.tsx` + `anchor-fix.ts` nuevo |
| `apps/web/e2e/`, `apps/api/test/` | ficheros nuevos con prefijo `wt-<x>-` |

**Dependencias en tiempo de ejecución** (sin conflicto de fichero, con riesgo funcional):

| Componente (dueño) | Lo usan | Riesgo | Mitigación |
|---|---|---|---|
| `components/Popover.tsx`, `DatePopover.tsx` (A) | B («Mover a…»), el detalle (E), el composer | Una prop nueva de A rompe a los demás | Props **opcionales y retrocompatibles**; unit de A que compara el DOM sin props nuevas. |
| `components/period/PeriodNavigator.tsx` (A) | `WeekPicker.tsx` (E) | Cambiar la API pública rompe el selector del Reporte | A no cambia las props existentes y añade un e2e de humo en `/reports/weekly`. |
| `auth/auth-user.ts` (D: campo `requestSource`) | todos los servicios de la API | Ramas sin el campo no compilan | Campo **opcional**. |
| `notificationDefault` en `packages/domain` (C) | web y API de C | Cambio de firma | Sobrecarga compatible con `boolean`. |
| `scheduler.service.ts` (D) → `reminder.transport.ts` (C) | entrega de recordatorios | C necesita el chat válido | C lo resuelve en el transporte con `telegramState()` y no edita el scheduler. |
| `link_count` del detalle (D, 112) / fila de la lista (B, 128) | — | Ninguno: B usa el listado, que ya es correcto | — |

## 5. Orden de merge recomendado

1. **C · Telegram:** primero, porque hoy los avisos de Telegram se pierden y lleva la única migración. Tras desplegar, sigue la **limpieza manual** de la sección 6.
2. **D · API/MCP:** rebase sobre `main` y regenerar OpenAPI.
3. **E · Ajustes/Foco/Informes:** rebase y regenerar OpenAPI.
4. **B · Kanban:** solo web; puede ir en cualquier momento.
5. **A · Calendario:** solo web; puede ir en cualquier momento. Mejor al final porque toca componentes compartidos (`Popover`) y conviene un recorrido visual completo tras fusionarlo.

A y B no generan conflictos con nadie y se pueden fusionar en cualquier orden respecto a C, D y E. El orden solo importa para los ficheros generados (C → D → E).

**Tras cada merge:** `pnpm -r lint && pnpm -r typecheck && pnpm -r test`, los e2e del paquete fusionado y un humo de los demás (`pnpm --filter web exec playwright test -c playwright.wt-<x>.config.ts`).

### Si hay conflicto

1. **Generados de la API:** no se resuelven a mano. Toma la versión de `main` y regenera (comando de la sección 4).
2. **Fichero de otro dueño:** el paquete que lo tocó sin ser dueño revierte ese cambio y lo mueve a su fichero propio. Si no es posible, abre una nota «pendiente de <paquete dueño>» y lo hace el dueño en su rama.
3. **Migraciones:** si `main` ya tiene una migración con timestamp posterior a la de C, C renombra la suya a un timestamp posterior y comprueba con `prisma migrate dev --create-only` que no hay cambios pendientes.
4. **Funcional:** si un e2e de otro paquete falla tras fusionar, lo arregla el paquete que se fusionó **después**, en su rama y con un commit `fix(wt-x): compat …`.
5. **En la duda:** detén el merge, anota el conflicto en la PR y consúltalo con Pablo. No fuerces con `--force` ni reescribas historia publicada.

## 6. Limpieza manual de Telegram (tras desplegar C)

1. **Comprobar el estado** en Ajustes → Integraciones → Telegram. Debe decir «Sin configurar»: la migración retiró el vínculo heredado del bot global. En Notificaciones, Telegram debe estar deshabilitado con el motivo «Sin configurar».
2. **Conectar el bot:** pegar el token del bot (el antiguo o uno nuevo de BotFather) y pulsar «Conectar».
   - Con el bot antiguo, el servidor detecta el webhook global retirado y lo reemplaza.
   - Si avisa de «otra URL», usar «Tomar el control» solo si ese bot no se usa en otro entorno.
3. **Emparejar:** QR o `t.me/<bot>?start=<código>`, y esperar a «Conectado como @…».
4. **Probar:** «Probar» debe llegar en ≤ 10 s.
5. **Limpiar el servidor:** quitar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` del `.env` de producción, si siguen, y reiniciar la API.
6. **Revocar el token** en BotFather solo si se cree filtrado; en ese caso, repetir el paso 2.

No hace falta tocar la base de datos ni usar `curl` con el token.

## 7. Datos de prueba que siguen en producción

Están en la lista `grokbot-ticktackdone` y **no se han borrado**, para poder volver a probar:

| id | Tarea | Para |
|---|---|---|
| `4ec354f7-e3c7-4fa1-9789-de8404a90233` | UI-r80 día solape A 10-11 | A |
| `37bda3c1-f626-4778-b5cb-def64ce09ad8` | UI-r80 día solape B 10-11 | A |
| `796ebb52-65e2-4819-a748-fc3428ed4ddf` | UI-r80 bloque 30 min… | A |
| `4b3c5506-4364-436d-805a-0d8473c59e1b` | UI-r80 bloque 15 min | A |
| `cc919527-b393-465c-b077-a0f59637e6b6` | UI-r80 bloque 60 min | A |
| `c087805c-e185-411f-b2a3-bb1dad35c663` … `fe0a7441-8efb-4d51-9715-802c04c74464` | UI-r80 celda 1..6/6 | A |
| `d2210ac0-39cc-42bb-9260-673ad2172140` | UI-r80 ancla martes con regla lunes | E |
| `cab82517-83ac-4823-b082-defa1368b9d4` | UI-r80 título largo para Plan del día… | A |
| `ac63d7aa-9c2f-43ef-b298-849cf7d7c020` | UI-r80 enlaces y adjuntos | B, D |

## 8. Contenido del zip `ttd-worktrees.zip`

- `worktrees/` (este README, 5 documentos `.md`, 5 prompts `.txt` y `ORQUESTADOR-prompt.md`/`.txt`, el prompt inicial del agente que coordina los 5 paquetes hasta v0.3.0);
- `ttd-codex-r105.md` + `r105-shots/` (capturas de producción de 105–110);
- `r80-test-report.md`, `r80-ui-checklist.md` y `r80-ui-shots/` (193 capturas de la prueba UI, en orden de hora y sin clasificar por punto).
- paquete F: `worktrees/ttd-wt-f-plan-del-dia.md` y `-prompt.txt`, `worktrees/ttd-wt-f-assets/` (las 4 capturas aprobadas, `NOTAS.md` y `fuente/`), `plan-del-dia-mejoras.md` y `plan-del-dia/` (propuesta aprobada en `ttd-simple/`; capturas `ANTES_*` y anotadas del estado actual; `ttd/NUEVO_*`, `ttd-real/` y `v1-genericos/` solo como histórico).
