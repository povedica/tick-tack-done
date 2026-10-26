# Paquete F · Planifica tu día (versión simple aprobada): triaje tarea a tarea con duración, carrusel de días y agenda

- **Repo:** povedica/tick-tack-done.
- **Base:** `main` **con A–E fusionados** (v0.3.0). Si se lanza antes, como mínimo con D fusionado; ver §2.1.
- **Rama/worktree:** `git worktree add ../ttd-wt-f -b codex/wt-f-plan-del-dia main`
- **PR:** `feat(wt-f): planifica tu día (triaje simple, duración, carrusel de días y agenda)`
- **Versión:** v0.3.1. **Prioridad:** P1. **Tamaño:** L (web, dominio, API y MCP).
- **Diseño aprobado por Pablo (25/10/2026):** versión **simple** (v3). Sustituye a la v2 de 3 paneles con tarjeta de capacidad, zona azul de sugerencia, «Bloque horario», pantalla de entrada y 8 botones. **No implementes nada de la v2.**
- **Requisitos de detalle:** `plan-del-dia-mejoras.md` (§3 errores, §7 diseño v3, §8 mejoras, §12 puntos abiertos). Copia este documento, ese informe y la carpeta `ttd-wt-f-assets/` en `docs/audit/`.
- **Referencia visual (obligatoria):** `ttd-wt-f-assets/`
  - `01_escritorio.png`: pantalla principal (tarea actual abierta);
  - `02_escritorio-extra.png`: carrusel en «Mañana» y tarea arrastrándose a las 9:30;
  - `02b_escritorio-resumen.png`: resumen final;
  - `03_movil.png`: móvil (tarjeta, hoja «¿Cuándo?», tras decidir con deshacer/volver, resumen);
  - `NOTAS.md`: decisiones y autocrítica;
  - `fuente/`: `SimpleMock.tsx`, `simple-mock.css`, `realData.ts` (datos inventados), spec y config de Playwright y el diff de la ruta `/plan/mock`. Es **base reutilizable de maquetación**, no código de producción: no copies `realData.ts` ni la ruta `/plan/mock`.
- **Rutas de código:** las líneas citadas son de `318fbd9`.

## 1. Objetivo y contexto

Hoy «Plan del día» es un triaje por lotes que no planifica:

- «Hoy» y «Mañana» no tienen efecto visible (BUG-146 y 147);
- la carga cuenta mal las tareas de varios días: el 24/10 marcaba 8910 de 540 min (BUG-145);
- confirmar sin decidir nada marca el día como planificado y bloquea en «Ajustar» (BUG-148);
- cada visita crea 2 sesiones y la zona horaria es incoherente (BUG-149 y 153);
- «Algún día» y el replan escriben directo en BD saltándose `TasksService` (BUG-150);
- no hay herramientas MCP para el plan del día (solo `api_request`);
- `planning.css` usa tokens que no existen (`--line`, `--panel`) y una tarjeta sale blanca en oscuro (BUG-155);
- el replan reparte por UUID (BUG-151); la carga de Hoy no cuenta las vencidas (BUG-152).

Pablo quiere que **sirva, se entienda y sea simple**, con poco texto y mucho espacio:

- **5 acciones:** Hoy, Mañana y Otro día (principales); Hecha y No lo haré (discretas); Algún día y Eliminar en «…».
- **Duración en chips** 15 · 30 · 45 · 1 h · Otra, con **30 min por defecto**, y **hora opcional** «Sin hora ▾».
- **Escritorio:** cola simple a la izquierda, tarea con aire en el centro, **sidebar derecho con carrusel de días** (barra fina verde/ámbar/roja y una frase «Va justo · 50 min libres») y **agenda del día elegido** con arrastre; **atajos pegados al footer**; Deshacer en la cabecera y Ctrl+Z; resumen final.
- **Móvil:** una tarea por pantalla, la siguiente asomando, X / «3 / 12» / «‹ Anterior» / Deshacer arriba, **barra fija inferior con las 5 acciones**, hoja «¿Cuándo?» (día, hora opcional, duración) y **se puede volver atrás**.
- **Sin** amarillo de aviso, **sin** zona azul de sugerencia, **sin** porcentajes, **sin** onboarding.
- Todas las acciones escriben la **fecha de inicio** (y hora/duración si se eligen) con `TasksService`; **nunca** la fecha límite. Nada cambia hasta «Confirmar plan».

## 2. Reglas de trabajo (obligatorias)

1. **Base y rama.**
   - F es **secuencial**: empieza cuando A–E están en `main` (orden de merge de la ronda: C → D → E, con A y B libres; F después de todos), porque toca zonas que eran de B (Hoy), D (`planning` y MCP) y E (`product`, que deja de importar).
   - **2.1** Si Pablo pide lanzarlo antes, rebasa sobre `main` después de cada merge de D y B, y deja M12 para el final.
   - **Una PR** en borrador con un commit por punto (§3): `feat(plan): M2 …`. Sin push a `main`.
2. **Ficheros.** Solo los de §4. Lo de §5 no se edita; si lo necesitas, para y anótalo en la PR («NECESITO …»).
3. **Sin dependencias nuevas** (el arrastre va con Pointer Events; la descripción con `react-markdown`, que ya existe). No toques `package.json`, `pnpm-lock.yaml`, `.github/` ni `CHANGELOG.md`.
4. **i18n.**
   - No edites `i18n/es.ts`, `en.ts` ni `extra.ts`.
   - Crea `apps/web/src/features/planning/i18n-wt-f.ts` (`es` y `en`, mismas claves) y `useWtFMessages()`, que elige idioma como `messagesFor()`.
   - La copia es la de `plan-del-dia-mejoras.md` §7.6, palabra por palabra.
5. **Estilos y look de ttd.**
   - No edites `styles/tokens.css`, `components/ui.css` ni `components/ui.tsx`.
   - Usa **solo** tokens existentes (`--surface`, `--border`, `--ink*`, `--accent*`, `--success|warning|danger(-soft)`, `--radius-*`, `--shadow-*`, `--sp-*`, `--fs-*`, `--tap`, `--calendar-drag-ghost-*`, `--calendar-drag-lift-shadow`), los componentes de `components/ui.tsx` (`Button`, `Kbd`, `TagChip`, `ProgressBar`, `EmptyState`, `ErrorState`, `SkeletonRows`, `Modal`), `UndoToast`, `DatePopover` (sin editarlo) e iconos `lucide-react`.
   - `--warning` solo para la barra fina y el punto de «Va justo»; **nunca** como fondo de un bloque. Ningún bloque de fondo azul/acento para sugerencias.
   - Tokens nuevos, si hacen falta, en `features/planning/planning-wt-f.css` con prefijo `--plan-`.
   - `planning.css` deja de usar `var(--line,…)` y `var(--panel,…)` (BUG-155).
6. **Atajos.**
   - No edites `shell/GlobalKeys.tsx` ni `shell/shortcuts.ts`.
   - El triaje registra su propio listener en fase de captura, solo mientras está montado, y respeta `isTypingTarget`.
   - Dentro del triaje: H, M, O, C (y Espacio), N, A, Supr, 1–4, ←/→, ⇧←/⇧→, Ctrl/Cmd+Z, Intro, Esc y «?» con el significado de §7.1 y §7.2 del informe; paran la propagación. G+letra, «/», Ctrl/Cmd+K y «[» se dejan pasar.
7. **Tests e2e.**
   - No edites `playwright.config.ts`, `playwright.r80.config.ts` ni `e2e/r80.fixture.ts`.
   - Crea `apps/web/playwright.wt-f.config.ts`:
     - `testMatch: 'wt-f-*.spec.ts'`;
     - puerto **4196** (A–E usan 4191–4195);
     - proyectos de 360×780, 390×844, 768×1024 y 1280×800, en claro y oscuro (`wt-f-<ancho>-<light|dark>`).
   - Datos en `e2e/wt-f.fixture.ts` (puede importar `r80.fixture.ts` en solo lectura). Reproduce las tareas de los bocetos (contrato de Cadaqués, revisión semanal recurrente, etc.) para comparar capturas.
8. **API y BD.**
   - OpenAPI y SDK (`openapi.json`, `api-operations.json`, `schema.d.ts`) solo regenerados, en un commit aparte `chore(api): regenerate openapi`. Si chocan con `main`: toma `main` y regenera.
   - Migración solo si M10 la necesita: `prisma/migrations/<ts>_plan_operation_revert`, que toca **solo** tablas `plan_*`.
   - BD de tests propia: `DATABASE_URL=…/ttd_wt_f`.
9. **Escrituras.**
   - Toda escritura de tareas pasa por `TasksService` (`update`, `complete`, `cancel`, `remove`), con actividad `source:'plan'`.
   - **Prohibido** `prisma.task.update` en `modules/planning/**`.
   - No edites `modules/tasks/**`; si falta un método, usa `update` y anótalo.
10. **Evidencias:** `test-artifacts/audit/evidencias/wt-f/<punto>_<pantalla>_<antes|despues>_<ancho>_<light|dark>.png`. En la PR, cada captura 1280/390 en claro junto a la de `ttd-wt-f-assets/` que le corresponde.
11. **Verificación:**
    - `pnpm format:check`, `lint`, `typecheck`, `test` y `test:integration`;
    - `pnpm --filter web exec playwright test -c playwright.wt-f.config.ts`;
    - `check-ownership.sh f .` (sección 12 de `ORQUESTADOR-prompt.md`) con código 0.
12. **KISS:** el cambio mínimo que cumpla los criterios. Si algo de los bocetos choca con el código, gana el boceto en lo visual y este documento en lo funcional; anótalo. Lo que no puedas reproducir, «a verificar».
13. **Puntos abiertos** (`plan-del-dia-mejoras.md` §12, A1–A7): implementa la columna «Por defecto». No inventes alternativas.

## 3. Puntos (orden de commits)

| #   | Punto        | Qué                                                                                                                                                                              | Ref. informe      |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | **M2**       | Carga correcta: varios días cuentan solo su parte de cada día; vencidas en Hoy; zona del perfil; días laborables configurables; `GET /planning/load?from&days`                   | BUG-145, 152, 153 |
| 2   | **M8**       | Cola y `proposeReplan` por prioridad y vencimiento; fechas humanas. Sin sugerencias en la UI                                                                                     | BUG-151           |
| 3   | **M1**       | Modelo de acciones único (`domain/planning/actions.ts`, contrato `{action, date?, time?, duration?}`) que escribe con `TasksService` en plan, replan y cierre                    | BUG-146, 147, 150 |
| 4   | **M7**       | Duración (chips, 30 por defecto) y hora opcional: `slots.ts` (huecos cada 15 min)                                                                                                | §7.1              |
| 5   | **M3**       | Triaje móvil simple: tarjeta, siguiente asomando, barra fija de 5 acciones, hoja «¿Cuándo?», volver atrás, deshacer, resumen. Una sesión por visita (`GET /planning/candidates`) | §7.3              |
| 6   | **M4**       | Entrada directa a la primera tarea (sin pantalla de fuentes); se quita `AdjustmentPage`; 0 cambios → no se confirma (422 `nothing_to_apply`)                                     | BUG-148, 149      |
| 7   | **M5 + M20** | Copia (`i18n-wt-f`), vocabulario único, poco texto, sin onboarding, toast con deshacer                                                                                           | §7.6              |
| 8   | **M6**       | Escritorio: cola simple · tarea · sidebar; atajos en el footer; Deshacer en cabecera; ayuda «?»; popover «Otro día»; resumen                                                     | §7.2, §7.4        |
| 9   | **M19**      | Carrusel de días (14, 5 visibles) con barra fina y frase; agenda del día elegido                                                                                                 | §7.2              |
| 10  | **M13**      | Arrastre de tarjeta o cola a la agenda (fecha + hora) y a chips del carrusel (fecha); táctil 300 ms                                                                              | §7.2              |
| 11  | **M10**      | Deshacer después de confirmar: `POST /planning/operations/:id/revert`                                                                                                            | —                 |
| 12  | **M9**       | Recurrentes y hábitos: acciones sobre la ocurrencia                                                                                                                              | —                 |
| 13  | **M11**      | MCP: `get_day_plan`, `start_day_plan`, `record_plan_decision`, `apply_day_plan`, `revert_day_plan`; `get_day_load` con `days`; `replan_day` como alias                           | —                 |
| 14  | **M12**      | Tira de Hoy con la frase de estado (solo si B está fusionado)                                                                                                                    | —                 |

## 4. Ficheros que PUEDE tocar (propiedad de F)

**Web:**

- `apps/web/src/features/planning/**`:
  - nuevo `triage/`: `TriageFlow`, `TriageDesktop`, `TaskCard`, `QueueList`, `DurationChips`, `TimeSelect`, `DayRail`, `DayAgenda`, `WhenPopover` (escritorio), `WhenSheet` (móvil), `MobileActionBar`, `MoreMenu`, `SummaryView`, `ShortcutFooter`, `TriageHelp`, `useTriageSession`, `useTriageKeys`, `useTriageDrag`;
  - `api.ts` local;
  - `i18n-wt-f.ts` y `planning-wt-f.css`;
  - reescribir `PlanDayPage.tsx` y `DayPlanEntry.tsx`, y quitar `AdjustmentPage.tsx`;
  - `WontDoPage` pasa a su propio fichero sin cambiar su comportamiento;
  - `planning.css`.
- `apps/web/src/app.tsx`: **solo** las rutas `/plan/day`, `/replan` y `/wont-do` (`:179-182`). Se revisa a mano.
- `apps/web/src/features/closing/ShutdownPage.tsx`: solo para usar `actions.ts` (se revisa a mano).
- `apps/web/playwright.wt-f.config.ts`, `e2e/wt-f-*.spec.ts` y `e2e/wt-f.fixture.ts`.
- Specs que ya existen y se adaptan (se revisan a mano): `e2e/plan-day-review.spec.ts`, `r80-plan-sources.spec.ts`, `today-plan-habits.spec.ts`, `day-load.spec.ts` y `day-closing.spec.ts`.

**Dominio:**

- `packages/domain/src/planning/**` (`day-plan`, `day-load`, `replan`, y los nuevos `actions` y `slots`, con specs);
- `packages/domain/src/index.ts`: solo los exports (se revisa a mano).

**API:**

- `apps/api/src/modules/planning/**` (`planning.service`, `planning.controller`, `day-closing.service`, DTO);
- `apps/api/test/wt-f-*.e2e-spec.ts`;
- `apps/api/test/day-closing.e2e-spec.ts` (se revisa a mano);
- `apps/api/prisma/schema.prisma`: **solo** los modelos `Plan*` (se revisa a mano);
- `prisma/migrations/<ts>_plan_*`;
- generados, en un commit aparte.

**MCP:**

- `apps/api/src/mcp/tools/planning-tools.ts` (nuevo, con su spec);
- `apps/api/src/mcp/mcp.catalog.ts`: **solo** el registro y las descripciones de planificación (`:555-625`). Se revisa a mano.
- `docs/mcp/CHANGELOG.md` (se revisa a mano).

**Condicional (M12, solo si B está en `main`):** `apps/web/src/features/today/TodayPlanStrip.tsx` y `today-support.css` (se revisan a mano).

**Docs:** `docs/audit/ttd-wt-f-plan-del-dia.md`, `docs/audit/plan-del-dia-mejoras.md` y `docs/audit/ttd-wt-f-assets/**` (capturas, `NOTAS.md` y `fuente/`).

## 5. Ficheros que NO debe tocar

| Fichero o carpeta                                                                                                                        | Motivo                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/i18n/es.ts`, `en.ts`, `extra.ts`, `styles/tokens.css`, `components/ui.css`, `components/ui.tsx`                            | Compartidos; F usa ficheros propios                                                                                                  |
| `apps/web/src/shell/**` (`GlobalKeys`, `shortcuts.ts`, `ShortcutHelp`, `AppShell`)                                                       | A. F tiene su propio listener y su propia ayuda                                                                                      |
| `apps/web/src/features/calendar/**`, `features/places/**`, `components/period/**`, `DatePopover.tsx`                                     | A. «Elegir otra fecha» **usa** `DatePopover` sin editarlo; la agenda es propia de F (no reutiliza vistas del calendario editándolas) |
| `apps/web/src/features/product/**` (`weekly.css`, `weekly-text.ts`)                                                                      | E. F deja de importarlos                                                                                                             |
| `apps/web/src/features/today/**` (salvo M12), `features/tasks/**`                                                                        | B. Para la descripción y los adjuntos, **importa** lo que exista sin editarlo                                                        |
| `apps/web/src/api.ts`                                                                                                                    | C. F usa `features/planning/api.ts`                                                                                                  |
| `apps/api/src/modules/tasks/**`, `scheduler/**`, `search/**`                                                                             | D. F usa `TasksService` tal cual                                                                                                     |
| `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, `.github/**`, `playwright.config.ts`, `playwright.r80.config.ts`, `e2e/r80.fixture.ts` | nadie                                                                                                                                |
| La ruta `/plan/mock` y `realData.ts` del boceto                                                                                          | Solo referencia; no entran en el repo como código                                                                                    |

## 6. Cómo evitar conflictos

- **Rutas en `app.tsx`:** solo las 3 líneas de planificación, en un commit propio.
- **`mcp.catalog.ts`:** solo el bloque de planificación. Las herramientas nuevas se definen en `tools/planning-tools.ts` y se registran con una línea.
- **`schema.prisma`:** solo `Plan*`. Si M10 cabe en `PlanOperation.result`, no crees migración.
- **Generados:** commit aparte; ante conflicto, toma `main` y regenera.
- **Atajos:** nada global. Un e2e comprueba que fuera de `/plan/day`, N sigue creando tarea, Espacio completa y «[» pliega la barra lateral.

## 7. Diseño que hay que construir (resumen operativo; detalle en el informe §7)

**Escritorio 1280×800 (`01`, `02`):**

- Cabecera: «Planifica tu día» + fecha larga; a la derecha «↶ Deshacer», «Terminar luego» y «Revisar plan (n)» (primario; deshabilitado con 0). «…» de cabecera: añadir Bandeja / Sin fecha.
- Columna izquierda (~240 px): «Por decidir · 4 de 12» + barra fina; lista sin secciones; ✓ + destino en las decididas; punto rojo en vencidas; fila actual resaltada; clic abre esa tarea.
- Centro: asa ⠿; meta (vencida en rojo «23 oct · hace 3 días», lista con color, prioridad, ↻); título completo grande; `TagChip`; descripción markdown completa; adjuntos; separador; chips de duración + «Sin hora ▾»; 3 botones principales con `Kbd` (Hoy H, Mañana M, Otro día O); fila discreta Hecha C, No lo haré N, «…» (Algún día, Eliminar).
- Sidebar (~19 rem): carrusel ‹ Hoy · Mañana · Mié · Jue · Vie › con barra fina por día (sin %); nombre del día + frase de estado; agenda de la jornada con eventos y tareas con hora; «Sin hora: N tareas».
- Footer: una línea gris de atajos pegada abajo (incluye «⠿ arrastra a la agenda o a un día»).
- Arrastre: fantasma «9:30 – 10:00 · Revisar contrato» en la agenda (snap 15 min); chip resaltado en el carrusel; tarjeta atenuada mientras se arrastra.
- Resumen (`02b`): «Tu plan para hoy», Hoy (con hora, luego «—», hechas en gris) y «Para otros días» agrupado + «Algún día»; «‹ Volver» (Esc) y «Confirmar plan» (Intro).

**Móvil 390×844 (`03`):**

- Arriba ✕ · «3 / 12» · ‹ · ↶. Tarjeta con la siguiente asomando. Meta, título, «⏱ 30 min», etiquetas, descripción con degradado + «Ver más», adjuntos, «…».
- Barra fija inferior: Hecha · Hoy · Mañana · Otro día · No lo haré.
- Hoja «¿Cuándo?»: carrusel con barras, «Elegir otra fecha», Hora (opcional) [Sin hora | huecos], Duración [15 | 30 | 45 | 1 h | Otra], botón «Planificar el viernes 30 a las 9:30».
- Tras decidir: toast con Deshacer; «‹» o deslizar a la derecha vuelve a la anterior.
- Resumen: «Tu día está listo», bloque Hoy (+N más), «Lo demás» con recuentos, «Confirmar plan», «Volver a revisar».

**Carga (umbral de color):** verde ≤ 0,85 · ámbar ≤ 1 · rojo > 1 (ratio de `dayLoad` con M2). Frase: «Cabe · X libres» / «Va justo · X libres» / «No cabe · sobran X».

## 8. Tests a añadir

- **Dominio** (`vitest`):
  - `day-load.spec.ts`: rango de 7 días → ≤ jornada por día; vencidas incluidas en Hoy; zona del perfil;
  - `replan.spec.ts` y `day-plan.spec.ts`: prioridad y vencimiento antes que UUID;
  - `actions.spec.ts`: efecto de today/tomorrow/move (con y sin `time`/`duration`), done, wont_do, someday, delete, skip; la fecha límite no cambia; sin elegir duración no se escribe `duration_minutes`;
  - `slots.spec.ts`: huecos, snap 15 min, solapes, jornada y `evening_start`.
- **API** (`wt-f-plan.e2e-spec.ts`):
  - 1 sesión por visita;
  - `apply` con 0 decisiones → 422;
  - `today` → `startDate` + actividad `source:'plan'`; `move` con hora → `startDate` con hora + `duration_minutes`;
  - `someday` y el replan por `TasksService`;
  - `GET /planning/load?from&days=14` con huecos;
  - revert idempotente y 409.
- **MCP:** `start_day_plan` → `record_plan_decision` (`today` con hora, `move`) → `apply_day_plan` → `revert_day_plan`.
- **Web e2e** (`wt-f-*.spec.ts`, 390 y 1280, claro y oscuro):
  - `wt-f-triage-mobile`: 12 tarjetas → 12 decisiones → resumen; ‹ Anterior y deslizar devuelven la anterior y permiten cambiarla; Deshacer; hoja «¿Cuándo?» con día + hora + duración; barra inferior de la app oculta;
  - `wt-f-triage-keys`: triaje completo con H, M, O, C, N, 1–4, ←/→, Ctrl+Z, Intro, Esc y «?»; A y Supr desde la ayuda; N, Espacio y «[» globales intactos fuera del triaje;
  - `wt-f-triage-drag`: `page.mouse` arrastra la tarjeta a las 9:30 de mañana → «9:30 – 10:00» y pasa a la siguiente; una fila a «Vie» → decisión `move`; sobre un evento → no se puede soltar; Ctrl+Z → se deshace; táctil con pulsación larga;
  - `wt-f-triage-days`: carrusel ⇧→ cambia la agenda sin cambiar la cola; el color de la barra cambia al decidir;
  - `wt-f-triage-look`: no existen elementos de sugerencia ni de aviso amarillo; no hay «%» en el triaje; los atajos están dentro del footer (bounding box en la parte inferior del viewport);
  - `wt-f-triage-states`: vacío, cargando (esqueleto), error con reintento y conflicto;
  - `wt-f-a11y`: axe sin violaciones serias; foco en el título tras cada decisión; `aria-live`; `prefers-reduced-motion`.

## 9. Criterios de aceptación

**Datos y escrituras**

- [ ] **F-AC-1 (carga):** `get_day_load` con una tarea de 7 días y jornada de 9 h → ≤ 540 min por día; las vencidas visibles en Hoy cuentan en la carga de hoy; se usa la zona del perfil (BUG-145, 152, 153).
- [ ] **F-AC-2 (Hoy/Mañana con efecto):** «Hoy» sobre una tarea sin fecha → tras confirmar aparece en Hoy y en el calendario; «Mañana» → en Mañana; `due_date` sin cambios; `version` +1; actividad `source:'plan'` (BUG-146, 147).
- [ ] **F-AC-3 (hora y duración):** con hora «9:30» y 30 min, la tarea queda en el calendario de 9:30 a 10:00; sin elegir nada, queda sin hora y **no** se escribe `duration_minutes`; con otra duración elegida, sí se escribe.
- [ ] **F-AC-4 (TasksService):** Algún día, Hecha, No lo haré, Eliminar y el replan pasan por `TasksService`; un grep de `prisma.task.update` en `apps/api/src/modules/planning` da 0 (BUG-150).
- [ ] **F-AC-5 (sesiones y confirmar vacío):** 1 sesión por visita (≤ 1 borrador por usuario y día); con 0 decisiones «Revisar plan» está deshabilitado y la API responde 422 `nothing_to_apply`; no existe `AdjustmentPage`; la 2.ª visita abre el mismo triaje con lo que queda (BUG-148, 149).
- [ ] **F-AC-6 (orden):** la cola y el replan ordenan por prioridad y vencimiento, no por UUID; los motivos usan fecha humana (BUG-151).

**Escritorio**

- [ ] **F-AC-7 (acciones):** exactamente 3 botones principales (Hoy H, Mañana M, Otro día O), 2 discretos (Hecha C, No lo haré N) y «…» con Algún día y Eliminar. No hay «Bloque horario», ni grupos «Hacerla / Moverla / Cerrarla», ni «Sugerida».
- [ ] **F-AC-8 (duración):** chips 15 · 30 · 45 · 1 h · Otra; preseleccionada la duración de la tarea o **30 min**; teclas 1–4; «Otra» acepta 5–480 min; sin texto explicativo ni fondo de aviso.
- [ ] **F-AC-9 (hora opcional):** «Sin hora ▾» lista los huecos libres del día destino cada 15 min dentro de la jornada y «Otra hora…»; nunca ofrece una hora que se solape con un evento o una tarea con hora.
- [ ] **F-AC-10 (cola simple):** una lista sin secciones; «Por decidir · n de N» con barra fina; ✓ y destino en las decididas; punto rojo en vencidas; clic abre la tarea; sin días de retraso por fila ni «≈ N min».
- [ ] **F-AC-11 (tarea con aire):** vencida en rojo con «hace N días», lista, prioridad, recurrencia, etiquetas, título completo, descripción markdown entera y adjuntos; sin chips de estado repetidos. Comparada con `01_escritorio.png`, misma jerarquía y espaciado.
- [ ] **F-AC-12 (carrusel):** 5 días visibles (14 con flechas o ⇧←/⇧→), barra fina verde (≤ 0,85) / ámbar (≤ 1) / roja (> 1), **sin porcentajes**; días sin jornada en gris; `role="tablist"` con estado en texto en el `aria-label`.
- [ ] **F-AC-13 (frase de estado):** una sola frase para el día elegido: «Cabe · X libres», «Va justo · X libres» o «No cabe · sobran X»; se actualiza en < 100 ms tras cada decisión y coincide con `GET /planning/load` tras confirmar (±1 min).
- [ ] **F-AC-14 (agenda):** la agenda del día elegido muestra eventos de Google, tareas con hora y lo decidido en la sesión, y «Sin hora: N tareas»; cambiar de día en el carrusel cambia la agenda y **no** la cola.
- [ ] **F-AC-15 (arrastre):** la tarjeta (⠿) o una fila de la cola se arrastran a la agenda (fantasma con hora y duración, snap 15 min → decisión con fecha y hora) o a un chip del carrusel (→ decisión sin hora); al soltar se pasa a la siguiente; sobre un evento no se puede soltar («Se solapa con …»); en táctil, pulsación larga de 300 ms; la alternativa sin ratón es «O».
- [ ] **F-AC-16 (Otro día en escritorio):** «O» abre un popover con días (barra fina), «Elegir otra fecha» (`DatePopover`), hora opcional y duración; si el carrusel está en otro día, viene preseleccionado.
- [ ] **F-AC-17 (atajos en el footer):** la leyenda está pegada al footer, en gris, en una sola línea a 1280 px y siempre visible; «?» abre la ayuda completa del triaje (incluye A, Supr, Espacio, ⇧←/⇧→, Intro, Esc). Fuera del triaje, N, Espacio, ↑/↓ y «[» se comportan como antes.
- [ ] **F-AC-18 (deshacer y volver):** «↶ Deshacer» de la cabecera y Ctrl/Cmd+Z revierten la última decisión (botón, atajo o arrastre) y devuelven la tarjeta; ← vuelve a la anterior y permite cambiar su decisión; → sin decidir la salta.
- [ ] **F-AC-19 (entrada directa):** `/plan/day` abre la primera tarea sin pantalla intermedia; fuentes por defecto Hoy + Vencidas; Bandeja y Sin fecha desde «…» de la cabecera, recordadas.
- [ ] **F-AC-20 (resumen):** «Tu plan para hoy» con Hoy (con hora en orden, luego «—», hechas en gris) y «Para otros días» agrupado por día + «Algún día»; «Aún no se ha cambiado nada. Confirma cuando te parezca bien.»; Intro confirma y Esc vuelve; nada se escribe antes de confirmar; tras confirmar, toast con Deshacer.

**Móvil**

- [ ] **F-AC-21 (tarjeta):** una tarea por pantalla con la siguiente asomando; arriba ✕ (guarda el borrador), «3 / 12», «‹ Anterior» y ↶; tarjeta con todos los datos importantes; descripción larga con degradado y «Ver más».
- [ ] **F-AC-22 (barra fija):** barra inferior fija con Hecha · Hoy · Mañana · Otro día · No lo haré, cada una ≥ 44 px; la barra inferior de la app está oculta; «Hoy» y «Mañana» deciden en 1 toque con la duración que haya.
- [ ] **F-AC-23 (hoja «¿Cuándo?»):** carrusel con barras, «Elegir otra fecha», Hora (opcional) con «Sin hora» + huecos, Duración 15/30/45/1 h/Otra y botón con el resultado en palabras («Planificar el viernes 30 a las 9:30»); sin cuadrícula mensual salvo el `DatePopover`.
- [ ] **F-AC-24 (volver atrás):** «‹ Anterior» y deslizar a la derecha devuelven la tarea anterior con su decisión visible y editable; toast «… → vie 30, 9:30 · Deshacer» durante 5 s; los gestos nunca deciden solos.
- [ ] **F-AC-25 (resumen móvil):** «Tu día está listo · N tareas decididas. Aún no se ha cambiado nada.», bloque Hoy con estado y «+N más», «Lo demás» con recuentos, «Confirmar plan» y «Volver a revisar».

**Transversal**

- [ ] **F-AC-26 (look):** sin zona azul de sugerencia, sin fondos amarillos, sin tarjeta de capacidad ni porcentajes; solo tokens (grep de `#[0-9a-f]{3,6}` en `features/planning/*.css` = 0 salvo comentarios); `planning.css` sin `--line`/`--panel` y `.plan-card` correcta en oscuro (BUG-155); capturas 390 y 1280 en claro y oscuro junto a las de `ttd-wt-f-assets/`.
- [ ] **F-AC-27 (estados y a11y):** vacío, cargando (`SkeletonRows`), error con reintento y conflicto; axe sin violaciones serias; foco al título; `aria-live`; `prefers-reduced-motion`.
- [ ] **F-AC-28 (i18n y vocabulario):** es y en completos en `i18n-wt-f.ts`; en `features/planning` no quedan «Listo», «Creando…», «Usar sugerencia», «Aplicar», «Bloque horario», «Sugerida» ni «Cancelar» (en el sentido de «No lo haré»).
- [ ] **F-AC-29 (MCP y deshacer tras confirmar):** `get_day_plan`, `start_day_plan`, `record_plan_decision` (`action`, `date?`, `time?`, `duration?`), `apply_day_plan` y `revert_day_plan` en un e2e; `docs/mcp/CHANGELOG.md` actualizado; revert idempotente o 409 claro (M10, M11).
- [ ] **F-AC-30 (verde y propiedad):** tests de dominio, API, MCP y web en verde; `check-ownership.sh f .` con código 0; recurrentes: las acciones afectan solo a la ocurrencia (M9); M12 hecho o anotado como «pendiente de B».

## 10. Checklist de verificación manual

Se hace en preview o con datos simulados. En producción, solo con tareas de prueba en la lista `grokbot-ticktackdone`.

| #   | URL                   | Ancho      | Qué comprobar                                                                                                                                                           |
| --- | --------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/plan/day`           | 1280       | Se parece a `01_escritorio.png`: cola simple, tarea con aire, 3 + 2 acciones + «…», chips con 30 marcado, carrusel con barras y frase, agenda, atajos pegados al footer |
| 2   | `/plan/day`           | 1280       | Carrusel a «Mañana» y arrastrar la tarjeta a las 9:30 (`02_escritorio-extra.png`); Ctrl+Z                                                                               |
| 3   | `/plan/day`           | 1280       | H/M/O/C/N, 1–4, ←/→ y «?»; «Revisar plan» → resumen como `02b`; Esc vuelve; Intro confirma                                                                              |
| 4   | `/plan/day`           | 390        | Como `03_movil.png`: tarjeta, «3 / 12», barra fija de 5; «Otro día» → hoja; deshacer; «‹ Anterior»                                                                      |
| 5   | `/plan/day`           | 390 / 1280 | Modo oscuro: nada blanco ni con colores fijos                                                                                                                           |
| 6   | `/today` y calendario | 390 / 1280 | Tras confirmar, «Hoy» se ve en Hoy y lo que tiene hora, en el calendario                                                                                                |
| 7   | Por MCP               | —          | `start_day_plan` → `record_plan_decision {today, time}` → `apply_day_plan` → `revert_day_plan`, sobre tareas de prueba                                                  |

## 11. Prompt para Codex (también en `ttd-wt-f-plan-del-dia-prompt.txt`)

```
Trabaja en el repo povedica/tick-tack-done.
Crea un worktree propio desde main actualizado, con A–E ya fusionados (v0.3.0; orden de la ronda C → D → E, A y B libres; F va después de todos):
  git worktree add ../ttd-wt-f -b codex/wt-f-plan-del-dia main
Copia en el repo docs/audit/ttd-wt-f-plan-del-dia.md (este paquete), docs/audit/plan-del-dia-mejoras.md (diseño y errores) y la carpeta docs/audit/ttd-wt-f-assets/ (capturas aprobadas, NOTAS.md y fuente/ del boceto).
Léelos enteros: son la única fuente de requisitos. El diseño APROBADO por Pablo es la versión SIMPLE (v3): 01_escritorio.png, 02_escritorio-extra.png, 02b_escritorio-resumen.png y 03_movil.png son la referencia visual obligatoria. fuente/SimpleMock.tsx y simple-mock.css son base de maquetación con los tokens y componentes reales (no copies realData.ts ni la ruta /plan/mock). NO implementes nada de la v2 (3 paneles con tarjeta de capacidad, zona azul de sugerencia, «Bloque horario», pantalla de entrada, 8 botones, vista previa al pasar el ratón, onboarding).

Objetivo: «Planifica tu día» como triaje tarea a tarea, simple y que de verdad planifica:
- 5 acciones: Hoy (H), Mañana (M), Otro día (O) principales; Hecha (C) y No lo haré (N) discretas; Algún día y Eliminar en el menú «…».
- Duración en chips 15 · 30 · 45 · 1 h · Otra, con 30 min por defecto (o la de la tarea); teclas 1–4. Hora opcional «Sin hora ▾» con los huecos libres cada 15 min. No hay acción «Bloque horario».
- Escritorio: cola simple a la izquierda («Por decidir · 4 de 12», sin secciones); la tarea con aire en el centro (meta, título, etiquetas, descripción markdown entera, adjuntos); sidebar derecho con carrusel de días (Hoy · Mañana · Mié…, barra fina verde/ámbar/roja, sin porcentajes) y una frase («Va justo · 50 min libres»), y la agenda del día elegido como destino de ARRASTRE (tarjeta o fila de la cola → agenda con hora, o → chip de día); atajos en una línea gris pegada al footer; Deshacer en la cabecera y Ctrl/Cmd+Z; «?» con la ayuda; resumen «Tu plan para hoy» con Confirmar plan (Intro) y Volver (Esc).
- Móvil: una tarea por pantalla con la siguiente asomando; arriba ✕, «3 / 12», «‹ Anterior» y Deshacer; barra fija inferior Hecha · Hoy · Mañana · Otro día · No lo haré; hoja «¿Cuándo?» (día, hora opcional, duración); se puede volver atrás (‹ o deslizar) y cambiar la decisión; resumen «Tu día está listo».
- Sin amarillo de aviso ni azul de sugerencia, poco texto, mucho espacio. Nada cambia hasta «Confirmar plan».
- Las acciones escriben la fecha de inicio (y hora/duración si se eligen) con TasksService; nunca la fecha límite. Sin elegir duración no se escribe duration_minutes.
- Corrige BUG-145 (doble conteo de carga en tareas de varios días), 146/147 (Hoy/Mañana sin efecto), 148 (confirmar sin decisiones), 149 y 153 (sesiones duplicadas y zonas horarias), 150 (Algún día y replan escriben directo en BD), 151, 152, 155 (tokens --line/--panel inexistentes en planning.css) y añade MCP del plan del día.
Puntos, en este orden de commits: M2, M8, M1, M7, M3, M4, M5+M20, M6, M19, M13, M10, M9, M11, M12 (M12 solo si B ya está en main).

Reglas clave:
- Modifica SOLO los ficheros de la sección 4. NO edites los de la sección 5: i18n/es|en|extra.ts, styles/tokens.css, components/ui.css|ui.tsx, shell/** (GlobalKeys, shortcuts), features/calendar/**, features/product/**, features/tasks/**, features/today/** (salvo M12), api.ts, modules/tasks/**, package.json, pnpm-lock.yaml, CHANGELOG.md, .github/. Si necesitas algo de ahí, para y escribe «NECESITO …» en la PR.
- Look de ttd: solo tokens existentes (más --plan-* en planning-wt-f.css si hace falta); Button/Kbd/TagChip/ProgressBar/EmptyState/ErrorState/SkeletonRows/Modal/UndoToast/DatePopover e iconos lucide-react. Sin colores fijos. --warning solo en la barra fina y el punto de «Va justo».
- i18n en features/planning/i18n-wt-f.ts (es y en), con la copia de plan-del-dia-mejoras.md §7.6.
- Atajos con un listener propio del triaje (fase de captura, respeta isTypingTarget). Fuera del triaje los globales (N, Espacio, ↑/↓, «[») no cambian.
- Arrastre con Pointer Events, sin dependencias nuevas; táctil con pulsación larga de 300 ms; alternativa de teclado «O»; tokens --calendar-drag-* en solo lectura.
- Toda escritura de tareas pasa por TasksService (actividad source:'plan'). Nada de prisma.task.update en modules/planning.
- Una sesión por visita; no se puede confirmar con 0 cambios (422 nothing_to_apply); sin AdjustmentPage; entrada directa a la primera tarea.
- Puntos abiertos A1–A7 (informe §12): implementa la columna «Por defecto».
- Playwright con playwright.wt-f.config.ts (puerto 4196; 360/390/768/1280 en claro y oscuro); specs e2e/wt-f-*.spec.ts; BD de test ttd_wt_f.
- OpenAPI/SDK solo regenerados, en un commit aparte (ante conflicto: toma main y regenera).
- Una PR «feat(wt-f): planifica tu día (triaje simple, duración, carrusel de días y agenda)», en borrador, sin push a main ni force push.
- pnpm format:check, lint, typecheck, test, test:integration y los e2e propios en verde; check-ownership.sh f . con código 0.
- En la PR, recorre F-AC-1…F-AC-30 con ✅/❌ y evidencia (capturas a 390 y 1280, en claro y oscuro, cada una junto a la captura aprobada de ttd-wt-f-assets/).
- KISS. No inventes datos: lo que no reproduzcas, anótalo como «a verificar». No toques datos reales de Pablo: en producción, solo tareas de prueba en la lista grokbot-ticktackdone.
```

## 12. Estado de ejecución F · cierre local 26/10/2026

### Implementación y base

M2, M8, M1, M7, M3, M4, M5+M20, M6, M19, M13, M10, M9, M11 y M12 implementados en ese orden, con un commit por punto. M12 se completó el 26/10 tras integrar B en main local, con autorización de Pablo para cerrar e integrar todo localmente. La entrada abre directamente la primera tarjeta pendiente; las decisiones son un borrador y solo la confirmación escribe tareas. La UI usa el diseño simple v3, sin ruta de mock ni dependencias nuevas. Referencias RF-2651, RF-2670, RF-2671 y RF-2001.

Rama `codex/wt-f-plan-del-dia`, worktree aislado `wt-f-plan-del-dia/todo`, desde `97d7da3` de la rama `feat/r80-r105`. Se comprobó que los cinco extremos A–E y main eran antecesores de esa base. Por instrucción de Pablo (26/10), A–E se integran primero mediante avance rápido en **main local** y F se integra después. La nueva rama de pruebas y refinamiento es `codex/local-tests-refinement`, creada desde ese main local en `/Users/pablo.poveda/CodeProjects/todo`. Los documentos no versionados de `docs/spec/` se conservan. No se hace push ni se cambian las PR remotas #77/#78 con esta orden local; `origin/main` permanece en `318fbd9`.

### Ampliaciones expresamente autorizadas por Pablo

- `auth-user.ts` y `tasks.service.ts`: origen interno `plan`, conservación exacta de fecha límite y duración, restauración y transacción compartida con la operación de planificación. El resto de clientes mantiene su semántica. La transacción compartida se limita a los métodos que usa planificación.
- Registro mínimo de herramientas en `mcp.service.ts`, implementación en `mcp/tools/planning-tools.ts` y prueba de extremo a extremo con un PAT sintético. Las nuevas herramientas llaman a endpoints públicos y respetan permisos. `replan_day` con bearer abre el borrador canónico; conserva vacío sin crear sesión y se puede descartar. La vía local de desarrollo sin bearer conserva el comportamiento anterior.
- Añadir exclusivamente `ttd_wt_f` a las listas de BD sintéticas en `oauth-process-restart.e2e-spec.ts`, `maintenance-r80.e2e-spec.ts` y `scripts/r80-local-fixture.ts`. Ninguna otra BD admitida ni cambios en sus aserciones.

### Verificación reproducida

Node 26 en contenedor temporal, PostgreSQL/Redis locales y BD exclusiva `ttd_wt_f`; usuarios y tareas sintéticos. La copia Linux `/validation` contiene los mismos fuentes para evitar latencia del volumen de macOS. `pg_dump` se instaló únicamente en el contenedor para la prueba existente de backups.

| Comprobación                              | Resultado                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                       | Correcto en el repositorio completo                                                                                     |
| `pnpm lint`                               | Correcto; un aviso previo de `console` en `wt-d-allday.e2e-spec.ts`                                                     |
| `pnpm typecheck`                          | Correcto                                                                                                                |
| `pnpm test`                               | 890 correctas: dominio 341, SDK 11, API 282 y web 256                                                                   |
| Cobertura de dominio                      | 89,68 % líneas/sentencias; 83,44 % ramas                                                                                |
| `pnpm test:integration`                   | 230 correctas y 2 omitidas de Ticky cross; 49 archivos correctos y 1 omitido                                            |
| API F ampliada                            | 10 correctas, incluidos concordancia de carga y fallo sintético de segunda escritura con rollback completo              |
| Playwright F, puerto 4196                 | 116 correctas y 20 omisiones por dispositivo: arrastre de ratón solo en escritorio y gesto táctil solo en móvil/tableta |
| Axe                                       | Cero violaciones serias o críticas en los ocho proyectos de triaje                                                      |
| OpenAPI y SDK                             | Regenerados; segunda generación idéntica por SHA-256                                                                    |
| Escrituras directas de tareas en planning | Cero coincidencias de `prisma.task.update`                                                                              |
| CSS                                       | Cero colores hexadecimales, `--line` o `--panel` en CSS de planificación                                                |

Los primeros intentos detectaron y corrigieron una expectativa antigua de confirmar vacío, un parseo MCP sin tipo y la compatibilidad de replan. Hubo un timeout de correo y dos cierres de Chromium que agotaron el tiempo bajo carga; unitarios y Playwright completos posteriores pasaron. No se modificaron esas pruebas ajenas para ocultar los fallos.

Las capturas finales están en `ttd-wt-f-assets/evidencias/` (390/1280, claro/oscuro) y se comparan con las aprobadas en la PR. La revisión de imágenes detectó y corrigió la hoja en portal sin estilos y el resumen sin clases de maquetación; se repitieron los 80 casos después y se amplió la suite a 104 casos con conflicto, latencia y solape de fila. M12 añade 32 casos de carga (incluidos eventos) y estado guardado: 136 casos en total.

### Criterios F-AC-1…30

✅ significa comportamiento reproducido mediante pruebas o inspección concreta. ❌ identifica comprobaciones pendientes, incluso si el comportamiento está implementado; no se presentan como verificadas.

| Criterio | Estado | Evidencia / límite                                                                                                                                                                |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-AC-1   | ✅     | Dominio y API: rango de siete días ≤540 min/día, vencidas y zona del perfil                                                                                                       |
| F-AC-2   | ✅     | API: inicio, versión y actividad plan; límite intacto incluso vencido                                                                                                             |
| F-AC-3   | ✅     | Dominio/API/MCP: hora y duración explícitas; sin elección no se estima duración                                                                                                   |
| F-AC-4   | ✅     | Todas las mutaciones por TasksService; prueba de rollback; cero escritura directa                                                                                                 |
| F-AC-5   | ✅     | Reutilización de borrador, primera pendiente y 422 vacío; sin AdjustmentPage                                                                                                      |
| F-AC-6   | ✅     | Unitarios de cola/replan por prioridad y vencimiento                                                                                                                              |
| F-AC-7   | ✅     | Atajos y capturas: tres acciones principales, dos discretas y menú                                                                                                                |
| F-AC-8   | ✅     | Chips, teclado y elección de 45 min en hoja; límites validados                                                                                                                    |
| F-AC-9   | ✅     | Slots del dominio y API; selector y confirmación de hora libre                                                                                                                    |
| F-AC-10  | ✅     | Cola y destinos revisados en capturas 1280 claro/oscuro                                                                                                                           |
| F-AC-11  | ✅     | Capturas con contrato completo, markdown, etiquetas y adjuntos                                                                                                                    |
| F-AC-12  | ✅     | Carrusel de catorce días, cinco visibles y navegación por teclado                                                                                                                 |
| F-AC-13  | ✅     | Cambio de carga <100 ms con respuesta retrasada 300 ms en ambos temas de escritorio; API: incremento persistido exactamente 45 min                                                |
| F-AC-14  | ✅     | Agenda de eventos, tareas y borrador; cambio de día independiente de cola                                                                                                         |
| F-AC-15  | ✅     | Ratón a 09:30, pulsación larga, fila a un chip sin hora y rechazo de solape con Daily del equipo                                                                                  |
| F-AC-16  | ✅     | O abre popover anclado; DatePopover existente y fecha destino seleccionada                                                                                                        |
| F-AC-17  | ✅     | Footer a 1280, ayuda y atajos locales; N y [ comprobados fuera; archivos globales intactos                                                                                        |
| F-AC-18  | ✅     | Deshacer, Ctrl+Z, anterior y edición de decisión en e2e                                                                                                                           |
| F-AC-19  | ✅     | Entrada directa, fuentes por defecto y preferencias locales por owner                                                                                                             |
| F-AC-20  | ✅     | Resumen, doce decisiones sin mutar, confirmar y deshacer posterior                                                                                                                |
| F-AC-21  | ✅     | Capturas y e2e móvil con siguiente tarjeta, markdown y Ver más                                                                                                                    |
| F-AC-22  | ✅     | Cinco acciones fijas y barra global oculta; tamaños 360/390/768                                                                                                                   |
| F-AC-23  | ✅     | Hoja con día, hora opcional, duración y confirmación en palabras                                                                                                                  |
| F-AC-24  | ✅     | Swipe navega sin decidir; decisión previa editable y toast de 5 s                                                                                                                 |
| F-AC-25  | ✅     | Resumen móvil con +N más, Lo demás y confirmación visible                                                                                                                         |
| F-AC-26  | ✅     | Revisión de capturas y grep de tokens; sin avisos ni sugerencias v2                                                                                                               |
| F-AC-27  | ✅     | Vacío, error/reintento, foco, axe y conflicto 409 reproducidos; se retira la decisión obsoleta y no se aplica el plan                                                             |
| F-AC-28  | ✅     | Diccionarios es/en con prueba de paridad y copia local                                                                                                                            |
| F-AC-29  | ✅     | MCP real: empezar/decidir/previsualizar/aplicar/leer carga/revertir; PAT de lectura rechazado; revert idempotente y 409                                                           |
| F-AC-30  | ✅     | Suites en verde, ocurrencias aisladas y M12 completo tras B en main local; `bash scripts/check-ownership.sh f . 97d7da3` devuelve código 0 con excepciones autorizadas explícitas |

### Catálogo de eventos añadido

| Evento             | Versión | Entidad        | Datos                                      | Emisor                                       |
| ------------------ | ------- | -------------- | ------------------------------------------ | -------------------------------------------- |
| `plan.reverted@v1` | 1       | `plan_session` | `operation_id`, `source: plan`, `task_ids` | PlanningService, tras restaurar la operación |

Las actualizaciones de tareas emiten los eventos existentes desde TasksService con origen `plan`. El cambio de días laborables usa el evento existente de preferencias. No se modificó el modelo Prisma ni se necesitó migración; los snapshots de M10 usan `PlanOperation.result`.

### Cierre local y revisión del producto

- **M12 completo:** Hoy muestra la frase de carga compartida, incluyendo eventos, y «Planifica tu día». Tras guardar, muestra «Planificado a las …» en la zona del perfil y «Volver a planificar». Se revisaron capturas 390/1280 en claro/oscuro, además de los 32 casos e2e en los ocho proyectos.
- **Gate resuelto:** `scripts/check-ownership.sh` incorpora la lógica del orquestador, admite los generados que F exige y enumera exactamente las seis ampliaciones autorizadas por Pablo. Conserva las prohibiciones para los demás archivos. Usa main local por defecto y no hace fetch. Para reproducir la revisión no vacía de F tras integrarlo: `bash scripts/check-ownership.sh f . 97d7da3`. La revisión manual de los archivos señalados está realizada: catálogo MCP solo planificación, exportaciones de dominio de planificación, compatibilidad de cierre y los dos archivos de Hoy para M12.
- **Contratos:** se regeneran OpenAPI y SDK sobre el conjunto integrado y se comparan sin diferencias. No se crea un commit artificial si los generados no cambian.
- **Decisión de Pablo (26/10/2026):** mantener los 4 s del toast global posterior a confirmar, frente a los 10 s previstos en M10. Diferencia aceptada; no se aplica el parche de duración opcional ni se modifican `action-toast.ts` o `AppShell.tsx`.
- **Trabajo local:** commits realizados en la rama F, integrados en main local y rama nueva de refinamiento desde el mismo estado. No se fusionan ni publican PR remotas ni se despliega. Las comprobaciones usan exclusivamente datos sintéticos en `ttd_wt_f`.
- La revisión humana del producto con datos reales corresponde a la nueva rama de pruebas. No quedan puntos de implementación F pendientes.
