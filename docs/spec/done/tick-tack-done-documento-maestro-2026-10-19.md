# tick-tack-done: documento maestro para Cursor (19 oct 2026)

Base: desplegado d87e3fa, main 51dd555 (mismo codigo de producto). Un solo documento con todas las evidencias, Telegram como receptor de notificaciones, la funcionalidad Planifica tu dia y la captura en lenguaje natural (fechas y horas) compartida por Telegram, web, API y email. Cada parte conserva su numeracion; las capturas se citan por nombre. La Parte 8 amplia el alcance de H-02 y de NT-03: no basta un matcher de hora suelta.

## Indice

1. Revision del detalle de tarea y sidebar vs TickTick (incluye consolidado del dia)
2. Auditoria completa ronda 4 (tras redeploy)
3. Verificacion global (seguridad, funcional, estetica, repo)
4. Auditoria de Ajustes
5. UX de la pantalla Hoy
6. Anexo: notificaciones por Telegram
7. Capitulo: Plan de hoy y Planifica tu dia
8. Capitulo Q: captura en lenguaje natural (fechas y horas). Amplia H-02 y sustituye el alcance estrecho de NT-03

---

# PARTE 1

# Auditoría consolidada + revisión UX del detalle de tarea y del sidebar (tick-tack-done)

Fecha: 19 oct 2026, 15:00-15:25 (Madrid). Auditor: Instinct. Documento para Cursor: cada bloque trae archivo, problema y arreglo.
Todos los valores de diseño son decisiones propias de la app. TickTick se usó solo como referencia de comportamiento.
Capturas: carpeta `capturas/` del zip adjunto, por número (01-35 son de tick-tack-done y de la otra app; ver `capturas/NN-*.png`).

---

## 0. Commits

- Desplegado: `GET /api/v1/health` devuelve `{"status":"ok","commit":"d87e3fa"}` (leído a las 15:17).
- `main` comparado: `51dd55558cbf55d639e7002d70a8a134b38aa796` (19 oct 14:50, "fix(deploy): let nginx drop privileges in the web container (#37)").
- Diferencia entre ambos: solo `deploy/production/docker-compose.yml` (+4 líneas). Todo lo que se revisó en código es igual en producción y en main.

## 1. Resumen y prioridades

Lo que más duele en el detalle de tarea (orden de trabajo sugerido):

1. **P0 Errores crudos en inglés** ("a repeating task needs a due_date") y recordatorio con ISO crudo ("-PT5M"). El popover de fecha deja llegar al error.
2. **P0 Etiquetas**: el selector mide 1863 px (56 etiquetas, sin límite de alto), se sale del viewport y rompe el layout de toda la página. Los chips tienen borde `outset` por defecto (aspecto de 1998). No se puede crear etiqueta desde el selector.
3. **P0 Checklist roto**: sin estilos, checkboxes a distinta sangría, sin editar, borrar ni reordenar.
4. **P0 Botones muertos o engañosos**: "T" (formato) abre un popover vacío; "Comentarios" escribe en la nota con `> `; "Fijar" no da ninguna señal; "Adjuntar" no muestra nada y falla en silencio en mis pruebas.
5. **P1 Panel**: sin redimensionar, selector de lista escondido abajo, nota sin formato, Esc cierra el panel pero deja popovers abiertos.
6. **P1 Foco (pomodoro)**: sale a otra pantalla sin mostrar la tarea, sin indicador de temporizador en marcha, sin aviso por Telegram.
7. **P1 Sidebar**: Foco, Matriz, Panel, Informes y Revisión viven bajo un botón "Más"; faltan Won't Do (No haré), Resumen, Cuenta atrás, carpetas de listas y puntos de color en etiquetas.

Respuestas a las dudas que quedaban abiertas:

- **¿Hay integración con Telegram?** Sí, pero solo para capturar y consultar tareas (bot con comandos /capturar /hoy /manana /semana /lista /nuevalista /hecho; `apps/api/src/modules/integrations/telegram-bot.service.ts`) y para entregar recordatorios (`apps/api/src/scheduler/reminder.transport.ts`, usa `TELEGRAM_BOT_TOKEN` y `telegramChatId`). **No hay aviso de Telegram al iniciar o terminar un foco.** Existen los eventos `focus.session_started/finished/aborted` (`events/domain-events.ts`), pero ningún suscriptor envía mensaje. El motor de automatizaciones admite acción `channel: 'telegram'` (`automations.controller.ts:185`), así que se puede montar sobre esos eventos (ver 3.13). Recordatorio: las Automatizaciones no se pueden crear desde la UI (auditoría de Ajustes, P1).
- **¿Dónde se suben los adjuntos y es seguro?** Ver 3.12: disco del servidor, volumen Docker `attachments` montado en `/data/attachments`, no en Postgres ni en un bucket. Postura de seguridad razonable (auth por usuario, tipo por bytes, nombre saneado), con 4 mejoras pendientes.

---

## 2. Hallazgos consolidados de hoy (sin rehacer)

### 2.1 Seguridad (ronda 4, `d87e3fa`)

Corregidos y verificados en producción: S-01 (límite de login), S-06 (swagger cerrado), S-07 (SSRF webhooks e iCal), S-12 (dotfiles), S-15 (escalada de PAT), S-16 sesiones (403 para PAT `tasks:read`), S-19 (500 en validación), MCP 401 sin token. CORS cerrado.

Abiertos:

| ID           | Sev.  | Qué                                                                                                                                                                       | Arreglo                                                                                                                                                                                                                                                                    |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-05         | media | El HTML de la web no trae CSP, Permissions-Policy ni COOP; HSTS sin `preload`. El repo los tiene en `deploy/production/todo.caddy`, pero el Caddy del host no los aplica. | `apps/web/nginx.conf`: `add_header ... always` en `server` y en cada `location` que ya use `add_header` (o `include security-headers.conf`). Probar la CSP primero en Report-Only (hay service worker y Web Push). Comprobar con `curl -sI https://todo.reflexionia.com/`. |
| S-22 (nuevo) | media | `/api/v1/sync` filtra a un PAT `tasks:read`, a partir de la página 4, eventos de sesión, token, webhook, calendario, hábito, etc.                                         | `apps/api/src/modules/sync/sync.service.ts`: `eventTypeFilter` devuelve un `OR` y el cursor lo pisa. Combinar con `AND: [filtroTipo, cursor]`. Test: PAT mínimo recorriendo todas las páginas solo ve `task.*` y `checklist_item.*`.                                       |

Repo público (pendiente de limpieza): spec de seguridad commiteada con IP `<SERVER_IP>`, nombre de clave SSH y app vecina; menciones a TickTick en docs/spec; email personal en 152 commits; `deploy.sh:14`.

### 2.2 Restos de UI de la ronda 4

Kanban con fecha en inglés ("Sep 2"); campo "Límite de la columna" suelto; error de WIP desplaza columnas; "No hay calendarios externos" sin estilo; botones nativos grises en Papelera (visto otra vez hoy, `capturas/34-papelera.png`); contadores de etiquetas desfasados (personal 14 vs 13, capturada 8 vs 5, casa 6 vs 5); cabecera de calendario; chip del mes sin hora.

### 2.3 Auditoría de Ajustes (resumen del orden de prioridad)

- P1: Automatizaciones no se pueden crear ("No se ha podido completar."); Webhooks sin borrar/pausar en UI (el `DELETE` existe en `webhooks.controller.ts:231`); feeds .ics sin listar ni revocar.
- P2: Plugins vacío; avisos del navegador sin botón de permiso; Integraciones con Drive "Disponible" estando Google sin conectar y Telegram/Drive sin botón; sin cambio de contraseña; ajustes de apariencia solo en localStorage.
- P3: 2FA sin QR ni cancelar; fechas US en Tokens/MCP (`TokensPage.tsx:465`); hora 12 h; acento sin nombres accesibles; Compartir con permiso "Escribir" por defecto; móvil con barra inferior tapando contenido y sin botón atrás; sin recordatorio por defecto.

### 2.4 Pantalla Hoy (doc UX de hoy)

P0: hora de la tarea no aparece en la lista; "Vencidas" antes que "Alta"; panel de detalle básico; "Hábitos de hoy" vacío. P1: quick-add sin feedback de parseo; columna meta al 42%; sin animación al completar y dos estilos de toast; cabecera de grupo sin chevron. P2: "Plan de hoy" fijo; actividad en inglés crudo ("created"); botones sueltos al final del panel; padding inferior en móvil. Este documento amplía el punto 3 (panel).

---

## 3. Panel de detalle de tarea: revisión de arriba abajo

Método: app en vivo (1280x713), tarea de prueba `ZZ TEST detalle panel` en Bandeja, más lectura del código. El panel mide 384 px (`aside.detail-panel`, `shell/shell.css:39-53`, `components/ui.css`, `features/today/today.css:698-770`). Se abre al hacer clic en el título de la fila; el botón "Abrir detalle" de la fila abre un menú contextual, no el panel (confuso, ver 3.15).

Wireframe actual (de arriba abajo):

```
+--------------------------------------------+
| [o]  Sin fecha        Guardado        [flag]|  cabecera
+--------------------------------------------+
| Titulo de la tarea (textarea, grip nativo) |
| Nota (textarea 96 px, grip nativo)         |
|   "Escribe algo o / para comandos"         |
|     [ ] Item 1        (checkboxes a        |
|  [ ] Item 2 largo...   distinta sangria)   |
|  [ + Anadir item                        ]  |
|  (casa x) (+)                              |
|                                            |
|                                            |
+--------------------------------------------+
| [Bandeja de entrada]        [T] [chat] [...]|  pie
+--------------------------------------------+
```

### 3.1 Estructura general y cabecera

**Estado actual.** "Guardado" aparece pegado en la cabecera y sigue visible aunque haya un error. Los errores en línea empujan el contenido unos 50 px. La bandera de prioridad no tiene tooltip ni `title`. Foco nativo azul del navegador en el título. La fecha dice "Sin fecha" como texto plano sin icono. Capturas: `01-panel-inicial.png`.

**Problema.** Sin jerarquía: fecha, estado y prioridad compiten en una línea; no hay indicación de la lista ni de subtareas en la cabecera.

**Diseño propuesto.**

```
+--------------------------------------------+
| [o]  [cal] Hoy 18:00  [alarm]    [flag] [x]|
+--------------------------------------------+
```

- Estado de guardado: pequeño icono/texto gris a la derecha de la lista, solo mientras guarda ("Guardando...") y un check 1,5 s al terminar. Error: banner propio (ver 3.2).
- Fecha como botón con icono de calendario, color acento si es hoy, rojo si vencida; hora visible; icono de campana si hay recordatorio; icono de repetición si repite.
- Botón de cerrar (x) siempre visible en escritorio.
- `title`/`aria-label` en cada icono ("Prioridad: Alta").

**Archivos.** `features/tasks/DetailHeader.tsx`, `features/tasks/TaskDetail.tsx` (estado `save`/`error`), `shell/shell.css`.

### 3.2 Selector de fecha y errores crudos

**Estado actual** (`components/DatePopover.tsx`, `features/tasks/DueField.tsx`; capturas `02` a `05` (`05-error-crudo-due_date.png` es el error)):

- Popover de 260 px anclado al borde derecho; tapa el título.
- Pestañas "Fecha | Duración" son botones nativos grises 3D.
- Atajos "Hoy / Mañana / +7 días / Sin fecha" saltan a 2 líneas.
- Semana en L M X J V S D; hoy y seleccionado se ven igual.
- Fila "Hora" muestra la etiqueta **"Sin fecha"** cuando no hay hora (etiqueta equivocada). Input de hora nativo 12 h ("09:00 AM").
- Fila "Recordatorio" muestra el ISO crudo **"-PT5M"**. El selector solo ofrece Sin recordatorio, 30 min, 1 h, 1 día antes: el valor actual (5 min) ni existe como opción.
- "Repetir" solo ofrece No se repite, Cada día, Cada semana, Cada mes. Sin anual, laborables ni personalizado, sin fecha de fin.
- Cada sublista se despliega en línea y agranda el popover.
- "Quitar fecha" borra fecha, recordatorio y repetición al instante y sin aviso.
- **Error reproducido:** sin fecha, Repetir > Cada semana > OK. El panel muestra el texto inglés de la API **"a repeating task needs a due_date"**, sin estilo, pegado al borde izquierdo, sin icono ni forma de resolverlo. Origen: `apps/api/src/modules/tasks/tasks.service.ts:2105`.
- Una tarea nueva creada desde Hoy ya trae recordatorio `-PT5M` mostrado crudo, y en la lista sale como "Hoy" rojo (día completo mostrado como vencido) mientras el panel lo pinta azul.

**Diseño propuesto.**

```
+---------------------------------+
|  [ Fecha ]  [ Duracion ]        |   pestañas tipo segmented control
|  [Hoy] [Manana] [+7d] [Sin f.]  |   una sola linea, scroll horizontal si no cabe
|  <  octubre 2026  >             |
|  L  M  X  J  V  S  D            |
|  ...  hoy = anillo, elegido = relleno
|  ------------------------------ |
|  (clock) Hora        18:00 [x]  |   24 h, boton para quitar
|  (bell)  Recordatorio 5 min antes >
|  (repeat) Repetir    Cada semana >
|  ------------------------------ |
|  [Quitar fecha]        [ OK ]   |
+---------------------------------+
```

Reglas:

1. **Imposible llegar al error:** si el usuario elige un Repetir sin fecha, poner fecha = hoy automáticamente y avisarlo ("Fecha puesta a hoy"). Alternativa: deshabilitar Repetir mientras no haya fecha, con texto de ayuda.
2. Mapear todos los códigos de error de la API a mensajes en `i18n/es.ts`/`en.ts` (`repeat_requires_due_date`, etc.). Nunca mostrar `error.message` crudo. Banner con icono, fondo suave, botón cerrar, `role="alert"`, y que no desplace el contenido (posición sobre el pie del panel).
3. Recordatorio: lista completa (Al vencer, 5 min, 15 min, 30 min, 1 h, 1 día) construida desde `REMINDER_VALUES` (`features/places/Places.tsx:1811` ya tiene `-PT0M,-PT5M,-PT15M,-PT30M,-PT1H,-P1D`). `humanTrigger` (`TaskDetail.tsx:614`) solo traduce 30 min, 1 h y 1 día: añadir 0, 5 y 15 min y un fallback legible ("5 min antes") para cualquier ISO.
4. Etiqueta de la fila Hora: "Sin hora" (no "Sin fecha").
5. "Quitar fecha": con deshacer (toast `UndoToast.tsx`) en vez de confirmación.
6. Todo-el-día vs vencida: una tarea de hoy sin hora nunca se pinta roja.
7. Repetición: añadir anual, laborables, "cada N días/semanas", fin (nunca / fecha / N veces). Verificar con el backend (`repeat_from`).
8. Popover con `max-height: calc(100dvh - 24px)`, scroll interno y colocación que no tape el título (se abre debajo de la cabecera, ancho = panel).
9. Hora en 24 h (`<input type="time">` con `lang`/`step`) o selector propio.

**Archivos.** `components/DatePopover.tsx`, `features/tasks/DueField.tsx`, `features/tasks/TaskDetail.tsx` (L614), `components/Popover.tsx`, `i18n/*.ts`, `apps/api/src/modules/tasks/tasks.service.ts:2105` (código de error estable además del texto).

### 3.3 Prioridad (bandera)

**Estado actual.** El menú funciona (banderas de color, check en la activa, 204 px). Tras elegir Alta se enrojece el check de la tarea y la bandera. Sin tooltip. Captura `06-prioridad-alta.png`.
**Mejora.** Tooltip "Prioridad: Alta"; atajos de teclado visibles en el menú (1-4); la bandera "Ninguna" en gris con contorno; que el popover muestre el nombre junto al icono. Archivos: `components/PriorityMenu.tsx`, `PriorityCheck.tsx`.

### 3.4 Título con barra de scroll vertical

**Estado actual.** `<textarea rows=1 style="overflow-y:auto; resize:vertical">` con grip nativo. Crece sin barra en mi prueba, pero el `overflow-y:auto` permite barra en cuanto se pasa de alto. Foco azul nativo.
**Arreglo.** `overflow:hidden; resize:none;` y autoajuste a `scrollHeight` en cada `input` (y al abrir la tarea). Sin outline nativo: foco con subrayado sutil. Enter confirma (ya está), Shift+Enter no inserta salto (el título es de una línea lógica, el wrap es solo visual). Archivos: `features/tasks/DetailHeader.tsx` o `DetailBody.tsx`, `ui.css`.

### 3.5 Panel redimensionable por arrastre

**Estado actual.** Ancho fijo 384 px, sin tirador ni separador.
**Diseño.**

```
 lista            |#|  panel de detalle
                  |#|  <- barra de 6 px, cursor col-resize, role="separator" aria-orientation="vertical"
```

- Ancho mínimo 320, máximo 640 (o 50 % del viewport). Guardar en `localStorage` (`tick-tack-done.detail-width`) y aplicarlo con una variable CSS `--detail-w` en `.shell[data-detail='open']`.
- Pointer events con `setPointerCapture`; doble clic restablece 384; teclado: flechas izquierda/derecha cambian 16 px cuando el separador tiene foco.
- Solo escritorio (>= 700 px); en móvil el panel ya es pantalla completa.
  **Archivos.** `shell/AppShell.tsx`, `shell/shell.css` (L39-53, L411-470), nuevo `shell/DetailResizer.tsx`.

### 3.6 Nota: texto plano sin formato

**Estado actual.** `textarea` de 96 px con grip nativo y placeholder "Escribe algo o / para comandos". El `/` no abre nada (promesa falsa). No se renderiza Markdown.
**Diseño.** Editor de bloques ligero (Tiptap o Lexical, con `StarterKit`): negrita, cursiva, tachado, código, lista, lista numerada, casillas, cita y enlace; atajos Markdown (`**`, `-`, `[]`, `#`). Barra flotante al seleccionar texto. Guardar como Markdown en `content` (el backend ya guarda texto), de modo que lo ya escrito sigue siendo válido.

- Menú `/` real con: Título, Lista, Casillas, Cita, Código, Línea. Si no se implementa en esta ronda, **quitar el texto "o / para comandos"**.
- Altura automática con mínimo de 3 líneas y sin grip nativo.
- Enlaces detectados y clicables; imágenes pegadas suben como adjunto (ver 3.12).
  **Archivos.** `features/tasks/DetailBody.tsx`, `TaskDetail.tsx` (`save.mutate({content})`), nuevo `features/tasks/NoteEditor.tsx`.

### 3.7 Checklist: layout roto

**Estado actual** (`ul.detail-check > li > label > input[type=checkbox] + span`, `today.css:745-760`, `ui.css:414`; capturas `01-panel-inicial.png`, `11-checklist.png`). Los checkboxes quedan a distinta sangría, los textos largos se alinean al centro y se parten con sangría rara, no hay editar, borrar, arrastrar ni convertir en subtarea. El encabezado "Checklist" se oculta cuando está vacío. En la fila de la lista, "0/2" queda pegado al nombre de la lista.
**Diseño.**

```
 Checklist  1/3                         [barra de progreso fina]
 [ ] Primer item                         [::]  hover: arrastrar
 [x] Segundo item con texto largo que    [..]  hover: menu (convertir en tarea, borrar)
     se ajusta con sangria colgante
 [+] Anadir item   (Enter crea otro, Backspace vacio borra)
```

- Grid de 2 columnas: `20px 1fr`; checkbox propio con el mismo componente del check de tarea; texto `align-self:start`, `overflow-wrap:anywhere`.
- Edición en línea (clic en el texto), Enter crea el siguiente, Supr/Backspace en vacío borra, arrastrar para reordenar, menú por ítem (Borrar, Convertir en tarea).
- Completados: tachado y gris, contador "1/3" junto al título y barra de progreso.
- Mostrar siempre el campo "Añadir ítem" con el encabezado.
- En la fila de lista: "0/2" con icono de checklist y separación de 6 px de la lista.
  **Archivos.** `features/tasks/DetailBody.tsx`, `today.css` (`.detail-check`), `features/today/TaskGroup.tsx` (contador de fila).

### 3.8 Etiquetas: chips de 1998 y "+" mediocre

**Estado actual.** Capturas `08-tag-picker.png`, `09-tag-picker-crear.png`, `10-tag-chip.png`, `18-menu-etiquetas.png`.

- El chip (`.ui-tag`, `ui.css:69`) es un `<button>` y el navegador le pone `border: 2px outset`: de ahí el aspecto de 1998. Falta `border:0`. La × está pegada al texto.
- El "+" (`.tag-add`, `today.css:701`) es un círculo de 22 px con borde de 1 px, sin etiqueta visible.
- El selector (`components/TagPicker.tsx`) mide **1863 px** de alto con 56 etiquetas, `overflow: visible`, sin máximo; se sale del viewport y desplaza toda la página: el sidebar queda cortado con espacio en blanco debajo. Casillas centradas, pills recortados a la derecha ("10mi", "audi"). No existe "Crear etiqueta" (Enter no hace nada). La búsqueda sí filtra.
  **Diseño.**

```
 (# casa) (# curro) (# 15min)  [+ Etiqueta]      chips con punto de color, sin borde,
                                                  radio 6, alto 24, padding 0 8
 +-----------------------------+
 | (lupa) Buscar o crear...    |  max-height 280, scroll interno
 | [x] * casa              6   |  punto de color + nombre + contador
 | [ ] * curro             4   |
 | + Crear "zz-nueva"          |  aparece si no hay coincidencia exacta; Enter la crea
 +-----------------------------+
```

- Chip: `border:0; background: color-mix(...)`; × aparece al pasar el ratón con 4 px de separación.
- "+ Etiqueta" como botón de texto con icono, no círculo.
- Popover: `max-height: min(320px, calc(100dvh - 32px)); overflow:auto`, sin `overflow:visible`, posición contenida en el viewport (Popover calcula `top` con `getBoundingClientRect` y se voltea si no cabe).
- Etiquetas ordenadas por uso reciente y las seleccionadas arriba.
- El buscador lateral de etiquetas (`Sidebar.tsx`) es un input nativo con borde: darle el mismo estilo que el resto.
  **Archivos.** `components/ui.css`, `features/today/today.css`, `components/TagPicker.tsx`, `components/Popover.tsx`, `shell/Sidebar.tsx` (L386-455).

### 3.9 Selector de lista escondido abajo

**Estado actual.** Botón nativo "Bandeja de entrada" (icono pegado al texto) en la fila inferior (y ≈ 689), junto a T, comentarios y ⋯. Fácil de no ver; captura `01`.
**Diseño.** Mover a la cabecera, a la izquierda: `[icono lista] Bandeja de entrada v` como breadcrumb, con buscador al abrir y las listas agrupadas por carpeta. El pie queda solo con acciones secundarias.
**Archivos.** `features/tasks/DetailFooter.tsx`, `DetailHeader.tsx`.

### 3.10 Botón "T" (formato) y comentarios

**"T".** En vivo abre un popover blanco de unos 370 px de alto con solo el título "Formato" y ningún control (captura `12-formato-T.png`). En el código (`TaskDetail.tsx:362-376`) el único botón añade `**Contenido**` al final de la nota: no formatea nada. Arreglo: eliminar el botón mientras no haya editor; con el editor de 3.6, la "T" despliega una barra con negrita, cursiva, tachado, lista, casillas, enlace y código.

**Comentarios.** En vivo (capturas `13`, `14`) abre un campo "Añadir comentario" sin botón de enviar; Enter **añade el texto a la nota** como `> texto`. No hay lista, autor ni hora. Ya existen `Comment` en Prisma (`schema.prisma`, modelo `Comment`) y `collaboration.controller.ts`, así que el modelo está en backend.
**Diseño.**

```
 Comentarios (2)
 [avatar] Pablo · hace 5 min
          Texto del comentario                 [editar] [borrar]
 [avatar] [ Escribe un comentario...   ] [Enviar]
```

Usar el endpoint de comentarios, listar con autor y fecha relativa, Enter envía, Shift+Enter salta línea. Si la tarea no se comparte, mostrar solo "Notas" y ocultar Comentarios. **Nunca escribir comentarios dentro de la nota.**
**Archivos.** `features/tasks/TaskDetail.tsx`, `DetailFooter.tsx`, `apps/api/src/modules/collaboration/collaboration.controller.ts`, `packages/sdk/src/resources.ts`.

### 3.11 Menú ⋯, submenú de etiquetas y Fijar

**Estado actual** (`features/tasks/DetailMenu.tsx`, capturas `15` a `18`). 15 ítems de solo texto, sin iconos ni atajos: Añadir subtarea, Vincular tarea padre, Fijar, Descartar, Etiquetas, Adjuntar, Iniciar foco, Actividad de la tarea, Guardar como plantilla, Duplicar, Copiar enlace, Convertir en nota, Exportar, Imprimir y Borrar (rojo, tras un separador). "Etiquetas" abre el mismo selector de 1863 px (3.8), sobre el panel y tapando el título. "Borrar" **borra sin confirmar (no llegué a ver un toast de deshacer en la captura tomada)**; desde Papelera, "Eliminar" borra para siempre sin confirmación (probado hoy con mi tarea de prueba).
**Fijar.** El panel no cambia, la fila no se marca ni se mueve; solo cambia la etiqueta del menú a "Quitar fijado". No hay icono de chincheta en la lista ni orden por fijadas.
**Diseño.**

```
 +--------------------------------+
 | (pin)   Fijar arriba      P    |
 | (sub)   Anadir subtarea        |
 | (link)  Vincular tarea padre   |
 | (tag)   Etiquetas           >  |
 | (clip)  Adjuntar               |
 | (timer) Iniciar foco           |
 |--------------------------------|
 | (copy)  Duplicar               |
 | (link)  Copiar enlace          |
 | (tpl)   Guardar como plantilla |
 | (note)  Convertir en nota      |
 | (exp)   Exportar / Imprimir    |
 | (log)   Actividad              |
 |--------------------------------|
 | (trash) Borrar (rojo)          |
 +--------------------------------+
```

- Agrupar en 4 bloques con separadores, iconos de 16 px y atajos a la derecha.
- Fijar: icono de chincheta en la cabecera del panel y en la fila de la lista, las fijadas suben al principio de su grupo, toast "Tarea fijada" con Deshacer. Si no se va a usar, quitarlo.
- Borrar: toast con Deshacer (ya existe `UndoToast.tsx`); en Papelera, "Eliminar" con confirmación en línea y "Restaurar" como acción principal, ambos con el estilo de botón de la app (`Button`), no el nativo.
- "Etiquetas": submenú lateral con el selector de 3.8, con alto limitado.
- "Descartar" se llama distinto a "Borrar" y no está claro qué hace: renombrar o quitar.
  **Archivos.** `features/tasks/DetailMenu.tsx`, `features/today/TaskGroup.tsx`, `components/UndoToast.tsx`, Papelera (`features/views/*`).

### 3.12 Adjuntos: dónde se suben y seguridad

**Estado actual en la UI.** El `<input type="file" class="sr-only" aria-label="Adjuntar">` solo se dispara desde ⋯ > Adjuntar (`TaskDetail.tsx:545-565`). No hay zona de soltar, lista, miniaturas, progreso ni errores. Solo aparece un contador "N adjuntos" cuando hay (`DetailBody.tsx:181`), sin nombres ni enlaces. En el handler no hay `.catch`: cualquier fallo es silencioso. En mi prueba, subir un `.txt` de 16 bytes con el input (dos intentos, uno por la herramienta de subida y otro simulando el evento `change` con un `File`) **no creó ningún adjunto** (`GET /tasks/:id/attachments` devolvió `items: []`) y la UI no mostró nada. No puedo confirmar si el fallo está en el cliente o en el servidor; conviene reproducirlo a mano en un navegador local y mirar la pestaña Red. En cualquier caso: falta feedback.

**Dónde se guardan (código).**

- Archivos en disco: `ATTACHMENT_DIR` (`/data/attachments` en producción, volumen Docker `attachments`, `deploy/production/docker-compose.yml:22-26,109`). Ruta `<ownerId>/<uuid>` sin extensión (`attachment-storage.ts`). Metadatos en la tabla `attachments` de Postgres (`schema.prisma`, modelo `Attachment`: `fileName`, `mimeType`, `byteSize`, `storageKey`, `thumbnailKey`, `deletedAt`, campos `driveFileId/driveUrl` sin uso aparente).
- Copia de seguridad: `scripts/backup.sh` empaqueta el volumen en `attachments.tar.gz` junto con el `pg_dump` y lo sube fuera de la máquina (Drive), retención 30 días.

**Postura de seguridad.**

| Punto                     | Estado                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticación y propiedad | Bien. Subida, listado, descarga, miniatura y borrado exigen scope (`tasks:write`/`tasks:read`) y buscan `ownerId = user.id` y `taskId` (`tasks.service.ts:1076-1230`). No hay URL pública ni directorio servido por nginx. |
| Tipo de archivo           | Bien. El tipo se decide por los bytes (`sniffMime`): JPEG, PNG, GIF, WEBP, PDF, DOCX/XLSX/PPTX y texto plano; rechaza HTML, SVG, XML y script. El tipo del cliente se ignora.                                              |
| Nombre                    | Bien. `safeFileName`: `basename`, solo `\w . - espacio ( ) [ ]`, máximo 180. Nunca se usa en la ruta del disco.                                                                                                            |
| Ruta                      | Bien. `STORAGE_KEY` exige `uuid/uuid` y `resolveAttachment` comprueba que quede dentro de la raíz.                                                                                                                         |
| Descarga                  | Bien. `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Type` del tipo detectado. Las miniaturas se sirven `inline` solo para imágenes ráster.                                                |
| Límites                   | 25 MB por archivo, 50 por tarea, 2 GB por usuario.                                                                                                                                                                         |
| Cifrado en reposo         | **No.** Archivos en claro en el volumen. Depende del cifrado del disco del host.                                                                                                                                           |
| Antivirus                 | **No** hay análisis (no hay ClamAV ni similar).                                                                                                                                                                            |
| Miniatura                 | **Es una copia del original**, no una reducción (`writeAttachment(user.id, file.buffer)` dos veces): duplica espacio y entrega el original en tamaño completo como "miniatura" (hasta 1,5 MB).                             |
| Borrado                   | `deletedAt` + borra solo el archivo principal; **no borra el archivo de la miniatura** (`deleteAttachment`) y el borrado de tarea con `onDelete: Cascade` borra filas pero no archivos: quedan huérfanos en disco.         |
| Texto plano               | Cualquier texto sin NUL pasa como `text/plain` (también scripts o .html sin cabecera); se sirve como adjunto con nosniff, así que no ejecuta, pero un `.txt` puede ser un HTML renombrado.                                 |
| UI                        | Sin lista, sin descarga visible, sin aviso al exceder 25 MB salvo `tooLarge` en `setError`.                                                                                                                                |

**Arreglos.**

1. UI de adjuntos en el panel: sección "Adjuntos (N)" con miniatura/icono por tipo, nombre, tamaño, descargar y borrar; zona de arrastrar y soltar y pegar imagen; barra de progreso; errores con mensaje propio (tipo no permitido, demasiado grande, cuota). `uploadAttachment(...).catch(...)` obligatorio. Archivos: nuevo `features/tasks/AttachmentList.tsx`, `TaskDetail.tsx:559`.
2. Generar miniatura real (reducir a 256 px con `sharp`) y borrarla junto al adjunto. Archivos: `tasks.service.ts` (`addAttachment`, `deleteAttachment`).
3. Limpieza de huérfanos: tarea programada que borre del disco los `storageKey`/`thumbnailKey` con `deletedAt` o cuyas tareas ya no existen; o borrar archivos al purgar la Papelera.
4. Cifrado en reposo del volumen del host, y opcionalmente escaneo con ClamAV antes de aceptar.
5. Cabecera `Content-Security-Policy: sandbox` en las descargas (defensa extra).

### 3.13 Pomodoro / Foco

**Estado actual** (código `features/product/ProductPages.tsx:202-330`, `features/tasks/TaskDetail.tsx:495`; capturas `19-foco-tras-iniciar.png`, `20-foco-corriendo-en-hoy.png`).

- ⋯ > "Iniciar foco" llama `startFocus({task_id})` y **navega a `/focus`**: se sale de la lista y del panel.
- La pantalla Foco muestra título "Foco", una frase ("La sesión vive en el servidor. Si cierras la pestaña, el aviso sigue al volver."), racha/pomodoros/minutos, un reloj 24:57 y botones Terminar/Cancelar. **No muestra qué tarea se está enfocando** (aunque `task_id` se guarda), no hay enlace de vuelta a la tarea ni selector de tarea.
- Mientras corre, en Hoy no hay ningún indicador: ni en el rail, ni en el sidebar, ni en el título de la pestaña (`document.title` queda "tick-tack-done"; solo se cambia al terminar). Captura `20-foco-corriendo-en-hoy.png`.
- Foco no tiene icono en el rail (`shell/IconRail.tsx`: Ajustes, Hoy, Calendario, Buscar, Hábitos, Nueva tarea); está bajo el botón "Más" del sidebar (`shell/Sidebar.tsx:482-509`).
- Duraciones fijas 15/25/50 que se guardan en ajustes al pulsar (sin pausa, sin descanso corto/largo).
- No hay aviso de Telegram ni push al iniciar/terminar (solo `new Notification` del navegador al acabar, si hay permiso).
- Al terminar o cancelar, la pantalla queda igual sin resumen.
- Referencia en el otro producto (verificado hoy con la sesión en curso de la cuenta de Pablo): la pantalla de pomodoro muestra la tarea enfocada con enlace, el anillo de progreso, Pausar, la línea de tiempo y notas de foco; **el icono de pomodoro del rail se convierte en un anillo de progreso mientras corre** (`capturas/32-tt-focus.png`, `32-tt-countdown.png`), igual que la campana lleva una insignia roja con número.

**Diseño propuesto.**

```
 Panel de tarea:   [ Iniciar foco ]  -> abre un MINI temporizador dentro del propio panel (25:00) con Pausar/Terminar
 Rail:             icono de foco con anillo de progreso y minutos restantes mientras corre (tooltip "Foco: 12:31 · Tarea X")
 Pantalla /focus:  tarea enfocada arriba (titulo + enlace), reloj grande, Pausar/Terminar/Cancelar, nota de foco,
                   selector de tarea si se entra sin tarea, 15/25/50 + descanso 5/15
 Pestaña:          document.title = "12:31 · Tarea X" mientras corre
```

- Estado global de la sesión activa (hook `useActiveFocus` con TanStack Query `['focus-sessions']`, sondeo cada 15 s y reloj local) en `shell/`. Mostrarlo en el rail (anillo SVG con `stroke-dashoffset`), en la cabecera del panel de la tarea enfocada y en `document.title`.
- No sacar al usuario de la vista: dejar "Iniciar foco" iniciar la sesión y mostrar el mini temporizador en el panel; `/focus` queda para ver la sesión grande.
- **Telegram**: suscribirse a `focus.session_started` y `focus.session_finished|aborted` (`events/domain-events.ts`) y mandar mensaje con `reminder.transport.ts`/`TelegramApi` al `telegramChatId` del usuario: "Foco iniciado: <tarea> (25 min)" y "Foco terminado: <tarea> · 25 min". Respetar un ajuste "Avisos de foco por Telegram" (por defecto activado solo si Telegram está vinculado). Alternativa sin código nuevo: acción `channel:'telegram'` en una regla de Automatizaciones, pero hoy esas no se pueden crear en la UI.
- Cierre automático ya existe (`FocusPage` termina la sesión al llegar a 0); moverlo al hook global para que también ocurra fuera de `/focus` (hoy solo lo hace la pantalla Foco, así que con otra pestaña abierta la sesión queda zombie hasta volver).
  **Archivos.** `features/product/ProductPages.tsx` (`FocusPage`), `features/tasks/TaskDetail.tsx:495`, `shell/IconRail.tsx`, nuevo `shell/useActiveFocus.ts`, `apps/api/src/modules/focus/focus.controller.ts`, `apps/api/src/modules/integrations/telegram-api.ts`, `apps/api/src/events/domain-events.ts`.

### 3.14 Más hallazgos (fuera de la lista de Pablo)

1. **Esc** cierra todo el panel de detalle y deja abiertos los popovers (fecha, prioridad, etiquetas). Debe cerrar primero el popover abierto y solo después el panel. `shell/GlobalKeys.tsx`, `components/Popover.tsx:22`.
2. **Los popovers rompen el shell**: al abrirse empujan el scroll de toda la página, el sidebar queda cortado y aparece espacio en blanco. Todo popover necesita `max-height` y posición contenida en el viewport (`components/Popover.tsx`, `ui.css`). Capturas `08`, `18`.
3. Los botones nativos de la app (lista inferior, Papelera, pestañas del popover de fecha, tarea ⋯) usan el estilo del navegador: gris con borde 3D. Usar el componente `Button` en todos.
4. Actividad ("Actividad de la tarea") muestra texto crudo en inglés ("Tú · created · hace 1 minuto"). Traducir las acciones (`TaskDetail.tsx` ~L517).
5. **Accesibilidad**: bandera sin nombre accesible, popovers sin `role="dialog"` y sin trampa de foco, checklist sin etiquetas por ítem, mensajes de error sin `role="alert"`, foco nativo inconsistente.
6. Subtareas: "Añadir subtarea" no muestra la lista de subtareas en el panel con claridad (datos en `task.subtasks`, `TaskDetail.tsx:291`). Mostrar bloque "Subtareas" con check, título editable y progreso.
7. Móvil: el panel pasa a pantalla completa (`.detail-back`); comprobar que Guardado, el pie y los popovers cabrán en 390 px y que la barra inferior no tape el pie.
8. Fila de lista: "Abrir detalle" abre un menú contextual en vez del panel; renombrar a "Más acciones" y dejar que clic en la fila abra el detalle.
9. Pestaña "Duración" del popover de fecha: sin ejemplo de uso en el panel (no se ve la duración en la cabecera).
10. "Guardar como plantilla" guarda en `localStorage` (`readTemplates`, `TaskDetail.tsx`), no en el servidor: las plantillas no se sincronizan entre dispositivos.
11. Sin contador de caracteres ni límites visibles en título (API) y nota.
12. Error de red: no hay estado de "sin conexión / reintentar" en el panel.

### 3.15 Wireframe final propuesto del panel

```
+--------------------------------------------------------+
| [Bandeja v]                 [pin] [bell] [flag]  [..] [x]|
| [o] [cal] Hoy 18:00  (repeat)                            |
+--------------------------------------------------------+
| Titulo de la tarea                                       |
| Nota con formato (editor, barra al seleccionar)          |
|                                                          |
| Checklist 1/3  =====-----                                |
|   [ ] item   [x] item   [+] anadir                       |
| Subtareas 0/2                                            |
| (# casa) (# 15min) [+ Etiqueta]                          |
| Adjuntos (1): [img] foto.png 120 KB   [descargar][x]     |
| Foco: [ 25:00  Iniciar ]                                 |
| Comentarios (2) ...                                      |
+--------------------------------------------------------+
| Creada hoy 15:02 · Actividad                      [T] [..]|
+--------------------------------------------------------+
```

---

## 4. Barra lateral izquierda: comparación elemento a elemento

Verificado navegando ambas apps hoy (`capturas/31-tt-sidebar-bottom.png`, `32-tt-*.png` y capturas de tick-tack-done `20`, `34`). Referencia: la otra app, como comportamiento. Las columnas de la derecha son decisiones propias para tick-tack-done.

### 4.1 Rail de iconos (columna azul)

| Elemento                                                        | Referencia                                                    | tick-tack-done                       | Decisión                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| Perfil/Ajustes (arriba)                                         | Avatar con insignia                                           | Avatar → Ajustes                     | OK                                                                                    |
| Tareas                                                          | Sí                                                            | Hoy                                  | OK (renombrar tooltip "Tareas")                                                       |
| Calendario                                                      | Sí                                                            | Sí                                   | OK                                                                                    |
| Matriz (Eisenhower)                                             | Icono propio en rail                                          | Solo bajo "Más" del sidebar          | **Añadir al rail**                                                                    |
| Pomodoro                                                        | Icono propio; **se vuelve anillo de progreso mientras corre** | Sin icono; bajo "Más"; sin indicador | **Añadir al rail con anillo** (3.13)                                                  |
| Hábitos                                                         | Icono propio                                                  | Sí                                   | OK                                                                                    |
| Búsqueda                                                        | Sí                                                            | Sí                                   | OK                                                                                    |
| Cuenta atrás                                                    | Sí                                                            | No existe                            | Opcional P3                                                                           |
| IA                                                              | Sí                                                            | No                                   | Fuera de alcance                                                                      |
| Sincronizar / Notificaciones (insignia roja con número) / Ayuda | Parte inferior del rail                                       | No hay campana ni insignia ni ayuda  | **Añadir campana con insignia** (recordatorios vencidos, invitaciones) y Ayuda/atajos |
| Nueva tarea (+)                                                 | No (está en la lista)                                         | Sí (+)                               | OK                                                                                    |

### 4.2 Listas inteligentes

| Elemento             | Referencia                                                | tick-tack-done                                                                | Diferencia / decisión                                             |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Todas                | Sí, arriba                                                | "Todas" (88)                                                                  | OK                                                                |
| Hoy                  | Sí                                                        | Sí (55)                                                                       | OK                                                                |
| Mañana               | Sí                                                        | Sí (0)                                                                        | OK                                                                |
| Próximos 7 días      | Sí                                                        | Sí                                                                            | OK                                                                |
| Asignadas a mí       | Sí                                                        | No                                                                            | P3 (solo si hay compartir de tareas)                              |
| Bandeja              | Sí                                                        | Sí (12)                                                                       | OK                                                                |
| Resumen              | Sí (editor con plantilla, filtros por fecha/lista/estado) | No existe en el sidebar (hay `/reports/weekly` y `/review/weekly` bajo "Más") | **Unificar**: una entrada "Resumen" que lleve a informes/revisión |
| Sin fecha            | No es lista fija                                          | Sí (28)                                                                       | Mantener                                                          |
| "Añadidas hace poco" | No                                                        | Sí, **truncada** ("Añadidas hace p…")                                         | Renombrar "Recientes"                                             |
| Completadas          | Al final del sidebar                                      | Entre las listas inteligentes                                                 | Mover al bloque inferior                                          |
| No haré (Won't Do)   | Sí, al final                                              | **No existe**                                                                 | **Añadir** estado "No haré" y su vista (distinto de borrar)       |
| Papelera             | Sí, al final                                              | Sí, con "Vaciar" y contador                                                   | OK, pero botones nativos y sin confirmar al eliminar              |

### 4.3 Bloques inferiores

| Elemento                                                          | Referencia                                                                                   | tick-tack-done                                                                                                  | Decisión                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Listas                                                            | Con **carpetas** plegables (Trabajo, Personal), listas archivadas, iconos por tipo, contador | Lista plana de ~22 listas con punto de color y contador                                                         | **Carpetas plegables** y "Archivadas"                                                           |
| Filtros                                                           | Lista de filtros guardados con icono                                                         | Bloque "Filtros" vacío ("Sin filtros") con "+"                                                                  | Crear al menos el flujo "Guardar búsqueda como filtro" (`/search`) y mostrar el vacío con ayuda |
| Etiquetas                                                         | Lista con **punto de color** y contador, nombres completos                                   | Buscador nativo de etiquetas, "Mostrar sin uso" y "Más", sin color visible en el sidebar, contadores desfasados | Estilar el buscador, mostrar color, arreglar contadores (2.2)                                   |
| Calendarios suscritos                                             | Bloque propio con contador                                                                   | Solo en Ajustes                                                                                                 | Mostrar en el sidebar cuando haya calendarios externos                                          |
| Pie del sidebar                                                   | Completadas / No haré / Papelera                                                             | Papelera + iconos tema, pantalla y colapsar (3 botones sin texto, sin tooltip)                                  | Añadir tooltips y `aria-label`                                                                  |
| "Más" (Matriz, Panel, Informes, Revisión, Foco, Hábitos, Ajustes) | No existe: son iconos de rail                                                                | Botón "Más" plegado al fondo del nav (`Sidebar.tsx:482-509`)                                                    | **Eliminar "Más"**: mover cada destino al rail o a una entrada visible                          |

### 4.4 Comportamiento

- Colapsar: ambos colapsan; el rail de tick-tack-done queda con un único botón abajo (captura `20`). OK.
- Arrastrar para reordenar listas: existe en tick-tack-done (`Sidebar.tsx` usa `DragEvent`); falta confirmar con carpetas.
- Contadores: en tick-tack-done "Todas 88" coincide con la suma real; los contadores de etiquetas no (2.2).
- Errores de scroll: con un popover abierto el sidebar se corta (3.14 punto 2).

---

## 5. Lista de tareas para Cursor (en orden)

1. `components/Popover.tsx` + `ui.css`: `max-height`, posición contenida, Esc cierra solo el popover. (Desbloquea 3.2, 3.8, 3.11.)
2. `ui.css` `.ui-tag` (`border:0`), `today.css` `.tag-add`, `TagPicker.tsx` (alto limitado, crear etiqueta, punto de color).
3. Errores: mapa de códigos de API a textos i18n, banner `role="alert"`, auto-fecha al elegir repetir sin fecha, `humanTrigger` completo, "Sin hora".
4. Checklist: grid de 2 columnas, edición, borrar, reordenar, contador y progreso.
5. Cabecera y pie del panel: lista a la cabecera, tooltips, Guardado discreto; quitar "T" y falso placeholder `/` hasta tener editor.
6. Comentarios reales (endpoint existente), sin escribir en la nota.
7. Menú ⋯ reagrupado con iconos; Fijar con chincheta y orden; Borrar y Papelera con deshacer/confirmación y `Button`.
8. Adjuntos: UI de lista, errores, miniatura real, limpieza de huérfanos; reproducir el fallo de subida en local.
9. Foco: tarea visible, mini temporizador, anillo en rail, título de pestaña, cierre global, avisos de Telegram.
10. Panel redimensionable (`DetailResizer`).
11. Editor de nota con formato.
12. Sidebar: quitar "Más", Matriz y Foco al rail, campana con insignia, No haré, carpetas, Resumen; corregir contadores de etiquetas.
13. Seguridad: S-05 (`apps/web/nginx.conf`), S-22 (`sync.service.ts`), limpieza del repo.
14. Restos de UI de 2.2 y de Ajustes (2.3).

Comprobación final por tarea: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, más prueba manual en 1280 px y 390 px con una tarea de 56 etiquetas, título largo, checklist de 10 ítems y un adjunto de 25 MB.

---

## 6. Datos de prueba y limpieza

- Creado en tick-tack-done: tarea `ZZ TEST detalle panel` (Bandeja) con prioridad Alta, etiqueta casa (existente), 2 ítems, nota "> ZZ TEST comentario uno" y fijada. **Eliminada**: desfijada, enviada a Papelera y borrada definitivamente desde Papelera. La Papelera volvió a 24 tareas (las tuyas); sigue en ella `ZZ TEST reunión` de una ronda anterior (no es de esta). No se creó ninguna etiqueta ni adjunto (la subida no se registró).
- Se inició y se canceló una sesión de foco de prueba sobre esa tarea (queda registrada como abortada en el historial de foco; puede haber movido ligeramente las estadísticas). Racha/pomodoros no cambian porque se canceló, no se terminó.
- En la otra app solo se navegó y se leyó (no se creó nada). Había un pomodoro en marcha de tu propia cuenta (iniciado 15:01); no se tocó.
- Sin llamadas destructivas de cuenta (nada de `DELETE /me`).

---

# PARTE 2

# Auditoría completa ronda 4: tick-tack-done (web en vivo + repo)

Fecha: 19 oct 2026, 14:37-14:48 (Madrid). Auditor: Instinct.

## 0. Commits

- Desplegado: `GET /api/v1/health` devuelve `d87e3fa`.
- `main` comparado: `d87e3faacc4b515906349e7634c7dbd310d57d43` (14:25, "run local development on node:26-alpine (#36)"). Producción y main coinciden.
- CI y Security en verde para `d87e3fa`. Sin PRs abiertas.
- `pnpm audit --prod`: sin vulnerabilidades conocidas.

## 1. Resumen

Gran avance: el redespliegue ya incluye el endurecimiento. De los puntos de la línea base, **S-01, S-06, S-07, S-12, S-15, S-19 y S-16 (sesiones) están corregidos**. Quedan:

1. **S-05 abierto**: el HTML de la web sigue sin CSP, Permissions-Policy ni COOP.
2. **S-16 sigue con fuga por paginación** en `/api/v1/sync` (hallazgo nuevo, medio).
3. Restos de UI: fecha en inglés en kanban, entrada de sección cortada, campo "Límite de la columna" suelto, enlace sin estilo en Calendario, contador de etiquetas desfasado.
4. Repo: solo queda la spec de seguridad commiteada con IP, nombre de clave SSH y app vecina.

## 2. Seguridad: línea base de esta mañana

| ID                     | Antes                              | Ahora                 | Evidencia                                                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 login sin límite  | 14 fallos sin 429                  | CORREGIDO             | 14 logins fallidos seguidos: 5 x 401, luego 9 x 429. Tiempos 0,59 s (email real) vs 0,59 s (inexistente): sin enumeración por tiempo.                                                                                                                       |
| S-05 cabeceras         | sin CSP                            | **ABIERTO**           | `GET /` y `HEAD /`: solo `strict-transport-security` (sin `preload`), `x-frame-options`, `x-content-type-options`, `referrer-policy`. No hay `content-security-policy`, `permissions-policy` ni `cross-origin-opener-policy`. La API sí manda CSP (helmet). |
| S-06 swagger           | `/api/docs` 200                    | CORREGIDO             | `/api/docs` y `/api/docs-json`: 404 (`Cannot GET`).                                                                                                                                                                                                         |
| S-07 SSRF webhook      | 127.0.0.1 aceptado                 | CORREGIDO             | `https://127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `[::1]` -> 400 `destination_blocked`. `http://` -> 400.                                                                                                                                                 |
| S-07 SSRF iCal         | 127.0.0.1 guardado                 | CORREGIDO             | `http://127.0.0.1`, `http://169.254.169.254`, `http://localhost` -> 400 `url must be https`. No quedó nada guardado.                                                                                                                                        |
| S-12 dotfiles          | `/.env` 200                        | CORREGIDO             | Por cuerpo: `/.env`, `/.git/HEAD`, `/.git/config`, `/.env.local` -> 404 con cuerpo `404 Not Found ... nginx` (no es index.html). `/.well-known/security.txt` sirve el contacto.                                                                             |
| S-15 escalada PAT      | 201                                | CORREGIDO             | Token solo `profile:write` intentando crear otro -> 403 `scope_missing` (`account:admin`).                                                                                                                                                                  |
| S-16 sesiones          | 200                                | CORREGIDO             | PAT `tasks:read`: `GET /auth/sessions` 403; `DELETE /auth/sessions/:id` 403.                                                                                                                                                                                |
| S-16 sync              | eventos de sesión visibles         | **PARCIAL, ver S-22** | Ver abajo.                                                                                                                                                                                                                                                  |
| S-19 500 en validación | `project_id=x` 500                 | CORREGIDO             | `project_id=x` 400; `limit=abc` 400. (`list_id=zzz` devuelve 200; no parece un parámetro válido, sin impacto.)                                                                                                                                              |
| S-11 MCP               | "Authentication is not configured" | CORREGIDO             | `/api/v1/mcp` sin token 401. Con PAT `tasks:read`, `tools/list` 200.                                                                                                                                                                                        |
| OAuth code->token      | posible 403 `session_required`     | NO REPRODUCIDO        | `POST /api/v1/oauth/token` anónimo responde 400 de validación (no 403) y está en `PUBLIC_OPERATIONS`. No se probó un canje con código válido.                                                                                                               |
| CORS                   | cerrado                            | OK                    | Preflight desde `https://evil.example`: sin `access-control-allow-*`.                                                                                                                                                                                       |

### S-05 (abierto): CSP, Permissions-Policy y COOP no llegan al HTML

El repo ya tiene los headers en `deploy/production/todo.caddy` y en `Caddyfile`, pero la respuesta real del edge no los trae (y el HSTS en vivo no lleva `preload`, el repo sí). Es decir, el Caddy del servidor no está importando ese archivo, o importa una versión anterior.

Arreglo recomendado (no depende del Caddy del host):

- En `apps/web/nginx.conf` añadir los headers con `always` en el bloque `server` y repetirlos en cada `location` que ya use `add_header` (nginx descarta los heredados cuando un `location` define los suyos). Mejor un `include /etc/nginx/security-headers.conf;` en cada location.
- CSP del repo: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`. Probar antes en Report-Only: hay service worker y Web Push.
- Verificar tras desplegar: `curl -sI https://todo.reflexionia.com/ | grep -i -E 'content-security|permissions|cross-origin-opener'`.
- Comprobar también en el servidor que el Caddy de borde importa el `todo.caddy` actual.

### S-22 (nuevo, medio): `/api/v1/sync` filtra eventos fuera de scope al paginar

Prueba: PAT con solo `tasks:read`, `GET /api/v1/sync?limit=200` y siguiendo `next_cursor`.

- Páginas 1-3: solo `task.*` y `checklist_item.*` (correcto).
- Página 4 y 5: aparecen `session.created` (6), `token.created` y `token.revoked` (39 en total), `webhook.created`, `calendar.*`, `habit.*`, `note.*`, `project.*`, `tag.*`, `filter.*`, `focus.*`, `smart_list.*`. Ejemplo: `{"type":"session.created@v1","entity_id":"3b30...","data":{"session":{"id":"3b30..."}}}`. El payload de sesión solo trae el id, pero el hecho de que un PAT mínimo vea el ritmo de sesiones, tokens y webhooks es justo lo que S-16 quería cerrar.
- Causa probable (leída en `apps/api/src/modules/sync/sync.service.ts`): `eventTypeFilter(user)` devuelve `{ OR: [...] }` y el cursor añade otra clave `OR` en el mismo objeto `where` con spread. La del cursor pisa a la del filtro de tipo. En las primeras páginas no se nota porque los 600 primeros eventos son todos de tareas.
- Arreglo: combinar con `AND: [typeFilter, cursorFilter]` en vez de dos `OR` hermanos. Test: PAT `tasks:read` pagina todo el outbox y verifica que ningún `type` empieza por un prefijo no autorizado. Hoy `sync-visibility.spec.ts` solo prueba la función, no la consulta con cursor.

### Otros puntos de seguridad

- `/mcp`, `/robots.txt`, `/server-status` y rutas desconocidas devuelven el `index.html` con 200 (soft-404 de SPA). Sin impacto, solo ruido para escáneres.
- La pantalla de login muestra el enlace "Crear cuenta". El registro está cerrado por código salvo `REGISTRATION_OPEN=true`. No lo probé (crearía una cuenta si estuviera abierto). Verifica que la variable no está en el entorno de producción y valora ocultar el enlace.
- `DELETE /me` no probado (destructivo, fuera de permiso).

## 3. Funcional, UX y estética (web en vivo)

| Ítem                                               | Estado              | Evidencia                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag and drop kanban (soltar + refresco)           | CORREGIDO           | Con arrastre real (CDP): la tarjeta pasa de columna al instante, persiste tras recargar y el contador de columna se actualiza. Con límite WIP 1: mensaje "La columna ha llegado a su límite." y la tarjeta vuelve. (Antes se marcó como no testeable; el arrastre con eventos reales sí funciona.)                                                                              |
| WIP: mensaje en línea                              | PARCIAL             | El mensaje ocupa una columna del tablero y desplaza las columnas a la derecha (layout shift). Captura 1.                                                                                                                                                                                                                                                                        |
| Atajo N                                            | CORREGIDO           | La tecla N desde Hoy enfoca el campo "Añadir tarea" (no abre diálogo de captura).                                                                                                                                                                                                                                                                                               |
| Procesar bandeja                                   | FUNCIONA, mejorable | Abre la cola en la primera tarea de Bandeja con Hoy / Mañana / Esta semana, selector de fecha, "Mover a lista", Hecha / Borrar / Saltar. Ya no hay "Set date" en inglés. No ejecuté acciones (son tareas reales). Faltan indicador de progreso (1/12) y botón para salir; el selector de fecha muestra `mm/dd/yyyy` (locale del navegador, no del ajuste de idioma). Captura 3. |
| Fecha de tarjeta kanban en inglés                  | **ABIERTO**         | Tarjeta con 2 sep: "Sep 2" (la lista dice "2 sept"). Captura 1.                                                                                                                                                                                                                                                                                                                 |
| Entrada "Añade una sección…" truncada              | **ABIERTO**         | Sigue cortada en escritorio y móvil.                                                                                                                                                                                                                                                                                                                                            |
| Campo "Límite de la columna"                       | **NUEVO/ABIERTO**   | Aparece siempre bajo el tablero, fuera de las columnas, sin estilo ni botón. Debería vivir en el menú de cada columna. Capturas 1 y móvil.                                                                                                                                                                                                                                      |
| "No hay calendarios externos."                     | **ABIERTO**         | Enlace azul subrayado por defecto del navegador. Captura 2.                                                                                                                                                                                                                                                                                                                     |
| Calendario: cabecera                               | NUEVO               | Botones Hoy/anterior/siguiente flotan en el centro, separados del título y del mes. Captura 2.                                                                                                                                                                                                                                                                                  |
| Chip de tarea con hora en vista mes                | **ABIERTO**         | "ZZ TEST card 2" (20 oct 10:00) cae en la celda 20 (correcto) pero sin hora.                                                                                                                                                                                                                                                                                                    |
| Papelera                                           | PARCIAL             | Restaurar y Eliminar por ítem funcionan; los botones son los nativos del navegador (gris, borde 3D), fuera del diseño. Captura 4.                                                                                                                                                                                                                                               |
| Contador de etiquetas                              | **ABIERTO**         | Contador API vs tareas activas reales: personal 14 vs 13, capturada 8 vs 5, casa 6 vs 5, cumple 10 vs 10. Recalcular desde `tasks` o corregir los caminos que no actualizan. (Comparado con `GET /tasks?tag=<uuid>&status=active`; si el contador cuenta otro estado, aclarar la definición.)                                                                                   |
| Fechas en pantalla Tokens                          | CORREGIDO           | "19 oct 2026, 14:41".                                                                                                                                                                                                                                                                                                                                                           |
| Barra lateral cortada en páginas de lista/etiqueta | CORREGIDO           | Sin recortes en `/tag/:id` ni en listas.                                                                                                                                                                                                                                                                                                                                        |
| Scroll horizontal móvil (390 px)                   | CORREGIDO           | Hoy, kanban y calendario: scrollWidth = clientWidth = 390. Kanban hace scroll interno.                                                                                                                                                                                                                                                                                          |
| Rendimiento                                        | CORREGIDO           | TTFB 118 ms, carga 190 ms; API 116-178 ms (smart list Hoy 178 ms, tareas 161 ms). Medido desde navegador cloud cercano al servidor.                                                                                                                                                                                                                                             |
| Foco (zombies/estadísticas)                        | CORREGIDO           | "Racha 1 · Pomodoros 1 · Minutos de foco 396".                                                                                                                                                                                                                                                                                                                                  |
| i18n general                                       | CASI                | Ajustes, Tokens, Hábitos, Foco, Filtros, Listas inteligentes, Matriz, Revisión en español.                                                                                                                                                                                                                                                                                      |

### Otros detalles visuales / de producto

- Un proyecto creado por API con `view_mode: kanban` se abre en vista lista (el modo parece guardarse solo en cliente).
- `/tag/<id inválido>` muestra una página "Etiquetas" vacía; `/projects/x` redirige en silencio a Hoy. Añadir estado "no encontrado".
- Dashboard: texto crudo "212 · Tendencia 212". Ajustes > Captura: la etiqueta "Parada" no se entiende.
- Tokens: la lista conserva todos los revocados (con mis pruebas ya son ~20). Plegar "Revocados".
- Hoy (escritorio, móvil): tarjeta "Plan de hoy" y filas correctas; fecha en español.

## 4. Higiene del repo (`d87e3fa`)

| Punto                                                                                                            | Estado                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LICENSE, SECURITY.md, CODEOWNERS, dependabot, workflow Security, `.dockerignore`, `.gitleaks.toml`, security.txt | OK                                                                                                                                                                                                                                                                                                                                  |
| IP, usuario SSH y rutas del servidor en `docs/deployment.md`, `docs/handoff.md`, `deploy/`                       | CORREGIDO (ya no están)                                                                                                                                                                                                                                                                                                             |
| `deploy/production/deploy.sh:14` comentario con `/opt/todo/app`                                                  | ABIERTO (menor)                                                                                                                                                                                                                                                                                                                     |
| `docs/spec/spec-seguridad-tick-tack-done-2026-10-19-v2-39a5d1b4.md`                                              | **ABIERTO**: publica IP <SERVER_IP>, clave SSH `<SSH_KEY_NAME>`, red `<EDGE_NETWORK>`, app vecina `<NEIGHBOR_APP>`. Sacarla del repo o anonimizarla (el propio doc incluye el `filter-repo`).                                                                                                                                       |
| Menciones a TickTick en `docs/spec/`                                                                             | ABIERTO: `cursor-prompt-limpieza-repo-publico` (39), `cursor-prompt-ronda3-ticktick-vs-tick-tack-done` (30), `auditoria-settings` (17), `especificacion-producto-v1.1` (11), `paridad-ticktick` (9), `ux-ui` (9), `mcp-listo` (4). En código: importador/compat `open/ticktick.ts` (aceptable si se documenta como compatibilidad). |
| Email personal en el historial                                                                                   | ABIERTO: 152 commits `<PERSONAL_EMAIL>` (nivel C sin hacer).                                                                                                                                                                                                                                                                        |
| Secretos en el árbol                                                                                             | Sin hallazgos (regex AWS/GitHub/PAT/clave privada: solo valores de test). `.env.example` sin valores reales.                                                                                                                                                                                                                        |
| Archivos de editor                                                                                               | `todo.code-workspace` y `.cursor/rules` siguen versionados (decisión tuya).                                                                                                                                                                                                                                                         |

## 5. Pruebas realizadas y limpieza

- Datos de prueba con prefijo `ZZ TEST` creados y eliminados: 1 lista kanban con 2 columnas y 2 tareas (tareas borradas de forma permanente, no quedan en papelera). No toqué ninguna tarea real.
- Tokens de prueba (ro, ro2... ro6, profile-only): todos revocados. Único token activo: `chato_agent`.
- Restos de auditorías anteriores que no son de esta ronda: 1 webhook activo `https://example.com/zz-test-hook` (evento `task.completed`) y la tarea "ZZ TEST reunión" en la papelera (la papelera tiene 24, 23 son tuyas). Conviene borrarlos desde la app.
- No se ejecutó `DELETE /me` ni acciones sobre tareas reales (Procesar bandeja solo abierto, no usado).

## 6. Prioridades para Cursor

1. **P1 S-22**: arreglar el `where` de `SyncService.delta` (AND de filtro de tipo y cursor) + test con cursor.
2. **P1 S-05**: cabeceras de seguridad en `apps/web/nginx.conf` (con `always`, en cada location) o confirmar que el Caddy de borde importa `todo.caddy`; HSTS con `preload` solo si quieres entrar en la lista.
3. **P2 repo**: quitar o anonimizar la spec de seguridad commiteada (IP, clave, app vecina); limpiar `deploy.sh:14`; decidir sobre TickTick en `docs/spec/` y el email del historial.
4. **P2 UI**: "Sep 2" -> formato del idioma; entrada de sección; mover "Límite de la columna" al menú de columna; evitar el desplazamiento al mostrar el error WIP; estilo del enlace "No hay calendarios externos." y de los botones de la papelera; cabecera del calendario.
5. **P3**: contador de etiquetas, hora en chip del mes, progreso y salida en Procesar bandeja, estados "no encontrado", plegar tokens revocados, ocultar "Crear cuenta" si el registro está cerrado.
6. **Pendiente de verificar a mano**: canje OAuth completo con código válido, `DELETE /me`.

---

# PARTE 3

# Auditoría de verificación — Tick Tack Done (todo.reflexionia.com)

**Fecha:** 19 de octubre de 2026 · **Auditor:** Instinct (agente de Pablo)
**Alcance:** verificación en vivo de la app desplegada + revisión del repositorio público, tras la afirmación "casi todo lo que hemos evidenciado está corregido". La sección de Ajustes la cubre otra auditoría paralela y no se incluye aquí.

---

## ⚠️ Titular: los arreglos de seguridad NO están desplegados

- `GET /api/v1/health` → commit desplegado: **`9e159cf`** (PR #18, trabajo de UX).
- `main` del repo está en **`d49b22a`**, que incluye el merge de endurecimiento de seguridad **`540a801` (PR #19)**.
- Es decir: **todo el trabajo de seguridad S-01…S-21 existe en el repo pero NO está en producción**. Las pruebas en vivo lo confirman: las vulnerabilidades críticas siguen activas en todo.reflexionia.com.
- En cambio, el trabajo de UX/funcional (PR #18) **sí está desplegado** y la mayoría de puntos verifican como corregidos.

**Acción inmediata recomendada:** redesplegar desde `main` (`d49b22a` o posterior) y repetir las pruebas S-01, S-05, S-06, S-12, S-15 y S-16, que hoy siguen siendo explotables en producción.

---

## Resumen ejecutivo

| Área                      | Estado                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funcional / UX (ronda 3)  | **Mayoría corregido en producción.** Quedan restos menores de i18n y detalles visuales.                                                              |
| Seguridad en el repo      | **Los 21 arreglos están en el código de `main`.**                                                                                                    |
| Seguridad en producción   | **Sin desplegar.** Todas las pruebas no destructivas confirman que las vulnerabilidades siguen activas.                                              |
| Limpieza del repo público | **Parcial.** Estructura, LICENSE, SECURITY.md, CI y README bien; quedan rastros de origen TickTick en `docs/spec/` y datos sensibles en comentarios. |
| Datos de prueba           | Todo el material ZZ TEST creado en esta auditoría está eliminado y los tokens revocados. La papelera quedó como estaba.                              |

---

## 1. Funcional / UX — verificación en vivo (app desplegada)

Referencia: tabla de la ronda 3 (`docs/spec/cursor-prompt-ronda3-ticktick-vs-tick-tack-done-*.md`).

| Ítem                                                    | Estado                                  | Evidencia                                                                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-1 Calendario mes: tareas en celda correcta            | ✅ Corregido                            | Tarea con hora (ZZ TEST A, 20 oct 10:00) cayó en la celda 20; tarea de día completo en la 19. Captura 1.                                                                        |
| N-1 (detalle) chip de tarea con hora no muestra la hora | 🟡 Parcial                              | La tarjeta en la celda del mes no muestra "10:00", solo el título. Menor.                                                                                                       |
| Calendario en español                                   | ✅ Corregido                            | "octubre de 2026", lun/mar/mié… en toda la vista.                                                                                                                               |
| N-2 Textos de repetición/recordatorio en español        | ✅ Corregido                            | "30 min antes", "Cada semana los martes".                                                                                                                                       |
| N-3 Fechas según idioma (vistas Hoy/lista/detalle)      | ✅ Corregido                            | Cabecera "lunes, 19 de octubre"; filas "Mañana 10:00", "6 may"; detalle "20 oct 2026, 10:00".                                                                                   |
| N-3 Kanban: fechas de tarjeta en inglés                 | ❌ Sigue abierto                        | Tarjetas del tablero muestran "Sep 2" en vez de "2 sep". Captura 2.                                                                                                             |
| N-3 Ajustes: fechas de tokens en formato US             | ❌ Sigue abierto (de la otra auditoría) | Lista de tokens: "10/19/2026, 11:02:30 AM".                                                                                                                                     |
| N-4 Filas completadas: fecha truncada                   | ✅ Corregido                            | Filas completadas muestran "19 oct" completo.                                                                                                                                   |
| N-5 Estadísticas de foco (filtros + zombies)            | ✅ Corregido                            | API: filtro `status` funciona, 0 focos zombie activos, `cappedFocusSeconds` presente. UI: "Racha 1 · Pomodoros 1 · Minutos de foco 396".                                        |
| N-6 Checkbox de tarea integrado en kanban               | ✅ Corregido                            | Checkbox en tarjetas; fechas en el pie de la tarjeta.                                                                                                                           |
| N-6 Input de sección truncado                           | 🟡 Parcial                              | Sigue cortado: "Añade una sección para usar e…". Captura 2.                                                                                                                     |
| N-8 Menú contextual de tarea                            | 🟡 Parcial                              | Incluye "Iniciar foco"; faltan fijar (pin) y subtarea.                                                                                                                          |
| N-12 Contador de etiquetas                              | 🟡 Parcial                              | La API ya expone `active_task_count` (personal = 14). Pero el recuento real de tareas activas con esa etiqueta da **13**: el contador desnormalizado arrastra un desfase de 1.  |
| N-13 / P2-17 Sidebar con etiquetas cortadas             | ❌ Sigue abierto                        | En páginas de lista la barra lateral muestra "iltros" / "in filtros" / "istas" (overflow horizontal residual).                                                                  |
| N-13 "No hay calendarios externos."                     | ❌ Sigue abierto                        | Párrafo suelto sin estilo sigue presente en Calendario.                                                                                                                         |
| P0-3 Scroll horizontal con detalle abierto              | ✅ Corregido                            | `scrollWidth` 1265 sin overflow; en móvil (390px) 390=390, sin overflow. Captura 3.                                                                                             |
| P1-8 Iconos del pie                                     | ✅ Corregido                            | 3 iconos presentes.                                                                                                                                                             |
| P1-25 Drag & drop kanban (drop + refresco)              | ⬜ Sin retestar                         | El DnD es HTML5 nativo; los eventos sintéticos no lo activan. En código (main) ahora invalida el tablero y muestra errores WIP en línea. Verificar a mano tras el redespliegue. |
| P1-27 Procesar bandeja ("Set date")                     | ⬜ Sin retestar                         | Sin tiempo dentro de la ventana de auditoría.                                                                                                                                   |
| P2-15 Papelera: restaurar/eliminar por ítem             | ✅ Corregido                            | Cada ítem tiene "Restaurar" y "Eliminar"; 23 tareas reales intactas.                                                                                                            |
| P2-31 Notas zombie en papelera                          | ✅ Corregido (API)                      | Las notas aparecen en la papelera con acciones ("nueva lista Viaje").                                                                                                           |
| P2-32 Atajo "N" abre captura rápida                     | ⬜ Sin retestar                         | La herramienta de navegador no permite enviar teclas sueltas. Verificar a mano.                                                                                                 |
| P0-1 / P0-2 Rendimiento                                 | ✅ Corregido                            | TTFB 127 ms, carga completa 213 ms, llamadas API ~240 ms (medido desde navegador cloud cercano al servidor; en red real será mayor, pero mejora clara).                         |
| Móvil (Hoy)                                             | ✅ Verificado                           | Vista Hoy en 390×844: cabecera en español, "Vencidas 54", navegación inferior completa, sin overflow. Captura 3.                                                                |

**Regla i18n residual:** el locale visible debe salir del ajuste de idioma, no de `navigator.language`. Fechas de tarjetas kanban y de la lista de tokens lo incumplen aún.

---

## 2. Seguridad S-01…S-21 — repo vs producción

Código verificado en `main` (commit `d49b22a`): todos los arreglos existen — rate limiting (`AttemptLimiter` 10/IP, 5/email con Redis), `TRUST_PROXY_HOPS`, CSP/Permissions-Policy/COOP en Caddy, swagger cerrado en producción, nginx sin `server_tokens` y 404 en dotfiles, `safe-fetch` anti-SSRF en webhooks/automatizaciones/calendario, cifrado de campos (`field-cipher`/`seal-secrets`, S-08), `requireBrowserSession` en gestión de tokens (S-15), `ACCOUNT_ADMIN_SCOPE` fuera de PATs, DELETE /me con contraseña+TOTP+sesión, `sync-visibility` y filtro de scope en búsqueda (S-16), `PUBLIC_OPERATIONS` con default-deny (S-17), neutralización CSV, manejo 413, aserciones de config en runtime, cuotas de adjuntos (2 GB + 50/tarea + magic bytes), cookie `__Host-rfx_session`, `SESSION_IDLE_MS` 7 días, compose endurecido (read_only, cap_drop, no-new-privileges, mem_limit, redis con requirepass), dependencias actualizadas, Dockerfile con `USER node`.

**Pero en producción (9e159cf) nada de esto está activo.** Pruebas no destructivas realizadas hoy:

| Test                              | Resultado en vivo                                                                                                                      | Estado                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| S-01 Rate limit de login          | 14 logins fallidos seguidos → **ningún 429**                                                                                           | ❌ Vulnerable en prod           |
| S-05 Cabeceras de seguridad       | Sin CSP ni Permissions-Policy en `/`                                                                                                   | ❌ Vulnerable en prod           |
| S-06 Swagger                      | `/api/docs` y `/api/docs-json` → **200**                                                                                               | ❌ Vulnerable en prod           |
| S-11 MCP sin auth                 | Mensaje "Authentication is not configured"                                                                                             | ❌ Sigue en prod                |
| S-12 Dotfiles                     | **`/.env` y `/.git/HEAD` → 200**                                                                                                       | ❌ Vulnerable en prod (crítico) |
| S-15 Escalada de scopes PAT       | Token con solo `profile:write` creó un token full-scope (201). Token creado revocado de inmediato (401 verificado)                     | ❌ Vulnerable en prod (crítico) |
| S-16 Visibilidad de sesiones/sync | Token de solo lectura listó `/auth/sessions` (200) y eventos `session.created` en `/sync`; `DELETE sessions/:uuid` → 404 en vez de 403 | ❌ Vulnerable en prod           |
| S-07 SSRF webhooks                | `https://127.0.0.1:1` aceptado (201) con oráculo de ping `{state:failed}`; webhook borrado (204)                                       | ❌ Vulnerable en prod           |
| S-07 SSRF iCal                    | Suscripción `http://127.0.0.1:1` → 500 pero quedó guardada; localizada y borrada (204)                                                 | ❌ Vulnerable en prod           |
| S-19 Validación de parámetros     | `GET /tasks?project_id=x` → **500** (debería ser 400)                                                                                  | ❌ Sigue en prod                |
| DELETE /me                        | **No ejecutado** (destructivo, prohibido en esta auditoría)                                                                            | ⬜                              |

**Conclusión de seguridad:** el trabajo está bien hecho en el repo, pero producción sigue expuesta. Hasta el redespliegue, los puntos más sensibles son S-12 (dotfiles públicos, incluido `/.env`), S-15 (escalada total desde un PAT mínimo) y S-01 (fuerza bruta sin freno).

---

## 3. Limpieza del repositorio público

Verificado contra `cursor-prompt-limpieza-repo-publico-2026-10-19`:

| Punto                                                                       | Estado       | Detalle                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LICENSE (MIT, povedica 2026)                                                | ✅           | Presente.                                                                                                                                                                                                                                             |
| SECURITY.md, CONTRIBUTING.md, CODEOWNERS                                    | ✅           | Presentes.                                                                                                                                                                                                                                            |
| `.github/dependabot.yml`, workflow de seguridad (audit + gitleaks + codeql) | ✅           | Presentes.                                                                                                                                                                                                                                            |
| `.dockerignore`, `.gitleaks.toml`, `.pre-commit-config.yaml`                | ✅           | Presentes.                                                                                                                                                                                                                                            |
| `init-harness.sh` eliminado                                                 | ✅           | Borrado.                                                                                                                                                                                                                                              |
| README con disclaimer de no afiliación                                      | ✅           | "Proyecto personal, sin afiliación con TickTick ni Appest".                                                                                                                                                                                           |
| `package.json` license MIT                                                  | ✅           |                                                                                                                                                                                                                                                       |
| Renombrados de docs                                                         | ✅           | `especificacion-producto-v1.1.md` etc.                                                                                                                                                                                                                |
| Menciones a TickTick / origen en `docs/spec/`                               | ❌ Pendiente | `paridad-ticktick.md` (doc nuevo que admite procedencia), el doc de ronda 3, `mcp-listo` (además con enlace roto al nombre antiguo `ticktick-clone-spec-v1.1.md`), el de fixes y el de auditoría siguen conteniendo "medido de TickTick" y similares. |
| Datos sensibles en comentarios                                              | ❌ Pendiente | `deploy/production/deploy.sh` (comentario con `/opt/todo/app`) y la propia spec de seguridad commiteada (IP del servidor, "turugby").                                                                                                                 |
| Emails de commits (nivel B/C)                                               | ❌ Pendiente | Siguen como <PERSONAL_EMAIL>.                                                                                                                                                                                                                         |

**Recomendación:** antes de dar difusión al repo, pasar el grep del documento de limpieza otra vez sobre `docs/spec/` y `deploy/`, y valorar reescribir el historial (nivel C) si el email y los datos de infra importan.

---

## 4. Hallazgos nuevos

1. **Desfase de contador de etiquetas (nuevo, menor):** `active_task_count` de la etiqueta `personal` dice 14; el recuento real por API da 13. El contador desnormalizado se desincroniza en algún camino (posiblemente subtareas o series). Arreglo: recalcular el contador desde `tasks` activas o hacer triggers/transacción única en todos los caminos de cambio de estado/etiqueta.
2. **500 en validación (S-19) sigue en prod:** `GET /tasks?project_id=x` devuelve 500. Cubierto en main; se resolverá con el redespliegue.
3. **Resto i18n en kanban y tokens** (ya listados arriba).

---

## 5. Pruebas realizadas y limpieza

- Datos de prueba creados con prefijo **ZZ TEST** y eliminados al terminar: 2 tareas (borrado permanente, no quedan en papelera), 1 columna kanban (eliminada), 1 webhook y 1 suscripción iCal de prueba SSRF (borrados).
- Tokens de prueba: **todos revocados**. Estado final verificado: solo queda activo el token `chato_agent` de Pablo.
- La papelera conserva sus 23 tareas reales intactas; no se tocó nada real del usuario. (Queda 1 ítem "ZZ TEST reunión" en papelera creado por la otra auditoría paralela; no es de esta.)
- Ninguna prueba destructiva ejecutada (DELETE /me no se probó).

## 6. Prioridades

1. **P0 — Redesplegar `main` a producción** y re-probar S-01, S-05, S-06, S-12, S-15, S-16, S-07. Hoy `/.env`, escalada de PATs y login sin rate limit son explotables.
2. **P1 — Terminar limpieza del repo:** rastros TickTick en `docs/spec/`, comentarios con IP/rutas, emails del historial si se quiere nivel C.
3. **P2 — Restos i18n:** fechas de tarjetas kanban ("Sep 2") y de tokens ("10/19/2026") deben usar el locale del ajuste de idioma.
4. **P2 — Contador de etiquetas:** recálculo/transactionalidad (desfase 14 vs 13).
5. **P3 — Detalles visuales:** sidebar cortada en listas, input de sección truncado, párrafo "No hay calendarios externos.", hora en chip de mes, pin/subtarea en menú contextual.
6. **Verificar a mano tras redespliegue:** drag & drop kanban (drop + refresco), atajo N, Procesar bandeja "Set date", DELETE /me.

---

# PARTE 4

# Auditoría de Ajustes — tick-tack-done (todo.reflexionia.com)

**Fecha:** 19 de octubre de 2026, ~12:30-12:45 CEST
**Build comparado:** commit `d49b22a` de `main` (2026-10-19 12:29:57 +0200), recién desplegado.
**Alcance:** solo la sección de Ajustes (14 subsecciones), desktop (1280 px) y móvil (390 px, iPhone UA). Referencia de comportamiento: **TickTick** (tick-tack-done debe comportarse de forma idéntica).
**Método:** pruebas reales en la cuenta de Pablo con datos de prueba prefijados `ZZ TEST`; todos los ajustes tocados se restauraron a su valor original y todos los secretos creados se revocaron (salvo lo indicado en "Limpieza pendiente" al final).

---

## Resumen ejecutivo (priorizado)

### P1 — roto o sin salida para el usuario

1. **Automatizaciones no se pueden crear.** El formulario falla siempre con "No se ha podido completar." (verificado 3 veces, con nombre relleno). La sección entera es inusable.
2. **Webhooks no se pueden borrar ni pausar desde la UI.** Una vez creado, el webhook queda activo para siempre; no hay botón de eliminar, pausar ni rotar secreto. El endpoint API `DELETE /webhooks/:id` **sí existe** (`apps/api/src/modules/webhooks/webhooks.controller.ts:231`): falta solo la UI.
3. **Feeds de calendario (.ics) no se pueden listar ni revocar.** Creas un feed y desaparece de la UI, pero la URL sigue viva para siempre. No hay manera de ver los feeds activos ni revocarlos. Cualquiera con la URL tiene acceso de lectura permanente al calendario.

### P2 — funcionalidad muerta o engañosa

4. **Plugins es una página vacía** sin lista, sin estado vacío explicado y sin acción posible.
5. **"Avisos del navegador" (Notificaciones) es texto muerto:** informa del estado del permiso pero no hay botón para solicitarlo. En TickTick puedes activar/desactivar notificaciones desde ajustes.
6. **Integraciones: Drive aparece "Disponible" aunque Google está "Sin conectar"** — engañoso. Las tarjetas de Telegram y Drive no tienen ningún botón de acción.
7. **Cambio de contraseña inexistente:** la tarjeta "Contraseña" solo dice "La recuperación de contraseña no está publicada". TickTick permite cambiar contraseña; aquí no hay flujo ni dentro ni fuera de ajustes.
8. **Apariencia/idioma/inicio de semana solo se guardan en localStorage** (`tick-tack-done.theme`, `.density`, `.week-start`, `.locale`, `.parser`): no se sincronizan entre dispositivos ni navegadores. En TickTick estos ajustes son de cuenta. Solo el copy de "Inicio de semana" lo admite.

### P3 — pulido

9. **2FA sin QR ni cancelar:** el alta muestra el secreto TOTP en texto plano y la URL otpauth, pero no genera el código QR que espera cualquier app de autenticación, y no hay botón Cancelar (si cierras, puede quedar un secreto pendiente en servidor).
10. **Fechas en formato US en Tokens y MCP** ("10/19/2026, 12:36:56 PM") con la UI en español. Causa localizada: `apps/web/src/features/tokens/components/TokensPage.tsx:465` usa `new Date(iso).toLocaleString()` sin locale.
11. **Input de hora de Notificaciones en formato 12 h** (`--:-- --`) con la UI en español; debería ser 24 h.
12. **Acento de color sin nombres accesibles** por muestra (solo `aria-label="Accent"` de grupo); un lector de pantalla no puede distinguir los colores.
13. **Compartir: el permiso por defecto del desplegable es "Escribir"**; lo seguro por defecto es "Leer" (como TickTick, que invita con permiso mínimo).
14. **Móvil: la barra inferior tapa contenido** en páginas largas de ajustes (falta padding-bottom), y desde una subsección no hay botón atrás hacia el índice de ajustes (solo el atrás del navegador).
15. **Notificaciones: no hay recordatorio por defecto ni preferencias por lista** como en TickTick (solo el recordatorio diario).

### Funciona bien (verificado con ida y vuelta + recarga)

- Cuenta: guardar nombre/zona horaria/subtareas al completar persiste en servidor. Zona de peligro bien protegida (botón deshabilitado hasta escribir el email).
- Apariencia: tema/densidad/acento/inicio de semana/idioma aplican en vivo y persisten (en local).
- Captura: regenerar dirección de email-to-task funciona (se muestra una vez, enmascarada después); revocar pide confirmación inline.
- Notificaciones: guardar y borrar el recordatorio diario persiste.
- Listas inteligentes: mostrar/ocultar, reordenar con arrastre y contadores; autoguardado con toast "Guardado". Muy sólido.
- Calendario: crear feed .ics funciona (URL válida, VCALENDAR correcto, HTTP 200).
- Tokens y MCP: crear token con alcance limitado funciona; el alcance se respeta en la API (tasks 200, lists 404 con token de solo lectura de tareas); revocar funciona (401 inmediato después).
- Integraciones: el flujo OAuth de Google arranca correctamente (scopes openid+email+calendar+drive.file, state y redirect_uri bien formados). No completé el sign-in.
- Datos: "Exportar JSON" inicia la descarga ("La descarga ha empezado").
- Móvil 390 px: el índice de ajustes y las tarjetas de Apariencia/Cuenta se adaptan bien a una columna.

---

## Detalle por subsección

### 1. Cuenta (`/settings/account`)

**Qué es:** nombre, correo, zona horaria, comportamiento de subtareas, contraseña, 2FA y zona de peligro.
**Archivos:** `apps/web/src/features/places/Places.tsx:1400` (`AccountPage`).

**Resultado actual:**

- Guardar nombre/zona/subtareas funciona y persiste tras recargar (probado con ida y vuelta y restaurado a Pablo Poveda / Europe/Madrid / Preguntar).
- El correo no es editable (texto plano).
- "Contraseña" es una tarjeta muerta: solo dice "La recuperación de contraseña no está publicada".
- 2FA: al abrir el alta se muestra el secreto TOTP en texto plano + URL otpauth; **no hay QR** ni botón Cancelar.
- Zona de peligro correcta (botón deshabilitado hasta escribir el email).

**Esperado (TickTick):** cambio de contraseña con contraseña actual; 2FA con QR escaneable y cancelación limpia; correo editable con verificación.

**Cómo arreglar:**

- P2.7 — Implementar cambio de contraseña (endpoint + formulario) o, mientras no exista, quitar la tarjeta para no prometer lo que no hay. TickTick lo tiene en Cuenta.
- P3.9 — Generar el QR del otpauth (p. ej. paquete `qrcode`) y añadir "Cancelar" que descarte el secreto pendiente en servidor.

### 2. Apariencia (`/settings/appearance`)

**Qué es:** tema, densidad, acento, inicio de semana, idioma.
**Archivos:** `apps/web/src/features/settings/AppearancePage.tsx`; persistencia en `apps/web/src/theme/preference.ts` (claves `tick-tack-done.*` en localStorage).

**Resultado actual:** todo aplica en vivo y persiste tras recarga, pero **solo en este navegador** (localStorage). El copy de "Inicio de semana" es el único que lo admite ("Solo cambia cómo se dibuja el calendario en este navegador"). Las muestras de acento no tienen nombre accesible individual.
**Esperado (TickTick):** la apariencia es un ajuste de cuenta y viaja entre dispositivos.
**Cómo arreglar:**

- P2.8 — Guardar estas preferencias en la API de cuenta (como ya se hace con zona horaria) y usar localStorage solo como caché; o al menos hacer el copy honesto en todos los ajustes locales, no solo en inicio de semana.
- P3.12 — `aria-label` por muestra de color ("Azul", "Violeta"...).

### 3. Captura (`/settings/capture`)

**Qué es:** idioma del parser y dirección email-to-task.
**Archivos:** `apps/web/src/features/places/Places.tsx:1662` (`CaptureSettings`), `apps/web/src/features/settings/InboundEmailCard.tsx`.

**Resultado actual:** regenerar y revocar la dirección funcionan (la dirección se muestra una sola vez y queda enmascarada `••••@`; revocar pide confirmación inline). El idioma del parser persiste (localStorage, misma observación que Apariencia). Creé y revoqué una dirección de prueba; estado original restaurado (sin dirección).
**Esperado (TickTick):** equivalente; aquí está bien.
**Cómo arreglar:** solo lo de persistencia de preferencias (P2.8).

### 4. Notificaciones (`/settings/notifications`)

**Qué es:** recordatorio diario y avisos del navegador.
**Archivos:** `apps/web/src/features/places/Places.tsx:1701` (`NotificationSettings`); el estado push se calcula en `pushPermission()` (~línea 1793) pero solo se pinta.

**Resultado actual:**

- Guardar/borrar el recordatorio diario funciona y persiste (restaurado a vacío).
- El input de hora se renderiza en formato 12 h (`--:-- --`) con UI en español. (Nota de verificación: el input nativo de hora no acepta escritura por automatización; lo fijé vía setter nativo de React para la prueba. No es un bug del producto.)
- "Avisos del navegador" es texto muerto: dice el estado del permiso pero no hay botón para pedirlo.
  **Esperado (TickTick):** activar notificaciones desde ajustes, formato 24 h, recordatorio por defecto para tareas con fecha y preferencias por lista.
  **Cómo arreglar:**
- P2.5 — Botón "Activar avisos" que llame a `Notification.requestPermission()` desde `NotificationSettings`.
- P3.11 — Forzar formato 24 h (locale `es-ES` en el input o componente propio).
- P3.15 — Añadir recordatorio por defecto configurable.

### 5. Listas inteligentes (`/settings/smart-lists`)

**Qué es:** visibilidad, orden y contadores de las listas inteligentes.
**Archivos:** `apps/web/src/features/views/components/SmartListsPage.tsx`.

**Resultado actual:** todo funciona: ocultar/mostrar (probado con Completadas), reordenar arrastrando (probado moviendo Mañana) y contadores. Autoguardado con toast "Guardado". Todo restaurado. Sin hallazgos. Es la subsección más pulida.

### 6. Calendario (`/settings/calendar`)

**Qué es:** feeds .ics por lista y enlace a la integración de Google.
**Archivos:** `apps/web/src/features/product/ProductPages.tsx:346` (`CalendarSettings`); API en `apps/api/src/modules/calendar/`.

**Resultado actual:** crear un feed funciona (URL válida, contenido VCALENDAR correcto). **Pero no hay lista de feeds ni revocación:** tras crearlo, la UI no lo muestra más y la URL queda viva para siempre. La tarjeta de Google enlaza a Integraciones (bien).
**Esperado (TickTick):** ver los feeds activos y poder revocarlos/regenerarlos.
**Cómo arreglar:**

- P1.3 — Añadir en `CalendarSettings` la lista de feeds existentes (hay que exponerlos en la API de calendario si no está) con botón Revocar (borrar/invalidar el token del feed) y Regenerar. Mostrar la URL solo al crear.

### 7. Tokens y MCP (`/settings/tokens`)

**Qué es:** tokens de API con alcances y acceso MCP.
**Archivos:** `apps/web/src/features/tokens/components/TokensPage.tsx`.

**Resultado actual:** crear con alcance, copiar el secreto una sola vez y revocar funcionan. El alcance se respeta en la API (verificado: token "Leer tareas" → `/api/v1/tasks` 200, `/api/v1/lists` 404; tras revocar, 401). Las fechas de creación/último uso salen en formato US ("10/19/2026, 12:36:56 PM").
**Esperado (TickTick):** fechas en el locale de la UI.
**Cómo arreglar:**

- P3.10 — `TokensPage.tsx:465`: pasar el locale activo a `toLocaleString(locale)` (el proyecto ya tiene `formatStamp(stamp, locale)` en `apps/web/src/features/settings/MoreSettings.tsx:620` como patrón).

### 8. Integraciones (`/settings/integrations`)

**Qué es:** conexión con Google (Calendar/Drive) y Telegram.
**Archivos:** `apps/web/src/features/product/ProductPages.tsx:455` (`IntegrationSettings`).

**Resultado actual:** el flujo OAuth de Google arranca bien (scopes openid+email+calendar+drive.file, `state` y `redirect_uri` correctos; no completé el sign-in). Pero **Drive muestra "Disponible" con Google "Sin conectar"**, y las tarjetas de Telegram y Drive no tienen ningún botón.
**Esperado (TickTick):** estado coherente y acción clara por integración (Conectar / Desconectar / Configurar).
**Cómo arreglar:**

- P2.6 — Derivar el estado de Drive del estado real de la conexión Google; añadir botón de acción a cada tarjeta o marcar como "Próximamente" las que no se pueden usar.

### 9. Automatizaciones (`/settings/automations`)

**Qué es:** regla fija "al completar una tarea, manda un aviso".
**Archivos:** UI `apps/web/src/features/settings/MoreSettings.tsx:13` (`AutomationSettings`); API `apps/api/src/modules/automations/automations.controller.ts:371` (`@Post`, scope `automations:manage`).

**Resultado actual:** **P1 — la creación falla siempre**: con nombre relleno, "Crear automatización" devuelve "No se ha podido completar." (3 intentos). El botón queda deshabilitado hasta escribir un nombre (eso está bien). No se crea nada.
**Cómo arreglar:**

- P1.1 — Reproducir con la pestaña Network abierta: la UI manda `{name, trigger:{event:'task.completed@v1'}, actions:[{type:'notify'}], enabled:true}`, que encaja con `AutomationDto` (name ≤200, trigger objeto, actions array). Si la API responde 4xx/5xx, la causa está en servidor (scope de sesión, validación o Prisma); el mensaje genérico además debería mostrar el detalle del error para poder diagnosticarlo.
- Además: solo existe un tipo de regla fija. TickTick no tiene automatizaciones, así que aquí el listón es "que funcione"; el borrado/pausa tampoco está expuesto en la UI aunque la API sí tiene `DELETE :id` (`automations.controller.ts:418`).

### 10. Webhooks (`/settings/webhooks`)

**Qué es:** URL que recibe un aviso al completarse una tarea, con secreto de un solo uso.
**Archivos:** UI `apps/web/src/features/settings/MoreSettings.tsx:103` (`WebhookSettings`); API `apps/api/src/modules/webhooks/webhooks.controller.ts` (`@Delete(':id')` en :231, ping en :252, reintento en :274).

**Resultado actual:** crear funciona (secreto mostrado una vez, evento `task.completed@v1`, estado Activo). **P1 — no hay forma de borrar, pausar ni rotar un webhook desde la UI** aunque la API sí tiene el DELETE. Mi webhook de prueba (apunta a example.com) sigue activo: ver "Limpieza pendiente".
**Esperado:** lista con acciones por webhook (eliminar al menos; la API ya soporta ping y reintento).
**Cómo arreglar:**

- P1.2 — Añadir en `WebhookSettings` botón Eliminar por fila llamando a `DELETE /webhooks/:id`, con confirmación inline (mismo patrón que "Revocar" en Captura). Opcional: botón Probar (`POST :id/ping`) y ver reintentos.

### 11. Plugins (`/settings/plugins`)

**Qué es:** página de plugins.
**Archivos:** `apps/web/src/features/settings/MoreSettings.tsx:212` (`PluginSettings`).

**Resultado actual:** **P2 — página prácticamente vacía**: una tarjeta descriptiva sin lista, sin estado vacío y sin ninguna acción.
**Cómo arreglar:** si no hay sistema de plugins todavía, quitar la entrada del menú de ajustes (en `SettingsLayout`/`SettingsHome`, `apps/web/src/features/places/Places.tsx:1301-1318`) hasta que exista; si existe, mostrar lista o un estado vacío honesto.

### 12. Compartir (`/settings/sharing`)

**Qué es:** invitar por email a una lista con permiso Leer/Comentar/Escribir.
**Archivos:** `apps/web/src/features/settings/MoreSettings.tsx:260` (`SharingSettings`).

**Resultado actual:** el formulario existe y tiene buena pinta; **no probado de extremo a extremo** (requeriría una segunda cuenta). El permiso por defecto del desplegable es **Escribir**.
**Esperado (TickTick):** invitación con el permiso mínimo por defecto.
**Cómo arreglar:**

- P3.13 — Cambiar la opción inicial a "Leer". Probar el flujo completo de invitación/aceptación con una segunda cuenta antes de anunciarlo.

### 13. Datos (`/settings/data`)

**Qué es:** exportar JSON y copias de seguridad de esta máquina.
**Archivos:** `apps/web/src/features/settings/MoreSettings.tsx:384` (`DataSettings`).

**Resultado actual:** "Exportar JSON" funciona ("La descarga ha empezado"). Copias muestra "Todavía no hay copias en esta máquina" con distintivo "Con destino remoto" (sin probar la creación/verificación de copias).
**Cómo arreglar:** pendiente probar crear/verificar una copia; el copy "de esta máquina" es correcto si las copias son locales.

### 14. Atajos (`/settings/shortcuts`)

**Qué es:** lista estática de atajos de teclado.
**Archivos:** `apps/web/src/features/settings/MoreSettings.tsx:512` (`ShortcutSettings`); los atajos reales viven en `apps/web/src/shell/GlobalKeys.tsx`.

**Resultado actual:** lista clara con chips `kbd` (incluye Matriz G M, Revisión G W, "?" para ayuda). No verifiqué que cada atajo listado funcione en la app.
**Cómo arreglar:** cruzar la lista pintada con los handlers de `GlobalKeys.tsx` para que no prometa atajos inexistentes.

---

## Responsive / móvil (390 px, iPhone)

- El índice de ajustes se apila bien y las tarjetas pasan a una columna: se ve limpio (ver captura móvil de Apariencia adjunta).
- P3.14a — La barra inferior (Hoy/Calendario/+/Listas/Más) **tapa el final del contenido** en páginas largas (p. ej. la tarjeta 2FA en Cuenta queda cortada detrás). Falta `padding-bottom` en el contenedor de ajustes en el breakpoint móvil.
- P3.14b — Dentro de una subsección no hay botón "atrás" al índice de ajustes; solo queda el atrás del navegador. TickTick móvil muestra cabecera con flecha.

## i18n / formato

- P3.10 — Fechas US en Tokens (causa localizada arriba).
- P3.11 — Hora 12 h en Notificaciones.
- El resto de la UI de ajustes está en español coherente.

---

## Limpieza y notas para Pablo

1. **Feed .ics activo creado por mí** para la lista vacía `viaje-londres` (0 tareas): `https://todo.reflexionia.com/feeds/73DfgfIvCNP0h_PCy2xI46g8YLxpHaMt.ics`. No pude revocarlo porque no existe la UI (P1.3). Bórralo en base de datos o cuando implementes la revocación.
2. **Webhook de prueba activo** creado por mí: `https://example.com/zz-test-hook` (evento `task.completed@v1`). Apunta a example.com (inofensivo, los envíos fallarán), pero no se puede borrar desde la UI (P1.2). Bórralo con `DELETE /webhooks/:id` o en base de datos.
3. **Posible secreto TOTP pendiente:** al abrir el panel de alta de 2FA se genera un secreto que quedó sin confirmar (no hay cancelar). El 2FA sigue desactivado; conviene invalidar ese secreto pendiente en servidor.
4. Dirección email-to-task: creada y **revocada** durante la prueba; estado original (sin dirección). Token de API "ZZ TEST settings-audit-mg": creado y **revocado** (401 verificado). Los tokens `ZZ TEST audit-pw/-ro/-rw/escalated2` son del otro agente de auditoría, no los toqué.
5. Ajustes restaurados a sus valores originales: nombre, zona horaria, subtareas, tema/densidad/acento/inicio de semana/idioma, parser, recordatorio diario (vacío), listas inteligentes (visibilidad, orden, contadores).
6. **Sin probar:** flujo completo de Compartir (necesita segunda cuenta), creación/verificación de copias en Datos, ping/reintento de webhooks, atajos "?" y G M / G W en vivo, completar el OAuth de Google, y el input de hora con escritura de teclado real (limitación de automatización, no del producto).

---

# PARTE 5

# Pulido UX/UI de la pantalla "Hoy" (Mañana y demás vistas heredan lo mismo)

Fecha: 2026-10-19. Revisión sobre https://todo.reflexionia.com/ (commit de main revisado: 57fe6fc) y repo `povedica/tick-tack-done`.
Referencia de comportamiento: la vista Hoy de una app de tareas madura, con agrupación por prioridad. Los valores se dan como **decisiones de diseño propias**, sin citar origen.
Reglas para Cursor: no tocar lógica de dominio ni API salvo donde se indica. Todos los textos en `i18n/es.ts` y `i18n/en.ts`. Verificar con `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Capturas de referencia (adjuntas por WhatsApp): `REF-1` lista de referencia con hora y grupo Hábito, `REF-2` panel de detalle + selector de fecha, `TTD-1` Hoy actual, `TTD-2` panel de detalle actual, `TTD-3` filas actuales con "Hoy" sin hora.

---

## Resumen de hallazgos (prioridad)

| #   | Prioridad | Problema                                                                                                       | Causa en código                                                       |
| --- | --------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | P0        | Tarea con hora no muestra la hora en la lista (solo "Hoy")                                                     | `TodayPage.tsx` `TaskGroup` renderiza `formatDueDate` y nunca la hora |
| 2   | P0        | "Vencidas" sale antes que "Alta"                                                                               | `TodayPage.tsx` pinta `parts.overdue` siempre antes de `sections`     |
| 3   | P0        | Panel de detalle básico (selects nativos, botones de texto, "Borrar" rojo arriba)                              | `TaskDetail.tsx` + `ui.css` `.detail-panel`                           |
| 4   | P0        | "Hábitos de hoy" vacío: solo un `h2` sin nada                                                                  | `TodayPage.tsx` sección `habitsToday`                                 |
| 5   | P1        | Quick-add sin feedback del parseo (fecha/hora/prioridad)                                                       | `quick-add.ts` parsea pero no hay chip en UI                          |
| 6   | P1        | Filas: columna meta limitada al 42%, el título se corta pronto, "Bandeja" se trunca a "B" con el panel abierto | `today.css` `.task-row grid-template-columns`                         |
| 7   | P1        | Sin animación al completar; toast abajo-izquierda tapa el pie del sidebar; hay 2 estilos de toast distintos    | `completion.ts`, `toast.css`, `ui.css .action-toast`                  |
| 8   | P1        | Cabecera de grupo sin colapso visible ni espaciado superior ("Alta" pegada a la fila anterior)                 | `TaskGroup` usa `<details>` sin chevron propio                        |
| 9   | P2        | "Plan de hoy" ocupa una tarjeta fija aunque esté vacío                                                         | `TodayPage.tsx` `<details className="plan">`                          |
| 10  | P2        | Estado "Actividad": "Tú · created · hace 1 minuto" (inglés crudo)                                              | `TaskDetail.tsx` ~L517 `entry.action`                                 |
| 11  | P2        | Botones sueltos "Convertir en nota" y "Mañana" al final del panel; "No se repite" duplicado                    | `TaskDetail.tsx` ~L522                                                |
| 12  | P2        | En móvil la última fila queda tapada por la barra inferior                                                     | falta `padding-bottom` en `.today`                                    |

---

## 1. Hora de la tarea no aparece (P0)

**Qué es:** si creas "Reunión hoy 18:00" la tarea se guarda con `19 oct 2026, 18:00` (el detalle lo muestra), pero en la lista solo sale "Hoy".
**Comportamiento esperado:** la hora aparece a la derecha, en color acento, con icono de campana si tiene recordatorio. Las tareas sin hora no muestran nada. Si es de otro día, "12 sep" y la hora si la hay.
**Actual:** `formatDueDate` solo devuelve día; `TaskGroup` no tiene hora (ver `TTD-3`).
**Cómo arreglarlo:**

- `features/today/groups.ts`: añadir `hasTime(dueDate, timeZone)` (hora local distinta de 00:00 y marca `all_day` si la API la expone; si no, definir "sin hora" = 00:00 exacto) y `formatDueTime(dueDate, timeZone, locale)` con `Intl.DateTimeFormat(locale, {hour:'2-digit', minute:'2-digit', timeZone, hour12:false})`.
- `TodayTask` debe incluir `allDay: boolean` y `hasReminder: boolean` (mapear en `board.ts` `toTodayTask`).
- `TodayPage.tsx` `TaskGroup`: después del nombre de lista, si hay hora, `<time className="task-time">18:00</time>`; con recordatorio añadir icono `AlarmClock` de lucide (12px).
- En la vista del día (no vencidas) mostrar **solo la hora** en lugar de "Hoy" (el grupo ya dice que es hoy). En vencidas: "19 mar" + hora.
- Orden dentro de cada grupo: primero las que tienen hora (ascendente), luego las de todo el día. `partitionToday` ya ordena por `dueDate`; cambiar el comparador para que "sin hora" vaya después.
- CSS en `today.css`: `.task-time { color: var(--accent); font-variant-numeric: tabular-nums; }`; `.task-date.is-overdue` se mantiene rojo.
  **Test:** `groups.spec.ts` casos con hora, sin hora, zona horaria Europe/Madrid y cambio de día.

## 2. Orden de secciones: Vencidas antes que Alta (P0)

**Esperado (decisión de producto):** con agrupación por prioridad, las vencidas **no** forman un bloque aparte: se reparten dentro de su grupo de prioridad (Alta, Media, Baja, Ninguna), con la fecha en rojo. El bloque "Vencidas" solo existe cuando la agrupación es por fecha, y allí va primero.
**Actual:** `TodayPage.tsx` pinta siempre `parts.overdue` (54 tareas) antes de `sections` (ver `TTD-1`), así que Alta queda enterrada.
**Cómo arreglarlo:**

- `TodayPage.tsx`: si `group === 'priority' | 'tag' | 'list'`, usar `groupTasks([...parts.overdue, ...parts.today], group)` y no renderizar el bloque Vencidas aparte. Si `group === 'due'`, mantener Vencidas primero y luego Hoy.
- Dentro de cada grupo, orden por fecha ascendente (las más antiguas primero) y las de hoy después; estas últimas con hora ordenadas por hora.
- `groupTasks` ya soporta lista completa; añadir test en `groups.spec.ts`: "las vencidas de prioridad alta aparecen en el grupo Alta".
- Ofrecer en el menú de orden (icono ArrowUpDown) la opción "Agrupar por: Prioridad | Fecha | Etiqueta | Lista | Sin agrupar" y "Ordenar por: Fecha | Prioridad | Título" y "Orden: más antiguas primero / más recientes". Persistir en `localStorage` (ya existe `GROUP_KEY`).
- Añadir al final un grupo **Hábitos** (ver punto 4).
- Cabecera de grupo: texto 14px peso 600, contador gris 13px, chevron a la izquierda (`ChevronDown`, gira al colapsar), margen superior 16px. Colapsar con clic; persistir estado de colapso por grupo en `localStorage`.

## 3. Panel de detalle (P0): rediseño

**Actual (`TTD-2`):** es una columna de formulario: botones de texto "Copiar enlace / Duplicar / Iniciar foco", botón rojo "Borrar" arriba, `Fecha` como input, `Añadir etiqueta` como `<select>` nativo, `Contenido` con textarea, "Checklist", "Recordatorios" con `<select>`, "Repetición" con tres botones, "Adjuntos", "Actividad" en inglés.
**Esperado (`REF-2`):** cabecera con checkbox, chip de fecha clicable, bandera de prioridad; título grande editable; descripción; chips de etiqueta con "+"; pie con lista y acciones; todo lo demás en popovers y menú "⋯".

### Wireframe propuesto (desktop, panel de 380px)

```
┌───────────────────────────────────────────┐
│ [☐]  | [📅 Hoy, 19 oct, 18:00 ▾]     [⚑] │  cabecera 56px, borde inferior
├───────────────────────────────────────────┤
│ ZZ TEST reunión                       [≡] │  título 20px/600, sin borde, auto-alto
│ Escribe algo o / para comandos            │  descripción 14px, ink-3 placeholder
│                                           │
│ ▢ Subtarea 1                              │  checklist inline (checkbox + texto)
│ + Añadir subtarea                         │
│                                           │
│ [cumple ×] [casa ×] [+]                   │  chips etiqueta + botón "+"
│                                           │
│ 🔔 Recordatorio: 30 min antes        [×]  │  solo si existe
│ 🔁 Repite: cada semana               [×]  │  solo si existe
│ 📎 2 adjuntos                             │  solo si existen
├───────────────────────────────────────────┤
│ 📥 Bandeja ▾                 [Aa] [💬] [⋯]│  pie 48px: lista, formato, comentarios, más
└───────────────────────────────────────────┘
```

### Especificación por control

- **Cabecera:** `PriorityCheck` (checkbox con color de prioridad) + separador vertical de 1px + `DueChip` + espacio + botón bandera. El chip de fecha se pinta rojo si está vencida ("hace 3 meses, 18 jul"), acento si es hoy/futura, gris si no hay fecha ("Fecha").
- **Selector de fecha (popover 260px):** pestañas "Fecha | Duración"; fila de 4 atajos con icono (Hoy, Mañana, +7 días, Sin fecha); calendario mensual con día seleccionado en círculo acento y flechas de mes; filas "Hora", "Recordatorio" y "Repetir" con chevron que abren sub-popovers; botones "Borrar" (secundario) y "OK" (primario). Crear `components/DatePopover.tsx` (reutilizable en quick-add y menú contextual) y sustituir el input de `Fecha`.
- **Prioridad:** popover con 4 filas (bandera de color + texto + check en la activa): Alta, Media, Baja, Ninguna. Sustituye al `<select class="sr-only">` actual (`TaskDetail.tsx` ~L185).
- **Título:** `textarea` auto-resize, sin borde, 20px/600; Enter confirma, Shift+Enter nueva línea.
- **Etiquetas:** chips con color de la etiqueta y `×` al hover; botón circular `+` abre un popover con buscador y lista con casillas (sustituye al `<select>` "Añadir etiqueta", que hoy lista 60 etiquetas sin filtro).
- **Recordatorios y repetición:** ya no son secciones permanentes. Se muestran como filas solo si existen; se añaden desde el popover de fecha. Eliminar el `<select>` "30 min antes" que aparece sin recordatorio, y el texto duplicado "No se repite".
- **Pie:** selector de lista como botón con icono y popover de listas (no `<select>` nativo); a la derecha iconos `Type` (formato), `MessageSquare` (comentarios) y `MoreHorizontal`.
- **Menú "⋯" (popover vertical, 220px):** Añadir subtarea, Vincular tarea padre, Fijar, Descartar, Etiquetas, Subir adjunto, Iniciar foco, Actividad de la tarea, Guardar como plantilla, Duplicar, Copiar enlace, Convertir en nota, Exportar, Imprimir, y **Borrar** al final (rojo, con separador). Quitar el botón "Borrar" rojo de la cabecera y los botones de texto sueltos, y "Mañana".
- **Actividad:** mover a un panel secundario (opción del menú). Mapear `entry.action` a texto español con `i18n` (`created` → "creó la tarea", `completed`, `moved`, `updated`).
- **Espaciado y tipografía:** padding horizontal 20px, separación vertical entre bloques 16px, radio de popovers 12px, sombra `0 8px 24px rgba(0,0,0,.12)`, texto 14px, secundarios 13px `--ink-3`.
- **Guardado:** autoguardado al perder foco con indicador discreto "Guardado" (ya existe `saved`); no mostrarlo como línea suelta arriba (`.page-toolbar`).
- **Responsive:** ≥1200px panel fijo a la derecha; 700-1199px modal lateral con fondo atenuado (ya funciona); <700px pantalla completa con flecha atrás.
  **Archivos:** `features/tasks/TaskDetail.tsx` (749 líneas: dividir en `DetailHeader`, `DetailBody`, `DetailFooter`, `DetailMenu`), `components/ui.css` (`.detail-panel`, L794-845), `shell/shell.css` (`.detail`, L247-260; hay duplicado en `styles.css` L398: unificar en un solo bloque), nuevos `components/DatePopover.tsx`, `components/PriorityMenu.tsx`, `components/TagPicker.tsx`, `components/Popover.tsx` (base con cierre en Esc y clic fuera).

## 4. Hábitos de hoy sin hábitos (P0)

**Actual:** solo aparece el título "Hábitos de hoy" y debajo nada (`TTD-1`, final de la lista).
**Esperado:** si hay hábitos, mostrarlos como un grupo más al final ("Hábitos", contador, filas con icono del hábito, progreso `0/1` y hora si tiene). Si no hay, mostrar una tarjeta tranquila.

### Wireframe del estado vacío

```
┌──────────────────────────────────────────────┐
│  🌱                                          │
│  Hoy no tienes hábitos                       │  16px/600
│  Sin prisa. Un hábito pequeño puede ser      │  14px ink-2
│  el primero: beber agua, leer 10 minutos     │
│  o dar un paseo.                             │
│                                              │
│  [ Beber agua ] [ Leer ] [ Pasear ]          │  chips de sugerencia (de HABIT_SUGGESTIONS)
│  [ + Crear un hábito ]   (botón primario)    │
│  Ahora no  (enlace, oculta 7 días)           │
└──────────────────────────────────────────────┘
```

**Cómo arreglarlo:**

- Nuevo componente `features/habits/components/HabitsEmpty.tsx`; usar `HABIT_SUGGESTIONS` de `features/habits/suggestions.ts` para los chips (crean el hábito con un clic, con toast "Hábito creado" y deshacer).
- `TodayPage.tsx`: render condicional: `habits.isPending` → 2 esqueletos; vacío → `<HabitsEmpty />`; con datos → grupo "Hábitos" con `habit-check` circular y barra de progreso.
- Estilo: tarjeta `--surface-2`, radio 12px, padding 20px, sin borde fuerte, icono 28px; botón principal `--accent`.
- Textos nuevos en i18n: `habitsEmptyTitle` ("Hoy no tienes hábitos"), `habitsEmptyBody` ("Sin prisa. Un hábito pequeño puede ser el primero."), `habitsEmptyCta` ("Crear un hábito"), `habitsEmptyDismiss` ("Ahora no").
- Persistir "Ahora no" en `localStorage` (`tick-tack-done.habits.dismissed`, 7 días).

## 5. Quick-add (P1)

**Esperado:** placeholder `Añadir tarea a "Bandeja"` (nombra la lista destino); al escribir, resaltar en el propio texto lo que se interpreta (fecha, hora, prioridad, #etiqueta, lista) y mostrar un chip a la derecha con el resultado ("Hoy, 18:00"). Enter crea y mantiene el foco; Esc limpia; las herramientas (fecha, prioridad, lista) se ven al enfocar.
**Actual:** `<input>` plano; `quickAddRequest` parsea ("hoy 18:00 !alta" funciona: la tarea quedó con prioridad Alta, fecha de hoy 18:00 y título limpio) pero el usuario no ve el parseo hasta después. Solo se ve un icono de calendario y un chevron (`QuickAddTools.tsx`, 80 líneas). La vista previa y el servidor deben usar el mismo `parseQuickAdd` de la Parte 8: una hora separada de la fecha ("mañana … a las 16:00") tiene que verse en el chip igual que quedará guardada.
**Cómo arreglarlo:**

- `TodayPage.tsx` `addTask`: calcular `quickAddRequest` en cada cambio (memo) y pasar `preview` a `QuickAddTools` para pintar chips: fecha/hora (acento), prioridad (color), etiquetas (color de etiqueta).
- Resaltado en línea: sustituir el `<input>` por un `contenteditable` o capa espejo (`<div aria-hidden>` detrás del input con `<mark>` por token). Alternativa más simple y suficiente: solo chips.
- Popovers de fecha y prioridad: reutilizar `DatePopover` y `PriorityMenu` (punto 3).
- Placeholder dinámico con nombre de la lista actual; si la vista es Hoy, el destino es Bandeja y la fecha por defecto es hoy.
- Accesibilidad: `aria-describedby` con el resumen del parseo.

## 6. Fila de tarea (anatomía y layout) (P1)

**Actual:** `.task-row` en `today.css` L67 es `grid: auto minmax(0,1fr) minmax(0,42%) auto`, altura `--row-h` (40px), 8px de padding. Con el panel abierto la columna meta se reduce y "Bandeja" se corta en "B" (`TTD-3`). Hay reglas `.task-row`/`.task-meta` duplicadas en `ui.css` L754-790.
**Esperado:**

- Orden de elementos: [grip al hover] [checkbox con color de prioridad] [título] [chips de etiqueta] [nombre de lista] [icono recordatorio/repetición/descripción] [hora o fecha] [⋯ al hover].
- Título con elipsis, prioridad máxima de espacio; meta con `flex: 0 0 auto` y el título se encoge, no al revés.
- Etiquetas: máximo 2 chips y `+N`; nombre de lista gris 12px con máximo 14ch y elipsis.
- Iconos pequeños (14px, gris) para: descripción, checklist `1/3`, repetición, adjuntos, comentarios.
- Hover: fondo `--surface-2`, grip a la izquierda, `⋯` a la derecha; seleccionado: `--accent-soft`.
- Tareas de calendario externo (si existen): icono de calendario y origen en gris.
  **Cómo arreglarlo:** eliminar duplicados de `ui.css` (dejar una sola definición en `today.css`), cambiar a `display:flex` con `min-width:0` en título y `flex-shrink:0` en meta, añadir iconos desde lucide en `TaskGroup`. Añadir contador de subtareas y marca de descripción (requiere `checklistTotal/checklistDone`/`hasContent` en `TodayTask`).

## 7. Completar, deshacer y toasts (P1)

- **Esperado:** al marcar, el checkbox se rellena con una animación corta (150-200ms, check con trazo), el título se tacha, la fila se desvanece y colapsa en 250ms; toast "Tarea completada · Deshacer" abajo-centro, 4s, apilable.
- **Actual:** la fila desaparece al instante (sin animación) y el toast "Completada: …" aparece abajo-izquierda **encima del pie del sidebar** (tapa "Papelera"). Además hay otro estilo de toast (oscuro, abajo-derecha, "Tarea movida a la papelera · Deshacer"): dos componentes distintos (`UndoToast.tsx` + `toast.css` vs `action-toast` en `ui.css` L713).
- **Fix:** unificar en un único `Toast` (oscuro, abajo-centro, 4s, acción a la derecha). Animar en `PriorityCheck.tsx` (CSS keyframes en `ui.css`) y retrasar `hidden` 250ms en `TodayPage.complete`. Respetar `prefers-reduced-motion`. Ctrl/Cmd+Z ya deshace: mostrar el atajo en el toast.

## 8. Cabeceras de grupo y espaciado (P1)

`TaskGroup` usa `<details>` con `<summary>` sin chevron; "Alta" queda pegada a la última fila anterior (`TTD-3`). Fix: `margin-top: 16px` en `.task-group`, chevron lucide que rota con `[open]`, contador a la derecha del título, cabecera pegajosa (`position: sticky; top: 0`) con fondo `--bg`.

## 9. Plan de hoy (P2)

Hoy es una tarjeta con borde y texto fijo "Cuando haya una propuesta…". Si no hay plan: colapsar a una sola línea discreta con enlace "Planificar mi día" (lleva a `/review`). Si hay plan: tarjeta con 3-5 tareas sugeridas, botón "Aceptar plan".

## 10. Atajos, selección múltiple, menú contextual y drag & drop (revisar)

- **Atajos existentes** (`shell/shortcuts.ts`): `N`, `?`, `Ctrl/Cmd+K`, `/`, `G T`… Faltan sobre la lista: `↑/↓` mover foco entre filas, `Enter` abrir detalle, `Espacio` completar, `P` prioridad, `D` fecha, `Supr` borrar, `X` seleccionar, `Shift+clic` rango, `Ctrl/Cmd+clic` selección múltiple (barra de acciones en lote: ya hay `.task-row.is-batch` en `ui.css` L759, comprobar que se activa en Hoy).
- **Menú contextual:** clic derecho sobre fila → Fecha (atajos con iconos), Prioridad (4 banderas), Añadir subtarea, Fijar, Mover a…, Etiquetas, Iniciar foco, Duplicar, Copiar enlace, Convertir en nota, Borrar. Hoy no existe.
- **Drag & drop:** `task-grip` solo en orden manual. Permitir arrastrar entre grupos de prioridad (cambia prioridad) y a la barra lateral (mueve de lista o cambia fecha en Hoy/Mañana).
- No verificado en esta pasada: atajos reales de la referencia y su comportamiento exacto; validar con prueba manual tras implementar.

## 11. Estados de carga, vacío, error y rendimiento

- Carga: ya hay `task-skeleton` (3 filas). Añadir esqueleto también para cabecera de grupo y para hábitos.
- Vacío total (`todayEmpty` en `es.ts` L110): "Despejado. Captura lo próximo con N o revisa tu Inbox." Mejorar con ilustración sencilla, título "Día despejado", cuerpo corto y botón "Añadir tarea".
- Error: `todayFailed` con botón Reintentar (existe).
- Rendimiento observado: primera pintura con esqueleto ~3s en el navegador remoto; la carga hace dos consultas paginadas (`loadTodayTasks`, `board.ts`). Con 54 vencidas no hay virtualización; considerar `@tanstack/react-virtual` si superan ~200 filas.

## 12. Responsive y tema

- **Móvil (390px):** lista correcta con filas de 2 líneas y barra inferior (Hoy, Calendario, +, Listas, Más). Problemas: la última fila queda tapada por la barra (añadir `padding-bottom: calc(64px + env(safe-area-inset-bottom))` a `.today`); el detalle abre pantalla completa pero con los mismos controles nativos (aplicar punto 3); el título de 20px se corta en la cabecera del panel.
- **Tablet/960px:** el panel de detalle se abre como modal lateral con fondo atenuado: correcto.
- **Tema oscuro:** existen tokens en `styles/tokens.css` (L109-112). No se auditó visualmente en esta pasada: revisar contraste de chips de etiqueta (fondo pastel con texto oscuro) y de `--accent-soft` en oscuro.

---

## Orden de implementación (checklist)

1. [ ] Punto 2: orden de grupos (cambio pequeño, alto impacto) + tests en `groups.spec.ts`.
2. [ ] Punto 1: hora visible y orden por hora + tests.
3. [ ] Punto 4: estado vacío de hábitos + grupo Hábitos.
4. [ ] Punto 6 y 8: layout de fila y cabecera de grupo (limpiar CSS duplicado).
5. [ ] Punto 3: componentes `Popover`, `DatePopover`, `PriorityMenu`, `TagPicker` y rediseño del panel.
6. [ ] Punto 5: preview de parseo en quick-add.
7. [ ] Punto 7: animación de completar y toast único.
8. [ ] Punto 10: atajos, contextual, selección múltiple.
9. [ ] Puntos 9, 11, 12: plan de hoy, vacíos, móvil.

## Verificación

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Manual (datos con prefijo `ZZ TEST`, borrar al terminar): crear "ZZ TEST reunión hoy 18:00 !alta" → debe verse en el grupo Alta con "18:00"; con 54 vencidas, el primer grupo visible es Alta; Hábitos sin datos muestra la tarjeta; el panel de detalle no usa `<select>` nativos (`rg "<select" apps/web/src/features/tasks/TaskDetail.tsx` solo en campos ocultos accesibles).
- Visual: comparar capturas antes/después a 1280px, 960px y 390px.

---

# PARTE 6

# Capítulo: notificaciones por Telegram en tick-tack-done

Capítulo autocontenido (numeración propia H-xx / NT-xx, sin dependencias de otros archivos): se puede pegar tal cual en el documento maestro. También sirve como anexo de la spec del agente Ticky (sección 9).

Fecha: 19 oct 2026, 15:30-16:00 (Madrid). Autor: Instinct. Documento para Cursor: cada hallazgo trae archivo, función y arreglo.

---

## 0. Commits y alcance

- **Desplegado**: `GET https://todo.reflexionia.com/api/v1/health` devuelve `d87e3fa`.
- **main**: `51dd55558cbf55d639e7002d70a8a134b38aa796` (19 oct 14:50, "fix(deploy): let nginx drop privileges in the web container (#37)").
- **Diff**: solo `deploy/production/docker-compose.yml` (+4 líneas de nginx). El código revisado en main es el mismo que el desplegado.
- **Método**: lectura de código en main + verificación en vivo solo de lectura (API con la sesión del propio Pablo). Sin escrituras, sin mensajes de Telegram de prueba, sin tocar tareas reales.

---

## 1. Resumen

**La tarea "Recoger a mis hijos a las 15:35" (vencimiento hoy 15:35) NO va a mandar ningún Telegram a las 15:30 ni a las 15:35.** Comprobado en vivo a las 15:28: `GET /api/v1/tasks/fa96e1a3-…/reminders` devuelve `[]` — no tiene ningún recordatorio.

Lo que hoy SÍ llega a Telegram (bot configurado y cuenta vinculada, verificado en vivo: `GET /api/v1/integrations/telegram` → `{configured: true, linked: true}`):

| Origen                                                          | ¿Llega a Telegram? | Vía                                              |
| --------------------------------------------------------------- | ------------------ | ------------------------------------------------ |
| Recordatorio de tarea (explícito o por defecto de cuenta/lista) | SÍ                 | `kind: 'task'` → `ReminderTransport`             |
| Resumen diario ("Planifica tu día", Pablo lo tiene a las 07:00) | SÍ                 | `kind: 'daily_digest'`                           |
| Recordatorio de hábito                                          | SÍ                 | `kind: 'daily_digest'` con `habit_id`            |
| Tarea con hora de vencimiento pero SIN recordatorio             | **NO**             | `kind: 'due_soon'`/`'overdue'` nunca se entregan |
| Aviso de vencida (overdue)                                      | **NO**             | igual                                            |
| Inicio/fin de foco (Pomodoro)                                   | **NO**             | los eventos existen, nadie los envía             |

El fallo principal está en `apps/api/src/scheduler/scheduler.service.ts`, función `fire()` (línea 583): solo las entregas `kind === 'task' || kind === 'daily_digest'` llaman a `this.transport.deliver(...)` (línea 602). Las señales `due_soon` y `overdue` entran por el `else`: se marcan como disparadas y graban un evento de dominio, pero **no envían nada a ningún canal**. Es decir: la app calcula "esta tarea vence pronto" y "esta tarea está vencida", y luego tira el aviso a la papelera.

---

## 2. Cómo funciona hoy el pipeline (archivo por archivo)

### 2.1 Planificador — `apps/api/src/scheduler/scheduler.service.ts`

- Arranca con la API (`SCHEDULER_AUTOSTART: 'true'` en `deploy/production/docker-compose.yml`), tick cada **60 s** (`TICK_MS`, línea 25). No usa BullMQ ni cron: es un `setInterval` dentro del proceso de la API.
- En cada tick (`run()`, línea 67):
  1. Materializa ocurrencias de tareas repetidas (`advanceCompleted`, `advanceDetached`), copiando checklist, etiquetas y **recordatorios** (`copyReminders`, línea 700).
  2. `enqueueReminders` (línea 281): para cada `Reminder` de tarea activa calcula `fireAt` (`reminderFireAt`, dominio) y encola una fila `ReminderDelivery` con `dedupeKey = reminder:{id}:{fireAt}`.
  3. `enqueueDigests` (línea 321): resumen diario por usuario con `dailyReminderTime`.
  4. `enqueueHabitReminders` (línea 340): recordatorios de hábitos.
  5. `enqueueSignals` (línea 493): para TODA tarea activa con `dueDate` en las próximas 24 h encola `due_soon` (con `fireAt` = vencimiento) o `overdue` (con `fireAt` = ahora). **Estas filas nunca se entregan** (ver `fire()`).
  6. `fire()` (línea 583): entrega lo vencido. Solo `task` y `daily_digest` pasan por el transporte. Marca `fired` o `late` y graba el resultado en `payload.delivery`.
- Deduplicación: `ReminderDelivery.dedupeKey` es `@unique` (`apps/api/prisma/schema.prisma`, línea 812); `queue()` (línea 535) salta si ya existe. Bien contra duplicados del planificador.
- Horizonte: se materializa hasta 48 h vista (`REMINDER_HORIZON_MS`, `packages/domain/src/reminders/trigger.ts`, línea 6). Un recordatorio cuya hora ya pasó se dispara **inmediatamente** en el siguiente tick (`reminderDisposition` devuelve `fire`; línea 221 de `trigger.ts`).

### 2.2 Transporte — `apps/api/src/scheduler/reminder.transport.ts`

- `deliver()` intenta **siempre** Telegram (línea 34), independientemente del `channel` (`push`/`email`/`both`) — el campo `channel` solo gobierna email y web push. Consecuencia práctica: cualquier recordatorio llega a Telegram si hay cuenta vinculada, aunque el recordatorio se creó con `channel: 'push'`.
- Telegram: `sendMessage` de texto plano con `title\nbody`, timeout 8 s (línea 94-117). Sin botones inline, sin formato, sin enlace a la tarea.
- **Sin reintentos**: si Telegram devuelve error o hay timeout, `fire()` marca la entrega como `fired` igualmente y guarda `delivery.telegram: 'failed'` solo como dato muerto en el payload. No hay cola de reintento ni estado `failed` consultable.
- Email: SMTP opcional; si no hay `SMTP_HOST` queda `skipped`. Web push: VAPID + suscripciones del navegador.

### 2.3 Creación de recordatorios — `apps/api/src/modules/tasks/tasks.service.ts`

- `ensureDefaultReminder` (línea 2004): al crear una tarea con fecha (línea 1473) crea un `Reminder` relativo con el trigger por defecto de la lista, y si no, el de la cuenta (Pablo: `-PT5M`, verificado en `GET /api/v1/me` → `default_reminder_trigger: "-PT5M"`). Las listas pueden heredar, poner otro o `'off'` (`resolveDefaultReminder`, `trigger.ts` línea 24).
- **Al editar solo se crea si la fecha pasa de `null` a tener valor** (línea 395-396). Cambiar la hora de una tarea que ya tenía fecha NO crea ni actualiza recordatorios.
- Al cambiar la fecha de una tarea que ya tenía recordatorio, el recordatorio relativo se re-ancla solo (se calcula desde `dueDate` en cada tick), **pero las entregas ya encoladas con la hora vieja no se borran**: solo se borran entregas programadas cuando se elimina el recordatorio explícitamente (`deleteReminder`, línea 1298) o se aplaza (línea 1334). Riesgo de aviso a la hora antigua.
- Completar una tarea tampoco cancela sus entregas programadas: `fire()` no mira el estado de la tarea. Puedes recibir el recordatorio de una tarea ya hecha.

### 2.4 La UI y su trampa — `apps/web/src/features/tasks/TaskDetail.tsx`

- `applyDate()` (línea ~143): al guardar una fecha compara el recordatorio del borrador del selector con el actual; si difieren **borra el recordatorio existente** (`api.deleteReminder`) y solo crea uno nuevo si el borrador trae uno (`next.reminder !== null`). Si el selector de fecha abre con el recordatorio en "ninguno" aunque la tarea tenga uno, **editar la fecha borra el recordatorio sin avisar**.
- El selector de fecha tampoco refleja la hora guardada en tareas `is_all_day: true` con hora (ver H-08): permite estados inconsistentes.

### 2.5 Bot de Telegram — `apps/api/src/modules/integrations/`

- `telegram-bot.service.ts`: comandos `/capturar /hoy /manana /semana /lista /nuevalista /hecho`; captura por texto, voz (si hay transcripción configurada; en vivo `voice: false`) y foto (funciona, `photo: true`). Las listas llevan botones inline `☐ título` (data `c:<id>`) para completar (`completeButton`, línea 202).
- **No hay aplazar (snooze) desde Telegram**: el endpoint existe (`POST /api/v1/tasks/:id/reminders/:reminderId/snooze`, `tasks.service.ts` línea 1302) pero el bot no lo expone.
- Los mensajes de recordatorio son texto plano sin botones: no se puede completar ni aplazar desde el propio aviso.
- La captura responde solo «Guardada: <título>.» Más avisos de lista o etiqueta. No confirma fecha, hora, prioridad ni etiquetas. El formato de confirmación y la metadata `{ capture: 'telegram' }` están en la Parte 8 (D2, D4, Q.8).
- Seguridad del webhook: `POST /api/v1/integrations/telegram/webhook` valida `TELEGRAM_WEBHOOK_SECRET` con comparación de tiempo constante (`integrations/telegram-secret.ts`). Bien.
- Vinculación: `POST /api/v1/integrations/telegram/link`; el chat queda en `telegramLinks` y el transporte usa el primer chat vinculado (`scheduler.service.ts` línea 591).

### 2.6 Foco (Pomodoro)

- Existen los eventos `focus.session_started@v1`, `focus.session_finished@v1`, `focus.session_aborted@v1` (`apps/api/src/events/domain-events.ts`, líneas 61-63). **Nada los escucha para Telegram**: no hay suscriptor que mande "foco iniciado/terminado" al bot.

### 2.7 Lo que NO existe

- **Horario de silencio (quiet hours)**: no hay nada en la API. La cadena `quietHours` de `apps/web/src/i18n/extra.ts` (línea 146) es solo la etiqueta del ajuste de la hora del resumen diario.
- **Reintentos**, **estado `failed` consultable**, **métricas** de entregas.
- **Cancelación** de entregas al completar/borrar tarea o cambiar fecha.
- **Aviso de vencida** por ningún canal.
- Preferencia por usuario para desactivar Telegram sin desvincular la cuenta.

---

## 3. El caso real de las 15:35, reconstruido con evidencia

Tarea: `fa96e1a3-3a04-4f58-abdc-189232a289c5` — "Recoger a mis hijos a las 15:35" (lista Bandeja de entrada, prioridad alta, etiqueta #cole). Fuente: `GET /api/v1/search?q=recoger`, `GET /api/v1/tasks/:id`, `GET /api/v1/tasks/:id/reminders` y el registro de actividad `GET /api/v1/projects/:id/activity` (todo en vivo, solo lectura, 19 oct 15:28-15:32).

| Hora (Madrid) | Evento                                                                                                                                                                                                                                                                                                                                                        | Evidencia                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 12:31:45      | Creada, **todo el día**, vencimiento 19 oct 00:00 local (`2026-10-18T22:00:00Z`). El título dice "a las 15:35" pero el NLP no parsea hora sin palabra de fecha                                                                                                                                                                                                | actividad `created`                                                                       |
| 12:31:57      | El recordatorio por defecto (-5 min, anclado a medianoche = ya pasado) **se dispara 12 s después de crearla**. El transporte intentó Telegram; si llegó, fue un aviso a las 12:32 de algo de las 15:35                                                                                                                                                        | actividad `status: fired`                                                                 |
| 12:32:31-32   | Pablo edita la hora varias veces (00:00 → 01:00 → 15:00 → 15:03 local). En esa ventana de edición el recordatorio desapareció (hoy la tarea no tiene ninguno). El mecanismo consistente con la evidencia es `applyDate` (H-04): editar fecha con el selector sin recordatorio pre-seleccionado borra el existente; no se descarta que Pablo lo quitara a mano | 3 eventos `updated` con `due_date` cambiando; reminders ahora `[]`                        |
| (después)     | Vencimiento final: `2026-10-19T13:35:00Z` = **15:35 local**. `is_all_day` sigue en `true` aunque tiene hora                                                                                                                                                                                                                                                   | `GET /tasks/:id`                                                                          |
| 15:28         | **Cero recordatorios en la tarea**                                                                                                                                                                                                                                                                                                                            | `GET /tasks/:id/reminders` → `[]`                                                         |
| 15:35:14      | El planificador graba `status: fired` (la señal `due_soon`) 14 s después del vencimiento. **No se envía nada: ni Telegram, ni push, ni email**                                                                                                                                                                                                                | evento de actividad en vivo `2026-10-19T13:35:14Z`; comportamiento confirmado en `fire()` |

#### 3.1 Cadena de fallos (cada uno es un hallazgo)

1. **H-01**: las señales `due_soon`/`overdue` no se entregan (el fallo estructural: una tarea con hora y sin recordatorio no avisa por ningún canal).
2. **H-02**: el NLP de captura rápida no entiende hora suelta ("a las 15:35") sin palabra de fecha; la tarea quedó "todo el día" (`packages/domain/src/nlp/parse.ts`: todo matcher de hora cuelga de un matcher de fecha; no hay matcher de hora desnuda). El mismo parser tampoco asocia una hora cuando hay palabras entre la fecha y la hora ("mañana … a las 16:00" quedó todo el día). Gramática, confirmación del bot y casos dorados: Parte 8.
3. **H-03**: crear una tarea con fecha ya pasada dispara su recordatorio inmediatamente (`reminderDisposition` → `fire`); no hay regla "si la hora calculada ya pasó, no avises".
4. **H-04**: `applyDate` en la web borra el recordatorio al editar fecha si el selector no lo trae pre-seleccionado.
5. **H-05**: cambiar la fecha de una tarea con fecha no recrea el recordatorio por defecto (solo se crea en transición `null → fecha`).
6. **H-06**: la tarea quedó `is_all_day: true` con hora (`13:35Z`): la UI no quita el flag de todo el día al poner hora.
7. **H-07**: las entregas ya encoladas no se regeneran al cambiar la fecha ni se cancelan al completar la tarea.

---

## 4. Tabla de hallazgos

| ID   | Sev      | Hallazgo                                                                                                                | Archivo                                                                   |
| ---- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| H-01 | **Alta** | `due_soon`/`overdue` nunca se entregan: solo graban evento                                                              | `scheduler.service.ts` `fire()` línea 602                                 |
| H-02 | Alta     | NLP no parsea hora suelta ("a las 15:35") ni hora separada de la fecha ("mañana … a las 16:00"). Spec completa: Parte 8 | `packages/domain/src/nlp/parse.ts`                                        |
| H-03 | Media    | Recordatorio anclado en el pasado dispara al instante de crear la tarea                                                 | `trigger.ts` `reminderDisposition` línea 221                              |
| H-04 | Alta     | La web borra el recordatorio al editar la fecha                                                                         | `TaskDetail.tsx` `applyDate` línea ~165                                   |
| H-05 | Alta     | Editar fecha (fecha→fecha) no crea recordatorio por defecto                                                             | `tasks.service.ts` línea 395                                              |
| H-06 | Media    | `is_all_day: true` con hora es un estado inconsistente permitido                                                        | `tasks.service.ts` + selector de fecha web                                |
| H-07 | Alta     | Entregas programadas no se cancelan al completar/borrar/cambiar fecha                                                   | `scheduler.service.ts` `fire()` línea 585 (sin filtro de estado de tarea) |
| H-08 | Media    | Sin reintentos: un fallo de Telegram se marca `fired` y se pierde                                                       | `scheduler.service.ts` `fire()` + `reminder.transport.ts`                 |
| H-09 | Media    | Sin aviso de "vencida" (overdue) por ningún canal                                                                       | `scheduler.service.ts`                                                    |
| H-10 | Media    | Sin botones Hecho/Aplazar en el mensaje de recordatorio                                                                 | `reminder.transport.ts` línea 94                                          |
| H-11 | Baja     | Sin horario de silencio                                                                                                 | API (no existe)                                                           |
| H-12 | Baja     | Foco inicio/fin no avisa por Telegram pese a tener eventos                                                              | `domain-events.ts` líneas 61-63                                           |
| H-13 | Baja     | `channel: 'push'` es engañoso: Telegram se intenta siempre; no hay opt-out por recordatorio ni por usuario              | `reminder.transport.ts` línea 34                                          |

---

## 5. Spec: notificaciones Telegram fiables (NT-xxx)

Convención como en specs anteriores: requisitos numerados, cada uno con criterio de aceptación testeable. Prioridad: P0 arregla el caso de Pablo; P1 lo hace cómodo; P2 lo hace completo.

### NT-01 (P0) Entregar las señales de vencimiento

En `fire()`, los `kind: 'due_soon'` y `'overdue'` deben pasar por `transport.deliver` igual que `task`:

- `due_soon` (dispara en la hora de vencimiento): texto `⏰ {título}` / `Vence ahora ({hora local})`.
- `overdue` (una vez, al cruzar el vencimiento): texto `⚠️ Vencida: {título}` / `Venció a las {hora local}`.
- Respetar el mismo dedupe actual (`{kind}:{taskId}:{due}`), que ya evita repeticiones.
- Criterio: tarea activa con hora y sin recordatorio → llega Telegram a la hora de vencimiento. Tarea con recordatorio a -5 min → llega el de -5 min Y el de vencimiento (son avisos distintos y útiles), sin duplicados.

### NT-02 (P0) Recordatorio automático para tareas con hora

Regla de producto: **toda tarea con hora de vencimiento tiene aviso**, aunque el usuario no pida recordatorio. Implementación preferida: NT-01 ya lo cubre (la señal `due_soon` ES el aviso a la hora), así que no hace falta crear filas `Reminder` extra. No duplicar: si existe un `Reminder` con trigger `-PT0M`, la señal `due_soon` de esa tarea se salta (dedupe semántico, no solo por clave).

- Criterio: crear "ZZ TEST x a las 19:00" (con NT-03) → Telegram a las 19:00 exactas (±60 s, el tick).

### NT-03 (P0) NLP de captura: hora, fecha separada y desplazamientos

El alcance estrecho original (un matcher de hora desnuda, y «a las 3 y media» como opcional) queda sustituido por la Parte 8. Implementar NT-03 es implementar el Capítulo Q entero: hora suelta, día de semana, sufijos de mañana/tarde/noche, `am`/`pm`, mediodía y medianoche, desplazamientos (`en 2 horas`, `dentro de 3 días`), asociación de una fecha y una hora aunque haya texto entre medias, reglas de DST, confirmación del bot y metadata `{ capture: 'telegram' }`.

«a las 3 y media» no forma parte de la gramática. No implementarlo.

El caso de las 15:35 sigue cubierto por la hora suelta de Q.5: sin palabra de fecha, si la hora de hoy aún no pasó → hoy; si pasó → mañana; `isAllDay: false`.

- Criterio mínimo que sigue vigente: `parseQuickAdd('recoger a mis hijos a las 15:35', 'es', {now: hoy 12:00 Europe/Madrid})` → `due.date` = hoy 15:35 local, `isAllDay: false`.
- Criterio completo, casos dorados y aceptación: Q.9 y Q.10.

### NT-04 (P0) No disparar recordatorios anclados en el pasado

Si `fireAt` calculado quedó en el pasado en el momento de encolar (tarea recién creada con fecha pasada, o default que ancla a medianoche), no encolar; en su lugar, si la tarea sigue activa y su vencimiento es futuro, encolar para el vencimiento (equivale a `due_soon`). Si el vencimiento también pasó, no avisar nada (la tarea aparecerá como vencida en la UI).

- Criterio: crear a las 12:31 una tarea "todo el día" para hoy → ningún Telegram inmediato; el aviso llega solo si se pone hora futura.

### NT-05 (P0) Cancelar entregas al completar, borrar o cambiar fecha

- Al completar/archivar/borrar tarea: `reminderDelivery.deleteMany({ taskId, status: 'scheduled' })` en la misma transacción del cambio de estado.
- Al cambiar `dueDate`: borrar entregas `scheduled` de los recordatorios de la tarea y de las señales (`dedupeKey` con la fecha vieja); el siguiente tick re-encola con la fecha nueva.
- Defensa adicional en `fire()`: antes de entregar, releer la tarea; si está completada/borrada o su `dueDate` ya no coincide con el del payload, marcar `cancelled` (nuevo estado) y no enviar.

### NT-06 (P0) La web no borra recordatorios al editar fecha

En `TaskDetail.tsx` `applyDate()`: el borrador del selector debe inicializarse con el recordatorio actual de la tarea (ya se carga: query `['reminders', taskId]`), de modo que "sin cambio" = no toca nada. Solo borra si el usuario elige explícitamente "sin recordatorio". Test de componente + e2e Playwright: editar hora de una tarea con recordatorio → el recordatorio sigue existiendo (GET reminders).

### NT-07 (P0) Editar fecha (fecha→fecha) mantiene o recrea el aviso

Si la tarea tenía recordatorio por defecto y la fecha cambia, el relativo se re-ancla solo; con NT-05 las entregas viejas se cancelan. Si la tarea no tenía recordatorio (porque H-04 lo borró en su día), no hace falta recrear filas históricas: NT-01/NT-02 garantizan el aviso a la hora.

### NT-08 (P1) Botones inline en el aviso: Hecho / Aplazar

`sendMessage` con `reply_markup.inline_keyboard`: `✅ Hecho` (data `c:{taskId}`, reutiliza `completeButton` existente) y `😴 +10 min`, `😴 +1 h`, `😴 Esta tarde` (data `s:{deliveryId}:{minutos}`). Handler `snoozeButton`: si la entrega tiene `reminderId`, actualiza `snoozedUntil` (`snoozeReminder` ya existe); si es señal `due_soon` sin recordatorio, crea un `Reminder` absoluto a `now+min` o reprograma una entrega única. Tras actuar, `answerCallbackQuery` + editar el mensaje tachando el aviso.

- Criterio: desde el Telegram del recordatorio se puede completar (la tarea queda hecha en la web) y aplazar 10 min (llega otro aviso a los 10 min, una sola vez).

### NT-09 (P1) Reintentos con backoff y estado visible

- Nuevo estado `failed` en `ReminderDelivery`. Si `delivery.telegram === 'failed'`: reintento a +1 min, +5 min, +15 min (máx. 3). Campo `attempts` y `nextRetryAt`; el tick las recoge con `status: 'failed' AND nextRetryAt <= now`.
- `GET /api/v1/me/notifications/health` (o sección en Ajustes → Notificaciones): últimas 20 entregas con canal y resultado. Sirve para depurar sin entrar a la base de datos.

### NT-10 (P1) Horario de silencio

`User.quietHoursStart/quietHoursEnd` (hora local, opcional). En `fire()`: si la hora local del usuario cae en silencio, las entregas no críticas se posponen al fin del silencio (mismo `dedupeKey`, `fireAt` movido). Definir qué es crítico: nada por defecto (todo posponible); documentar la decisión. Ajuste en Ajustes → Notificaciones.

### NT-11 (P1) Avisos de foco por Telegram

Suscriptor de `focus.session_started@v1` / `focus.session_finished@v1` / `focus.session_aborted@v1` (mismo patrón que `event-router.ts` ya usa para otros consumidores) que envíe por `TelegramApi`: `🍅 Foco iniciado: {título} ({minutos} min)` / `✅ Foco terminado: {título}`. Ajuste `focus_notifications: on/off` en Ajustes → Notificaciones, por defecto ON (Pablo lo pidió).

### NT-12 (P2) Control de canal fino

Hoy Telegram se intenta siempre. Añadir `telegram_enabled` por usuario (desactivar sin desvincular) y respetar `channel` en serio, o renombrar el campo a lo que hace (canales email/push) y documentar que Telegram es ortogonal. Decisión abierta pequeña; no bloquea P0/P1.

### NT-13 (P2) Higiene `is_all_day`

- API: rechazar o normalizar `is_all_day: true` con hora distinta de medianoche local (400 `validation_failed` con mensaje claro, no el error crudo de Prisma ya reportado en la auditoría UX).
- Web: al escribir una hora en el selector, quitar el flag "todo el día" automáticamente.

### NT-14 (P2) Resumen de vencidas

Una vez al día (junto al resumen de las 07:00 o a una hora configurable), listar las vencidas sin completar. Hoy `overdue` dispara una vez por tarea y se olvida.

---

## 6. Cambios de código propuestos (guía para Cursor)

1. `apps/api/src/scheduler/scheduler.service.ts`
   - `fire()`: sacar `due_soon`/`overdue` del `else` y entregarlos por el transporte con su propio texto (NT-01). Antes de entregar, releer la tarea y cancelar si completada/borrada/fecha cambiada (NT-05).
   - `fire()`: si resultado `failed`, programar reintento (NT-09).
   - `queue()`: no encolar `fireAt` pasado salvo señal de vencida (NT-04).
   - `enqueueSignals`: saltar `due_soon` si la tarea tiene un `Reminder` con trigger `-PT0M` (NT-02, anti-duplicado semántico).
   - `fire()`: horario de silencio (NT-10).
2. `apps/api/src/modules/tasks/tasks.service.ts`
   - `complete`/`delete`/`archive`: cancelar entregas `scheduled` de la tarea en la misma transacción (NT-05).
   - `update`: si cambia `dueDate`, borrar entregas `scheduled` de sus recordatorios (NT-05/NT-07).
3. `apps/api/src/scheduler/reminder.transport.ts`
   - `sendMessage` con `reply_markup` opcional (NT-08); devolver `message_id` para poder editar el mensaje al actuar.
4. `apps/api/src/modules/integrations/telegram-bot.service.ts`
   - Handler de callbacks `s:{deliveryId}:{min}` para aplazar (NT-08), reutilizando `snoozeReminder`.
5. `packages/domain/src/nlp/parse.ts` + `parse.spec.ts`, y la respuesta de `TelegramBotService.capture()`
   - Gramática completa de la Parte 8 (NT-03 ampliado): hora suelta, asociación fecha-hora con texto entre medias, días de semana, sufijos, desplazamientos y DST. Casos dorados de Q.9. Confirmación del bot (Q.8) y metadata `{ capture: 'telegram' }`.
6. `apps/web/src/features/tasks/TaskDetail.tsx`
   - `applyDate()`: inicializar el recordatorio del borrador desde el actual; solo borrar con elección explícita (NT-06). Al poner hora, `allDay = false` (NT-13).
7. `apps/api/src/modules/focus/` (o un `focus-notifications.listener.ts` en `scheduler` o `integrations`)
   - Suscripción a los 3 eventos de foco y envío por `TelegramApi` (NT-11).
8. Prisma: `ReminderDelivery.status` añade `failed` y `cancelled`; campos `attempts`, `nextRetryAt` (NT-09, NT-05). Migración con valores por defecto, sin tocar filas viejas.

## 7. Tests

- **Dominio** (`parse.spec.ts`, `trigger` spec): tabla dorada de la Parte 8 (Q.9), ancla `2026-10-19T14:39:00.000Z` / `Europe/Madrid`; disposición sin pasado inmediato (NT-03, NT-04).
- **API** (Vitest, patrón existente con `SCHEDULER_AUTOSTART=false` y `run(now, false)` manual): señal `due_soon` entrega Telegram (transporte mockeado); completar cancela; cambiar fecha regenera; fallo → 3 reintentos y para; silencio pospone; `-PT0M` + señal no duplica (NT-01/02/05/09/10).
- **Bot**: callback `s:` crea el aplazamiento y edita el mensaje (NT-08); foco manda mensaje (NT-11); la captura confirma fecha, prioridad, etiquetas y lista (Q.8).
- **E2E manual** (con prefijo ZZ TEST y borrado después): crear "ZZ TEST aviso a las HH:MM" con hora a +3 min desde la web y desde Telegram → llega un solo Telegram a la hora; completar desde el botón; aplazar +10 min y verificar el segundo aviso; crear otra ya pasada → ningún aviso inmediato.

## 8. Plan por fases

- **Fase 1 (P0, la que necesita Pablo ya)**: NT-01, NT-02, NT-03 con la gramática completa de la Parte 8 (no solo la hora suelta), NT-04, NT-05, NT-06, NT-07. Resultado: la captura entiende fecha y hora en los cuatro canales, el bot confirma lo interpretado, y cualquier tarea con hora avisa por Telegram a su hora; sin disparos fantasmas ni avisos perdidos por editar.
- **Fase 2 (P1)**: NT-08 botones, NT-09 reintentos, NT-10 silencio, NT-11 foco.
- **Fase 3 (P2)**: NT-12 canal fino, NT-13 all-day, NT-14 resumen de vencidas.

## 9. Anexo para la spec de Ticky (agente)

Lo que el agente puede asumir una vez cerrada la Fase 1:

- **Contrato de avisos**: toda tarea con hora genera Telegram a su hora; Ticky no necesita duplicar recordatorios propios para tareas con hora. Para recordatorios "inteligentes" (contexto, prioridad, tono), Ticky crea `Reminder` absolutos vía `POST /api/v1/tasks/:id/reminders` (scope `reminders:write`) y la plataforma los entrega — el agente no habla con Telegram directamente.
- **Eventos para proactividad**: `task.due_soon`, `task.overdue`, `reminder.fired`, `focus.session_*` ya se graban como eventos de dominio; Ticky los consume por webhooks salientes (`/api/v1/webhooks`, módulo `modules/webhooks`) o por `GET /api/v1/events/stream`, no sondeando la base de datos.
- **Acciones desde el aviso**: completar y aplazar quedan en la plataforma (botones NT-08). Ticky no reimplementa snooze; si quiere reprogramar, usa la API de tareas.
- **Bloqueos conocidos para automatización (ya reportados)**: la sync por cursor compone dos condiciones `OR` que se pisan, y `tasks:write` no tiene separación fina por acción; conviene resolverlos antes de que Ticky escriba a ritmo alto.
- **Guardarraíl de pruebas**: todo dato de prueba con prefijo `ZZ TEST` y borrado al terminar; las tareas reales de Pablo no se tocan.

---

## 10. Limpieza

Sin datos de prueba creados: toda la verificación en vivo fue de lectura (`GET` sobre sesión propia). No se envió ningún mensaje de Telegram de prueba (requeriría avisar a Pablo primero). Nada que limpiar.

---

# PARTE 7

# Capítulo P. Plan de hoy y asistente "Planifica tu día"

Verificación: lunes 19 de octubre de 2026, 15:33-15:35, Europe/Madrid. Capítulo autocontenido para integrar en el documento maestro y ejecutar con Cursor.

## P.1. Evidencia y alcance

**Actual, verificado:** lectura del código de main; lectura autenticada de Hoy, Revisión, API de propuesta diaria y salud; manifest y registro del service worker.

**Diseño nuevo:** asistente de pantalla completa, decisiones en borrador, resumen editable, plan persistente y razones de sugerencias. Estos elementos no se presentan como existentes.

**No probado:** instalación Android/iOS, PWA standalone, offline real, push, suspensión y recuperación de PWA, interacción táctil del producto actual y el nuevo asistente, que aún no existe.

Repositorio: https://github.com/povedica/tick-tack-done/

| Entorno    | Commit comprobado                                                   | Evidencia                                        |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------ |
| main       | `51dd55558cbf55d639e7002d70a8a134b38aa796`                          | Clonación e historial Git                        |
| Desplegado | `d87e3fa`, resuelto como `d87e3faacc4b515906349e7634c7dbd310d57d43` | GET `/api/v1/health`: status ok y commit d87e3fa |

Entre ambos solo difieren cuatro líneas de `cap_add` en `deploy/production/docker-compose.yml`, no el código de producto examinado.

Páginas realmente abiertas:

- https://todo.reflexionia.com/today?group=priority
- https://todo.reflexionia.com/review

Solo se hicieron lecturas y navegación. No se pulsó Aceptar plan, no se tocaron tareas reales, no se crearon datos de prueba ni se enviaron mensajes de Telegram. No hay limpieza pendiente. Las cuatro capturas aportadas por Pablo se inspeccionaron como referencia de interacción. Las decisiones siguientes son propuestas propias del producto, no atribuciones de funcionalidades no comprobadas a otra aplicación.

## P.2. Cómo funciona hoy "Plan de hoy"

### P.2.1. Algoritmo real

`TodayPage.tsx` consulta `api.reviewDaily()`: GET `/api/v1/review/daily`. El controlador carga tareas no borradas del propietario y llama a `proposeDaily` del dominio con filtros `null`.

Es determinista: no usa LLM, no interpreta el significado de las tareas, no comprueba la agenda ni la capacidad del día.

```text
Prioridad: alta=4, media=3, baja=1, ninguna=0.
Vencimiento anterior al instante actual: +8.
Si no está vencida y vence en próximas 24 horas: +5.
Sin fecha o fecha posterior: solo prioridad.

Solo status active; descartar puntuación 0.
Ordenar puntuación descendente.
Empate: UUID ascendente por localeCompare.
Devolver máximo 7 IDs.
```

Una alta vencida hace meses vale 12; una alta que vence en cinco minutos vale 9. La antigüedad de la deuda, duración, contexto, significado y compromisos de hoy no desempatan. Una alta sin fecha o de dentro de meses puede entrar con 4 puntos si hay plazas. La ventana es móvil de 24 horas, no el día civil de Madrid.

### P.2.2. Por qué eligió esas cinco

La respuesta real contenía siete tareas activas, vencidas y de prioridad alta: **12 puntos cada una**. Su orden en el API se explica por ID:

| Orden API | Tarea                                                        | Inicio ID  | Vencimiento Madrid  | Puntos |
| --------- | ------------------------------------------------------------ | ---------- | ------------------- | ------ |
| 1         | Moto · Revisión preventiva pre-Picos (checklist mecánica)    | `03ba7b83` | 20 jun 2026, 12:00  | 12     |
| 2         | 29/08 Cumple de Iñigo De Torres Lopez-Acedo                  | `0ca36be7` | 29 ago 2026, 00:00  | 12     |
| 3         | Moros · Pagar cuartelillo Lechuguinos                        | `1878f3c7` | 15 may 2026, 12:00  | 12     |
| 4         | 12/09 Cumple de Mercedes Cotelo Lois                         | `40a91708` | 12 sept 2026, 00:00 | 12     |
| 5         | Mi momento: planificación y orden personal #personal #review | `5251fbcb` | 19 may 2026, 12:00  | 12     |
| 6         | lista de compra y compra Online #casa #personal #plan #30min | `70186da4` | 17 abr 2026, 14:00  | 12     |
| 7         | Picos · Ruta día a día v1 en planning.md                     | `94f314f9` | 7 jun 2026, 12:00   | 12     |

La UI recorta esos IDs a cinco con `planTaskIds()`. Después filtra el array cargado para Hoy y conserva su orden, no el ranking del API. Las vencidas se cargan por fecha. Por eso en pantalla aparecen Moros, Mi momento, Moto, Iñigo y Mercedes, en ese orden.

**No significa que sean las cinco tareas más convenientes para Pablo hoy.** Son cinco miembros de un empate técnico y su presentación vuelve a ordenarse después.

La tarea real "Recoger a mis hijos a las 15:35" tenía estado activo, prioridad alta y `due_date=2026-10-19T13:35:00.000Z`, equivalente a 15:35 Madrid. Antes de esa hora puntúa 9 y pierde frente a las altas vencidas de 12. Este capítulo no determina si llegó su aviso: el circuito de Telegram se debe verificar por separado.

### P.2.3. Qué hace Aceptar plan

Guarda el día del navegador en `localStorage["tick-tack-done.plan.accepted"]` y oculta el bloque. Después ofrece el enlace a `/review`.

No cambia fechas, no marca tareas para hoy, no guarda selección en servidor, no reserva tiempo y no sincroniza un plan entre dispositivos. La etiqueta promete más de lo que hace. La clave tampoco incluye usuario. El estado se inicializa al montar la pantalla: revisar cambio de día con la app abierta y cambio de cuenta.

### P.2.4. Qué hay en Planificar mi día

`/review`, `/review/daily` y `/review/weekly` usan el `ReviewPage` de `features/product/ProductPages.tsx`. La pantalla activa se titula "Revisión semanal" y presenta contadores, no un wizard. En la lectura estable: propuestas 7, vencidas 57, sin fecha 29, listas en silencio 0, hábitos en riesgo 0.

Hay otro `ReviewPage` en `features/places/Places.tsx`, pero el router no importa ese componente. No implementar ahí por error.

No equiparar automáticamente contadores de revisión y Hoy: usan universos distintos. Hoy carga tareas principales y filtra `kind=task`; la consulta de revisión es más amplia. Unificar elegibilidad de notas, subtareas y listas antes de prometer cifras equivalentes.

### P.2.5. Correcciones necesarias

| ID    | Defecto                             | Corrección                                                     |
| ----- | ----------------------------------- | -------------------------------------------------------------- |
| P-B01 | API 7, UI 5                         | Un solo contrato de límite y total, Ver todas                  |
| P-B02 | Empate por UUID                     | Razón por tarea y desempate significativo                      |
| P-B03 | Backlog desplaza citas de hoy       | Compromisos con hora en sección fija                           |
| P-B04 | UI cambia ranking                   | Consumir filas completas ordenadas                             |
| P-B05 | Aceptar solo oculta                 | Mientras no haya plan real: "Ocultar sugerencias hoy"          |
| P-B06 | Mezcla con array de Hoy             | No perder sugerencias fuera de Hoy ni mostrar IDs como títulos |
| P-B07 | Sin edición ni razones              | Tarjetas y resumen                                             |
| P-B08 | Diario lleva a contadores semanales | Separar rutas y títulos                                        |
| P-B09 | Fallo puede parecer vacío           | Error, carga y vacío distintos                                 |
| P-B10 | Distintos conteos                   | Contrato común de elegibilidad                                 |

## P.3. Decisiones de producto

1. El usuario decide; las sugerencias explican por qué.
2. Atrás y Deshacer están siempre disponibles durante la revisión.
3. Toda decisión de tarjeta es un **borrador**. Las tareas solo cambian después de revisar el resumen y pulsar Aplicar.
4. Descartar una revisión no cambia tareas.
5. "La haré hoy" expresa intención de trabajo; no cambia su vencimiento.
6. No hay borrado definitivo desde el asistente.
7. Funciona sin Ticky y con cero tokens. Ticky es un proveedor futuro de sugerencias.
8. La sesión puede pausarse y recuperarse. No obliga a clasificar todo el backlog.

## P.4. Entrada, alcance y orden

### P.4.1. Accesos

Botón visible "Planifica tu día" en Hoy, entrada en su menú y paleta de comandos. "Sugerencias para hoy" es otra acción, no un sinónimo. Ruta nueva propuesta `/plan/day`. Mantener revisión semanal aparte en `/review/weekly`. No esconder la entrada tras el icono de Hábitos.

### P.4.2. Pantalla inicial

```text
Planifica tu día                                  [Cerrar]
Revisa tus tareas y vuelve atrás cuando quieras.

[x] Compromisos y tareas de hoy          8
[x] Tareas vencidas                     47
[ ] Bandeja sin fecha                   12
[ ] Otras tareas sin fecha              16

Revisar: todas / bloque de 10 / elegir listas
Día [fecha civil]       Zona Europe/Madrid

Nada cambia hasta revisar el resumen y pulsar Aplicar.
[Continuar sesión anterior]             [Comenzar]
```

Las cifras de wireframes son ilustrativas. Los totales reales vienen del servidor y se deduplican por tarea/ocurrencia.

Elegibilidad:

- Activas, no borradas, visibles y editables. Excluir notas y proyectos archivados de las tarjetas accionables.
- Hoy por fecha civil del plan; las horas pasadas de hoy siguen en Hoy con indicador específico.
- Vencidas antes del inicio de hoy. Bandeja y sin fecha son opt-in.
- Subtareas: no duplicar padre e hijos por defecto; mostrar progreso y expansión. Completar padre requiere decidir sobre hijos según dominio.
- Repetidas: una ocurrencia concreta; no aplicar a toda la serie implícitamente.
- Cola y orden congelados al empezar. Cambios externos se anuncian, no hacen saltar tarjetas.
- Paginación con total/fin conocido; no truncar silenciosamente por un límite de páginas.

Orden propuesto:

1. Hoy con hora, hora ascendente, incluyendo horas pasadas.
2. Hoy de día completo, prioridad y orden manual.
3. Vencidas, prioridad, vencimiento ascendente, orden manual e ID como último desempate.
4. Bandeja/sin fecha elegidas, prioridad y creación.

Un límite de revisión no esconde compromisos de Hoy ni falsea totales: "Revisarás 10 de 47 vencidas; las demás no cambiarán". Permitir cambiar de sección o saltar sin decidir.

## P.5. Tarjeta y diseño responsive

### P.5.1. Desktop

```text
[Salir] Planifica tu día     4 de 18 · 3 decisiones    [Historial]
[Hoy 3/5] [Vencidas 0/10] [Bandeja 0/3]   =====--------

[Anterior]   +------------------------------------+    [Saltar]
             | HOY · 15:35 · Europe/Madrid         |
             | Bandeja             Prioridad alta |
             | Recoger a mis hijos                |
             |                                    |
             | Motivo: vence hoy a las 15:35       |
             | [Detalles y recordatorio]          |
             +------------------------------------+

[Listo] [La haré hoy] [Después v] [No lo haré] [Más v]

Borrador: tus tareas no han cambiado.           [Resumen]
[Deshacer última decisión]                [Guardar y salir]
```

Pantalla completa dentro de la aplicación, tarjeta central legible de unos 640-800 px si hay espacio, historial lateral opcional. Mantener estilo del producto. Eliminar va en Más, no pegado a la acción principal.

### P.5.2. Móvil / PWA

```text
[X] Planifica tu día                         [Historial]
4 de 18 · 3 decisiones                       =====----
Hoy con hora
+----------------------------------------------------+
| Hoy · 15:35                              Alta      |
| Bandeja                                            |
| Recoger a mis hijos                                |
| Vence hoy a las 15:35                               |
| [Detalles y recordatorio]                          |
|            contenido con scroll propio             |
+----------------------------------------------------+
[Anterior]                                   [Saltar]
[Listo]                    [La haré hoy]
[Después v]                [Más v]
Borrador                         [Resumen: 3 cambios]
```

Usar `100dvh` con fallback y `env(safe-area-inset-*)`. Acciones por encima del área segura inferior y objetivos de al menos 44 × 44 CSS px. No comprimir cinco etiquetas largas en una sola fila. El teclado virtual no tapa la acción activa.

Mostrar título completo ajustado, lista, prioridad en texto, etiquetas relevantes, vencimiento original y zona, repetición, checklist y recordatorios. Contenido largo contraído con Ver detalle, Markdown/HTML saneado. Fecha absoluta además de días en vencidas antiguas. Motivo verificable de aparecer en cola, separado de una sugerencia opcional. No afirmar "importante para ti" sin fundamento.

## P.6. Acciones y efectos exactos

| Acción                         | Borrador y efecto al aplicar                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Listo                          | Completar tarea/ocurrencia mediante servicio de dominio; resolver hijos si hace falta       |
| La haré hoy                    | Añadir a Mi plan de hoy; NO tocar `due_date`                                                |
| Después → Mañana               | Retirar de plan actual y planificar mañana; NO cambiar vencimiento salvo elección explícita |
| Después → Esta semana          | Elegir día concreto; no asignar viernes por defecto                                         |
| Después → Elegir fecha         | Elegir fecha de trabajo; operación separada para cambiar vencimiento                        |
| Después → Sin fecha de trabajo | Quitar del plan; conservar vencimiento y alertas, avisando de que puede seguir vencida      |
| Cambiar vencimiento            | Mostrar antes/después y efecto sobre alertas, luego actualizar y recalcular jobs            |
| No lo haré                     | Cancelar, no completar; motivo opcional y fuera de métricas de éxito                        |
| Eliminar                       | Proponer papelera con confirmación; nunca purga                                             |
| Mover de lista                 | Elegir destino permitido y validar campos afectados                                         |
| Cambiar prioridad              | Ajuste auxiliar; no decide automáticamente la tarjeta                                       |
| Posponer aviso                 | Cambiar un recordatorio, no la fecha límite ni el plan                                      |
| Saltar por ahora               | Ningún cambio de tarea                                                                      |
| Abrir detalle                  | Inspección; cualquier edición debe integrarse en este borrador                              |

Hoy distinguirá **Mi plan de hoy**, **Vence hoy** y **Vencidas**. Una tarea puede llevar varios indicadores, pero no duplicarse en una lista fusionada.

"Después" necesita destino. "No lo haré" no equivale a Listo ni Eliminar. El modelo actual usa active/completed/archived: cancelación exige migración, SDK, consultas y KPIs. No simularla marcando completada.

Repeticiones: "Esta ocurrencia" visible; "Toda la serie" como acción avanzada separada. Planificar un aniversario hoy no lo mueve de fecha. No inferir repetición por el título; usar campos estructurados.

## P.7. Atrás y deshacer reales

Antes de aplicar:

- Acción principal genera comando en borrador y avanza.
- Anterior abre tarjeta previa con su decisión editable.
- Deshacer elimina el último comando activo y vuelve a su tarjeta.
- Historial con todas las decisiones, antes/después y Editar/Quitar.
- Prioridad/lista pueden componerse con la decisión principal. Operaciones incompatibles se sustituyen, no se acumulan.
- Cambiar Listo por Hoy quita el completado propuesto.
- Resumen editable sin temporizador de caducidad de undo.

Después de aplicar, ofrecer Revisar cambios y Revertir cambios seleccionados **solo cuando sea seguro**, como nueva operación validada. No sobreescribir la tarea completa con una copia antigua. Revertir únicamente campos propios cuyo estado/versiones sigan coincidiendo. Si otro dispositivo/agente cambió algo, mostrar conflicto y diferencias.

Completar puede avanzar recurrencias. `uncomplete` actual puede devolver `series_already_advanced` si ya existe sucesora activa. No prometer undo genérico: diseñar compensación específica o mostrar la limitación. Nunca borrar sucesoras modificadas para fingir una reversión.

Un mensaje de Telegram ya enviado no se des-envía al revertir datos. No reemitir avisos antiguos por deshacer.

## P.8. Resumen y aplicación

```text
Tu revisión                               [Volver a tarjetas]
Para hoy                   6 tareas       [Reordenar]
Completadas propuestas     2              [Editar]
Para otro día              4              [Editar]
Canceladas                 1              [Editar]
A papelera                 1              [Editar]
Sin cambios                4              [Ver]

Avisos afectados: 2 reprogramados, 1 cancelado.
Fechas límite modificadas: 1.             [Antes/después]
[Guardar borrador] [Descartar] [Aplicar 8 cambios]
```

Cifras ilustrativas. Contar tareas afectadas y detallar comandos para no inflar el total por múltiples campos.

- Reordenar Para hoy por arrastre y botones Subir/Bajar.
- Duración solo si existe o la introduce el usuario; no inventar minutos.
- Capacidad opcional; sin agenda actual, decir "sin comprobar agenda".
- Resumen generado desde comandos validados, no un texto libre de LLM.
- Revalidar permisos, versiones, existencia y fecha del plan en servidor.
- Ante conflicto, no aplicar subconjunto silencioso: resolver o excluir explícitamente y revisar el resumen nuevo.
- Cambios de datos atómicos en transacción, con tamaño acotado. Ninguna llamada externa dentro de la transacción.
- Outbox tras commit para integraciones, con deduplicación y estado de entrega separado.
- Si se pierde respuesta, consultar operation ID. No asumir resultado ni duplicar.
- Tras éxito mostrar resultado persistido y refrescar Hoy, listas, contadores, detalle, calendario y revisión.
- Fallo de Telegram: "Plan guardado; aviso pendiente/error", no falsa entrega ni reversión de tareas ya guardadas.

## P.9. Estados e interrupciones

| Estado             | Experiencia                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| Carga              | Esqueleto y acciones mutadoras desactivadas                               |
| Vacío              | Explicar fuentes sin tareas, ampliar alcance o volver a Hoy               |
| Error de lectura   | Mensaje legible y Reintentar, no cero tareas                              |
| Tarjeta activa     | Información estable, foco y progreso accesibles                           |
| Selector abierto   | Cancelar conserva borrador; Esc cierra solo ese nivel                     |
| Guardando borrador | Indicador discreto y última hora de guardado                              |
| Sin red            | Revisar snapshot si existe, "borrador en este dispositivo"                |
| Aplicando          | Evitar doble envío y permitir consultar estado tras recarga               |
| Conflicto          | Diferencias y decisiones específicas, no error crudo                      |
| Completada         | Cambios realmente confirmados y acceso a Hoy                              |
| Pausada            | Recuperar cola y decisiones                                               |
| Cambio de día      | Continuar fecha anterior o empezar otra, sin mover decisiones en silencio |
| Cambio externo     | Tarea completada/borrada/alterada se anuncia y revalida                   |

Salir con cambios: Guardar y salir / Seguir / Descartar borrador. Sin cambios, cerrar directamente. Back de Android cierra primero selectores; después ofrece salida segura. Esc no descarta la sesión.

IndexedDB por cuenta y sesión para borrador local. Cerrar sesión limpia datos privados locales de esa cuenta. No incluir títulos/notas en logs públicos. Continuidad entre dispositivos con borrador de servidor y control de revisión, no localStorage.

## P.10. Contrato técnico propuesto

Estos modelos y endpoints son nuevos, no capacidades actuales.

### P.10.1. Datos

```ts
type SessionState = 'draft' | 'applying' | 'applied' | 'discarded';
type MainDecision = 'done' | 'plan_day' | 'cancel' | 'trash' | 'skip';
interface DayPlan {
  id: string;
  ownerId: string;
  localDate: string; // YYYY-MM-DD
  timeZone: string; // IANA
  revision: number;
}
interface PlanMember {
  planId: string;
  taskId: string;
  occurrenceKey: string | null;
  rank: number;
  source: 'manual' | 'wizard' | 'ticky_suggestion';
}
interface ReviewSession {
  id: string;
  planId: string;
  ownerId: string;
  state: SessionState;
  revision: number;
  candidateSnapshotId: string;
  cursor: number;
  createdAt: string;
  updatedAt: string;
}
interface DraftDecision {
  id: string;
  sessionId: string;
  taskId: string;
  occurrenceKey: string | null;
  expectedTaskRevision: number;
  decision: MainDecision;
  targetPlanDate?: string;
  patch?: { priority?: string; projectId?: string };
  dueChange?: { dueDate: string | null; isAllDay: boolean; timeZone: string };
  reminderChange?: { reminderId: string; fireAt: string };
  recurrenceScope: 'occurrence' | 'series';
}
```

Contrato orientativo: sustituir strings amplios por enums del dominio y DTOs/OpenAPI validados. No permitir un patch arbitrario de tarea.

Restricciones:

- Unicidad de plan por propietario y fecha/zona conforme a política documentada de viajes; no crear dos planes accidentales al cambiar zona.
- Miembro único por plan y tarea/ocurrencia.
- Una decisión principal activa por tarjeta; historial separado.
- Versión real y comparación atómica para `expectedTaskRevision`. Un ETag inventado en cliente no resuelve concurrencia.
- El servicio actual usa relojes por campo y last-write-wins. Apply del wizard exige conflicto explícito; no pisar silenciosamente una revisión.
- Revisar esquema existente antes de añadir un campo duplicado de planificación.

### P.10.2. API

```text
POST   /api/v1/planning/sessions
GET    /api/v1/planning/sessions/:id
PATCH  /api/v1/planning/sessions/:id/decisions/:taskId
DELETE /api/v1/planning/sessions/:id/decisions/:taskId
GET    /api/v1/planning/sessions/:id/preview
POST   /api/v1/planning/sessions/:id/apply
GET    /api/v1/planning/operations/:operationId
POST   /api/v1/planning/operations/:operationId/revert-preview
POST   /api/v1/planning/operations/:operationId/revert
GET    /api/v1/plans?date=YYYY-MM-DD&time_zone=Europe%2FMadrid
```

Creación recibe fuentes, fecha/zona y límite, devuelve total/snapshot/tarjetas/razones. Preview devuelve efectos tipados, conflictos y revisión/token ligado a versiones del borrador y tareas. Apply recibe ese token e Idempotency-Key. Si quedó obsoleto, responde conflicto; no recalcula y aplica a espaldas del usuario.

Respuesta de apply: operation ID, estado, plan persistido, cambios de tareas y efectos externos. Misma clave/contenido devuelve mismo resultado; misma clave con otro contenido se rechaza. Las operaciones deben poder consultarse tras timeout.

Autorización por propietario y permisos de cada tarea. IDs ajenos no filtran datos. Lectura de sugerencias no concede permiso de aplicar, tampoco a Ticky. Reutilizar servicios de dominio de tareas para hijos, recurrencias, auditoría y recordatorios, no escrituras Prisma paralelas que omitan esas reglas.

### P.10.3. Avisos y Telegram

- Añadir a Mi plan no crea un aviso ni modifica vencimiento.
- Cambiar vencimiento muestra efecto sobre avisos absolutos/relativos y reconstruye jobs conforme al contrato común.
- Completar/cancelar/borrar invalida jobs pendientes de esa ocurrencia según política común.
- Snooze cambia solo el aviso elegido; deduplicación por tarea/ocurrencia/aviso/versión.
- Preview informa efectos. Apply no manda resumen de Telegram por defecto.
- "Enviarme el plan por Telegram" sería acción/preferencia explícita, con estado de entrega; distinta de alertas por vencimiento.
- Integrar el anexo de notificaciones reutilizando transporte, colas, reintentos y observabilidad. Este asistente no redefine ese sistema.

## P.11. Ticky y consumo mínimo

Primera versión útil con reglas de dominio y cero tokens. Ticky puede aportar sugerencias detrás de feature flag.

Contrato de sugerencia:

```text
suggestion_id, task_id, occurrence_key
suggested_action, suggested_parameters
reason_code, reason_text
source = deterministic | ticky
input_revision, generated_at, expires_at
requires_user_decision = true
```

Razones verificables: vence hoy a las 15:35, prioridad alta, vencida desde fecha concreta. Separar motivo de aparecer y recomendación de qué hacer. Sin agenda verificada no afirmar disponibilidad.

Validar sugerencias con los mismos schemas y guardrails. Títulos, notas y enlaces son datos no confiables: instrucciones dentro de tareas no amplían autoridad ni ejecutan herramientas. No mandar contenido de todas las tareas al modelo; mínimos datos autorizados y lectura puntual cuando haga falta.

No llamar al LLM en cada swipe, render, clic o vuelta atrás. Cache por revisión y versión de reglas, invalidación al cambiar entradas relevantes, plantillas para fechas/prioridad y fallback determinista si falla o se agota presupuesto. Registrar versión de prompt/reglas, latencia, tokens y aceptación sin volcar notas privadas.

Golden cases: compromiso de hoy frente a backlog, cumpleaños antiguo, repetición, duración desconocida, contenido malicioso, usuario que cambia decisión y sugerencia obsoleta. Un juez LLM nunca autoriza una mutación.

## P.12. Teclado, gestos y accesibilidad

- Tab/Shift+Tab y Enter/Espacio funcionan sin ratón.
- Atajos opcionales visibles: 1 Listo, 2 La haré hoy, 3 Después, S Saltar. Desactivados en campos/selectores. Sin tecla simple de borrado.
- Anterior/Siguiente accesibles; no secuestrar Back ni navegación del navegador.
- Ctrl/Cmd+Z deshace decisión cuando el foco no está editando texto.
- Swipe horizontal solo navega, no completa ni elimina. Bloqueo de eje para preservar scroll vertical y gestos de borde del sistema.
- Navegar sin decidir equivale a saltar, no aceptar sugerencia.
- Respetar prefers-reduced-motion. Foco en encabezado al cambiar tarjeta y anuncio breve aria-live polite.
- Progreso con nombre/valor/máximo, prioridad y estado con texto además de color.
- Diálogos accesibles con retorno de foco; Esc cierra el nivel superior, no toda la sesión.
- Fuente al 200%, contraste AA y botones mínimo 44 px. Alternativa Subir/Bajar al arrastre.

## P.13. PWA actual: qué existe y qué falta probar

### P.13.1. Lo comprobado

`apps/web/vite.config.ts` usa VitePWA, injectManifest, `src/sw.ts`, registro automático y registerType prompt.

El navegador autenticado mostró manifest real en `https://todo.reflexionia.com/manifest.webmanifest`, start_url `/today`, display standalone, iconos 192/512 y maskable, accesos Hoy/Captura/Foco y share target POST `/quick-add`. El manifest servido declara lang en: alinear con la política de idioma.

Existía worker activo `https://todo.reflexionia.com/sw.js`, scope raíz. `sw.ts` precachea recursos Workbox, limpia caches y trata share target. En el código leído no hay handlers push/notificationclick ni estrategia general de cacheo de lecturas API.

Existe cola offline create/update/complete en `features/offline`, pero eso no demuestra offline del wizard ni cubre operaciones de plan/cancelar/borrar. La cola actual considera ciertos 404/409 resueltos: **no usar esa política para descartar conflictos de planificación como si fueran éxito**.

### P.13.2. Matriz pendiente

La PWA móvil no se ha probado. Manifest y worker no equivalen a instalación, offline ni avisos. No pedir push para abrir el planificador.

| Entorno                               | Validar                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| Chrome Android, navegador e instalada | Instalación, icono, áreas seguras, gestos, Back, suspensión/reanudar |
| Safari iOS y añadida a inicio         | Standalone, viewport/teclado, almacenamiento/reanudar                |
| Chrome/Edge desktop                   | Atajos, recarga, varias pestañas, actualización worker               |
| Sin red tras carga válida             | Snapshot y borrador, etiqueta local y sin falso apply                |
| Arranque offline sin snapshot         | Limitación clara, no pantalla vacía                                  |

Primera entrega segura: revisar/guardar borrador local offline; **Aplicar necesita red y revalidación**. No meter apply en la cola existente. Un modo diferido futuro necesita contrato propio y pantalla de conflictos.

Una actualización de worker no debe recargar y perder decisiones. Mostrar actualización disponible y posponer hasta guardar. Reconciliar `skipWaiting()` actual con la intención de actualización mediante prompt.

## P.14. Mapa para Cursor

| Archivo actual                                     | Función comprobada                     |
| -------------------------------------------------- | -------------------------------------- |
| `packages/domain/src/review/propose.ts`            | Ranking diario, máximo 7, UUID         |
| `packages/domain/src/dashboard/kpis.ts`            | Pesos 4/3/1/0                          |
| `apps/api/src/modules/review/review.controller.ts` | Candidatos y propuesta                 |
| `apps/web/src/features/today/TodayPage.tsx`        | Consulta, render y aceptación local    |
| `apps/web/src/features/today/groups.ts`            | Recorte a 5                            |
| `apps/web/src/features/today/board.ts`             | Carga Hoy, páginas y deduplicación     |
| `apps/web/src/features/product/ProductPages.tsx`   | ReviewPage activo                      |
| `apps/web/src/app.tsx`                             | Rutas reales                           |
| `apps/api/src/modules/tasks/tasks.service.ts`      | Mutaciones y conflictos de recurrencia |
| `apps/api/src/modules/tasks/field-clocks.ts`       | Concurrencia actual                    |
| `apps/web/src/features/offline/*`                  | Cola insuficiente para plan            |
| `apps/web/vite.config.ts`, `apps/web/src/sw.ts`    | Manifest/worker                        |
| `packages/sdk/src/resources.ts`                    | Cliente review y recursos              |

Orden:

1. Tests sintéticos de regresión del ranking/recorte. No copiar notas privadas a fixtures.
2. Corregir copy y estados del bloque actual mientras se construye el plan real.
3. Modelos/migración de planes, sesiones y cancelación, índices y concurrencia.
4. Dominio puro de candidatos, decisiones, historial y preview.
5. API con permisos, apply transaccional, idempotencia y outbox.
6. OpenAPI y SDK antes de UI.
7. Nueva feature `features/planning/`: entrada, tarjeta, selectores, historial, resumen.
8. Hoy conectado al plan persistente, secciones y sin duplicados.
9. Borrador local y reconciliación entre dispositivos/pestañas.
10. Pruebas visuales, accesibilidad y matriz PWA.
11. Ticky opcional, no dependencia para la revisión.

No reescribir toda la app ni duplicar el motor de recurrencias para este flujo.

## P.15. Pruebas de aceptación

Esta suite es propuesta, **no ejecutada**. Las comprobaciones actuales son las de P.1, P.2 y P.13.1.

### P.15.1. Regresiones que explican lo actual

| Caso                                    | Resultado actual                               |
| --------------------------------------- | ---------------------------------------------- |
| Alta vencida meses vs alta en 5 minutos | 12 vs 9                                        |
| Altas vencidas con fechas distintas     | Empate por ID                                  |
| API devuelve 7                          | UI conserva 5                                  |
| Array Hoy tiene otro orden              | Bloque adopta el orden Hoy                     |
| Aceptar                                 | Solo localStorage, cero escritura de tareas    |
| Propuesta fuera de Hoy                  | Puede desaparecer; defecto, no contrato futuro |

### P.15.2. Dominio y fechas

- Compromiso de hoy con hora visible aunque haya cien vencidas altas.
- Una tarea en varias fuentes aparece una vez; notas/completadas/canceladas/papelera excluidas.
- Hora pasada de hoy permanece en Hoy; all-day no se convierte en alerta a medianoche ni cambia de día por UTC.
- Mañana avanza día civil en cambios de horario, no suma 24 h ciegamente.
- Hora inexistente/ambigua requiere resolución explícita.
- Cambio de día/zona no mueve el plan en silencio.
- Planificar aniversario hoy no modifica fecha/regla de serie.
- Cancelar no aumenta completadas/KPIs de éxito.

### P.15.3. Reversibilidad y UX

- Tras diez decisiones, volver a la segunda y cambiarla deja exactamente el nuevo borrador.
- Undo cambia borrador, no tareas sincronizadas. Listo→Hoy elimina completado propuesto.
- Descartar deja tareas idénticas. Saltar permite finalizar sin clasificar todo.
- Resumen editable muestra campos/fechas/avisos antes de apply.
- Títulos extensos, muchas etiquetas, contenido largo y fuente 200% no ocultan acciones.
- Teclado, lector de pantalla y controles sin gestos funcionan.
- Eliminar confirma solo papelera, nunca purga.

### P.15.4. Integración y seguridad

- Doble apply produce una operación efectiva.
- Corte tras commit se recupera por operation ID sin duplicados.
- Cambios de otro dispositivo/agente generan conflicto, no overwrite silencioso.
- Fallo de validación no causa parcialidad escondida.
- IDs ajenos no filtran títulos/sesiones ni permiten mutar.
- Completar padre resuelve hijos; undo de serie avanzada no borra sucesora ajena.
- Outbox duplicado no duplica avisos/jobs.
- Fallo de Telegram no falsea entrega ni resultado de guardado.
- Instrucciones maliciosas en tarea no cambian autoridad de Ticky.
- Sugerencia obsoleta exige revalidación.

### P.15.5. PWA y offline

- Recarga/cierre/suspensión preservan borrador por cuenta; logout limpia datos locales.
- Offline se ve borrador local; apply no finge éxito ni se ejecuta automáticamente al volver red.
- Conflicto 409 no se descarta como éxito.
- Update del worker no pierde decisiones.
- Standalone Android/iOS no tapa acciones con teclado, navegación o áreas seguras.

### P.15.6. Evidencia para cerrar

Entregar commits, resultados de tests dominio/API/UI y capturas reales inspeccionadas de entrada, tarjeta, historial, resumen, conflicto y éxito en desktop/móvil. Matriz PWA con probado/no probado. Tests en entorno aislado, prefijo `ZZ TEST` y limpieza confirmada. Nunca usar tareas reales de Pablo como datos mutables de aceptación.

## P.16. Definición de terminado

El usuario entiende por qué aparece una tarea y qué cambiará. Puede volver y revisar sin efectos previos. El plan existe en servidor y se recupera en otro dispositivo. Planificar, cambiar vencimiento y cambiar aviso son operaciones distintas. Funciona sin LLM, con errores/red explícitos. PWA solo se declara validada donde se haya probado. Ningún botón dice guardado/aplicado/enviado sin ese estado confirmado.

---

# PARTE 8

# Capítulo Q. Captura en lenguaje natural: fechas y horas

Ampliación de alcance del 19 oct 2026 (tarde). Caso origen: mensaje de Telegram de Pablo, `Recoger mañana a Markus del cole a las 16:00 !high #cole`. Relacionado con H-02. Este capítulo sustituye el alcance estrecho de NT-03. La entrega de avisos sigue siendo la Parte 6; aquí solo entra cómo se interpreta la captura y cómo el bot confirma lo guardado.

El parser es uno solo. Corregir `parseQuickAdd` arregla a la vez Telegram, la vista previa web, `POST /api/v1/tasks` (y por tanto MCP) y la captura por email.

---

## Q.0. Qué amplía y qué no toca

NT-03 decía: matcher de hora desnuda (`a las 15:35`, `15:35`) y, en opcional, `a las 3 y media`. Eso no cubre el caso real de la tarde ni las reglas de ambigüedad que hacen falta para no comerse el título.

Este capítulo añade, y pasa a ser el contrato de NT-03:

- Asociación de una fecha y una hora aunque haya palabras entre medias.
- Hora suelta, días de semana, sufijos `de la mañana` / `de la tarde` / `de la noche`, `am`/`pm`, mediodía y medianoche.
- Desplazamientos `en` / `dentro de` minutos, horas, días y semanas.
- Reglas de DST para Europe/Madrid en 2026.
- Confirmación del bot y metadata `{ capture: 'telegram' }`.

No entra aquí: entregar `due_soon` (NT-01), recordatorios, botones Hecho/Aplazar, ni el plan del día. `a las 3 y media` queda fuera de la gramática.

---

## Q.1. Resumen

El caso real tiene dos causas en el parser y un fallo de confirmación:

1. **`mañana` sí se interpretó.** La tarea quedó con vencimiento 20-10-2026 como todo el día. Verificado en vivo.
2. **`a las 16:00` no se interpretó.** `extendWithTime()` solo asocia la hora cuando va pegada a la fecha. Si hay palabras entre medias, la hora no se asocia a nada. No existe matcher de hora suelta (H-02), así que se queda en el título.
3. **El bot no confirma nada.** Telegram contesta solo `Guardada: <título>.`, sin fecha, prioridad ni etiquetas. Desde el chat no se ve que `mañana` sí funcionó.

---

## Q.2. Estado verificado del código

- **main:** `51dd55558cbf55d639e7002d70a8a134b38aa796` (19-10-2026 14:50 +0200).
- **Desplegado:** `d87e3faacc4b515906349e7634c7dbd310d57d43` (el health anuncia `d87e3fa`).
- **Diff entre ambos:** 4 líneas de `deploy/production/docker-compose.yml`. `packages/domain/src/nlp/parse.ts` y `apps/api/src/modules/integrations/telegram-bot.service.ts` son idénticos en los dos commits. El análisis sobre main describe producción.

---

## Q.3. Cómo llega la captura al parser

Texto de Telegram:

1. Webhook → `TelegramBotService.handle()` (`apps/api/src/modules/integrations/telegram-bot.service.ts`).
2. `parseTelegramCommand()` (`packages/domain/src/integrations/telegram.ts`, RF-2003) clasifica el texto. Lo que no es comando termina como `{ kind: 'capture', text }`.
3. `capture()` llama a `tasks.create(user, { raw_text: text }, 'telegram-<updateId>')`. No envía `time_zone`.
4. `TasksService.create()` (`apps/api/src/modules/tasks/tasks.service.ts`) llama a `resolveQuickAdd()` (`apps/api/src/modules/tasks/quick-add.ts`).
5. `resolveQuickAdd()` llama a `parseQuickAdd(texto, idioma, { now, timeZone })` con `now` del servidor y `timeZone = dto.time_zone ?? user.timeZone`. El bot no manda zona: se usa la del perfil (Europe/Madrid). Si el perfil tuviera una zona inválida, el parser se queda sin reloj y no interpreta ninguna fecha.

Los otros canales usan el mismo parser:

- **Quick-add web** (`apps/web/src/features/capture/quick-add.ts`): ejecuta `parseQuickAdd` en el cliente para la vista previa, manda `raw_text` y el servidor vuelve a parsear. El servidor manda.
- **Email entrante** (`tasks.service.ts`): crea la tarea con `raw_text` = asunto y guarda metadata `{ capture: 'email' }`.
- **API y MCP** (`POST /api/v1/tasks`): aceptan `raw_text` y lo parsean igual.

`packages/domain/src/nlp/parse.ts` es la única fuente de verdad.

---

## Q.4. Diagnóstico del caso real

Entrada: `Recoger mañana a Markus del cole a las 16:00 !high #cole`

Reproducción del parser de main (`51dd555`), `now = 2026-10-19T14:39:00.000Z`, zona Europe/Madrid:

- Título: `Recoger a Markus del cole a las 16:00`
- Due: `2026-10-19T22:00:00.000Z` (20-10-2026 00:00 en Madrid), `isAllDay: true`
- Prioridad: `high`. Etiquetas: `[cole]`
- Spans consumidos: `mañana` (date), `!high` (priority), `#cole` (tag)

Verificación en vivo (19-10-2026 ~16:44 CEST, sesión web, `GET /api/v1/search?q=Markus`): la tarea `db97fdb0-027e-4136-b09f-43b48f40a8e5` tiene exactamente esos valores. Lista `Bandeja de entrada`, `time_zone: Europe/Madrid`. No mutarla: es evidencia.

Defectos:

- **D1.** La hora no se asocia si no va pegada a la fecha. `extendWithTime()` solo mira el texto inmediatamente posterior. `mañana a las 16:00` funciona (hay tests). `mañana a Markus del cole a las 16:00` no. La hora queda sin fecha y no hay matcher de hora suelta.
- **D2.** `capture()` responde solo `Guardada: <título>.` más avisos de lista o etiqueta creada. No dice fecha, hora, prioridad ni etiquetas.
- **D3.** Al no consumirse, `a las 16:00` contamina el título.
- **D4.** La captura por Telegram no guarda metadata de origen. La de email sí: `{ capture: 'email' }`. `source` queda `manual`. Conviene guardar `{ capture: 'telegram' }` en la misma llamada de creación.

El caso de la mañana (`Recoger a mis hijos a las 15:35`, tarea `fa96e1a3-…`, Parte 6) es el otro lado de H-02: hora sin ninguna palabra de fecha. D1 es el lado nuevo: hay fecha, pero la hora no va pegada.

---

## Q.5. Gramática

Mantener la gramática actual: `hoy`, `mañana`, `pasado mañana`, `dd/mm[/aaaa]` y `dd-mm[-aaaa]`, `12 de octubre [de 2026]` y meses en inglés, recurrencias `cada …`, recordatorios `avísame N min/horas/días antes`, hora pegada a la fecha (`mañana 18:00`, `mañana a las 9:30`), `!alta|media|baja`, `!1/!2/!3`, `!high/…`, `p1/p2/p3`, `#etiqueta`, `^lista` / `@lista` / `~lista`.

Añadir:

| Entrada                                                                 | Interpretación                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lunes`, `el lunes` (cualquier día, sin `cada`)                         | Próxima ocurrencia futura. Si hoy es ese día, solo cuenta hoy cuando lleva una hora que aún no pasó; si no, la semana que viene. Todo el día si no hay hora.                                                                                                                       |
| `16:00`, `a las 16:00`, `a las 16`, `16h`, `16:30h`                     | Hora suelta: hoy si aún no pasó en la zona del usuario; si ya pasó, mañana. Nunca todo el día.                                                                                                                                                                                     |
| `a las 4 de la tarde`                                                   | 16:00. Sufijos: `de la mañana` (1-11 tal cual; 12 → 00:00), `de la tarde` (1-7 → +12, o sea 13:00-19:00), `de la noche` (8-11 → +12, o sea 20:00-23:00; 12 → 00:00 del mismo día, limitación documentada). Hora fuera del rango del sufijo: no se interpreta y queda en el título. |
| `4pm`, `4:30pm`, `4am`                                                  | Ya existe en parte junto a fechas. Extender a hora suelta.                                                                                                                                                                                                                         |
| `mediodía`                                                              | 12:00. `medianoche` → 00:00.                                                                                                                                                                                                                                                       |
| `en 2 horas`, `dentro de 2 horas`, y lo mismo con `minuto(s)`           | Ahora + N, con hora exacta. También `en un` / `en una` / `dentro de un` / `dentro de una`.                                                                                                                                                                                         |
| `en 3 días`, `dentro de 3 días`, `en una semana`, `dentro de 2 semanas` | Desplazamiento de calendario. Semana = 7 días. Todo el día.                                                                                                                                                                                                                        |
| `!prioridad`, `#etiqueta`, `^lista`                                     | Igual que hoy. Se consumen en cualquier posición.                                                                                                                                                                                                                                  |

**Asociación fecha-hora.** Si el mensaje tiene exactamente una fecha y una hora, se combinan aunque haya palabras entre medias: `Recoger mañana a Markus del cole a las 16:00` → mañana 16:00. Si hay varias horas, la fecha toma la más cercana en el texto y las demás quedan en el título. Si la fecha ya trae hora pegada (`mañana a las 9:30`), esa manda y cualquier otra hora queda en el título.

---

## Q.6. Zona horaria y DST

- El parseo usa la zona del usuario (`user.timeZone`, hoy Europe/Madrid) y `now` del servidor. El bot no inventa zona.
- Cambio de hora en España 2026: el 29-03-2026 las 02:30 no existen (salto 02:00 → 03:00). El 25-10-2026 las 02:30 ocurren dos veces (03:00 → 02:00).
- Hora inexistente: desplazar hacia adelante manteniendo el desfase (02:30 → 03:30 CEST = 01:30Z). Es el comportamiento esperado de `fromZonedTime` en `instantFromWall` (`packages/domain/src/dates/zoned.ts`). Verificar con test y ajustar si no coincide.
- Hora duplicada: primera ocurrencia (CEST, 00:30Z).
- Fechas sin hora (`mañana`, `el lunes`) siguen como todo el día a las 00:00 locales.

---

## Q.7. Ambigüedad

- `dd/mm`: día primero en español. Si un número es mayor que 12, ese es el día. Mantener la lógica actual.
- Formato 24 h primero: `a las 4` es 04:00, no 16:00. Si esa hora ya pasó hoy, va a mañana. Para las 16:00 hace falta `16:00`, `4 de la tarde` o `4pm`.
- Un número suelto sin `:`, `h` ni sufijo nunca es hora. `a las 16` sí; `16` a secas no. `comprar 16 velas` no se toca.
- No interpretar horas pegadas a letras o dígitos ni dentro de otros tokens: `x16:00`, `116:000`, URLs.
- Varias fechas: gana la última (comportamiento actual). Ambas salen del título.
- Varias prioridades: gana la última.
- Lo interpretado sale del título. Lo no interpretado se queda. Título vacío → `empty_title`, como hoy.

---

## Q.8. Qué debe responder Telegram

Tras guardar, en `TelegramBotService.capture()` y en las vías de voz y de foto con caption, confirmar lo interpretado con los campos de `tasks.create` (`due_date`, `is_all_day`, `priority`, `tags`, `project_id`) y la zona del usuario:

```
Guardada: Recoger a Markus del cole.
📅 Mañana, 16:00 · Prioridad alta · #cole · Bandeja de entrada
```

- Fecha corta en la zona del usuario: `Hoy, 16:00`, `Mañana, 16:00`, `Mar 20 oct, 16:00`. Todo el día: `Mañana (todo el día)`. Sin fecha: no hay línea de fecha.
- Prioridad solo si no es `none`. Etiquetas con `#`. Siempre la lista, resuelta con `project_id`.
- Mantener los avisos actuales (lista o etiqueta creada, lista no encontrada).
- La entrada original de Pablo debe confirmar `Mañana, 16:00`.
- En la misma creación, guardar metadata `{ capture: 'telegram' }`, igual que el email guarda `{ capture: 'email' }` en `tasks.service.ts`.

Textos de cara al usuario en español. No cambiar el esquema OpenAPI ni los DTO salvo esa metadata.

---

## Q.9. Casos dorados

En `packages/domain/src/nlp/parse.spec.ts`. Ancla: `now = 2026-10-19T14:39:00.000Z` (lunes 19-10-2026 16:39 CEST), zona `Europe/Madrid`. Citar RF-102 y RF-2003 en los comentarios que toquen, y los RF nuevos si el cambio de spec los añade.

| #   | Entrada                                                    | Título                      | Due (ISO UTC)                                         | Todo el día |
| --- | ---------------------------------------------------------- | --------------------------- | ----------------------------------------------------- | ----------- |
| 1   | `Recoger mañana a Markus del cole a las 16:00 !high #cole` | `Recoger a Markus del cole` | `2026-10-20T14:00:00.000Z`                            | no          |
| 2   | `dentista mañana a las 9:30`                               | `dentista`                  | `2026-10-20T07:30:00.000Z`                            | no          |
| 3   | `llamar a Ana a las 18:00`                                 | `llamar a Ana`              | `2026-10-19T16:00:00.000Z`                            | no          |
| 4   | `llamar a Ana a las 9:00`                                  | `llamar a Ana`              | `2026-10-20T07:00:00.000Z`                            | no          |
| 5   | `el lunes recoger paquete`                                 | `recoger paquete`           | `2026-10-25T23:00:00.000Z` (lunes 26-10 00:00 CET)    | sí          |
| 6   | `el martes recoger paquete a las 10:00`                    | `recoger paquete`           | `2026-10-20T08:00:00.000Z`                            | no          |
| 7   | `revisión en 2 horas`                                      | `revisión`                  | `2026-10-19T16:39:00.000Z`                            | no          |
| 8   | `revisión dentro de 3 días`                                | `revisión`                  | `2026-10-21T22:00:00.000Z` (22-10 00:00 CEST)         | sí          |
| 9   | `cita el 24/10 a las 12:30`                                | `cita`                      | `2026-10-24T10:30:00.000Z`                            | no          |
| 10  | `a las 4 de la tarde llamar al banco`                      | `llamar al banco`           | `2026-10-19T14:00:00.000Z`                            | no          |
| 11  | `a las 3 de la tarde llamar`                               | `llamar`                    | `2026-10-20T13:00:00.000Z`                            | no          |
| 12  | `salir a correr pasado mañana a las 8`                     | `salir a correr`            | `2026-10-21T06:00:00.000Z`                            | no          |
| 13  | `cita el 29/3/2026 a las 2:30`                             | `cita`                      | `2026-03-29T01:30:00.000Z` (02:30 → 03:30 CEST)       | no          |
| 14  | `cita el 25/10/2026 a las 2:30`                            | `cita`                      | `2026-10-25T00:30:00.000Z` (primera ocurrencia, CEST) | no          |
| 15  | `comprar 16 velas`                                         | `comprar 16 velas`          | `null`                                                | —           |
| 16  | `mañana a las 9:30 y a las 18:00`                          | `y a las 18:00`             | `2026-10-20T07:30:00.000Z`                            | no          |
| 17  | `cita a las 9 de la tarde`                                 | `cita a las 9 de la tarde`  | `null`                                                | —           |

El caso 1 también comprueba prioridad `high` y etiqueta `cole`. El caso 12 lleva título a propósito: `pasado mañana a las 8` a solas dejaría el título vacío y hoy eso es `empty_title`.

Además:

- La suite actual de `parse.spec.ts` sigue verde.
- Test del formato de confirmación del bot (spec de `TelegramBotService.capture` o e2e en `apps/api/test/capture.e2e-spec.ts`): la respuesta incluye fecha formateada, prioridad, etiquetas y lista.
- Test de `instantFromWall` para la hora inexistente y la hora duplicada de Q.6.

Parser determinista con regex. Sin LLM. Sin dependencias nuevas salvo justificación. Diff mínimo.

---

## Q.10. Criterios de aceptación

1. `POST /api/v1/tasks` con `raw_text` = `Recoger mañana a Markus del cole a las 16:00 !high #cole` devuelve título `Recoger a Markus del cole`, `due_date` = 20-10-2026 16:00 Europe/Madrid (`2026-10-20T14:00:00.000Z` si el reloj de referencia es el de Q.9), `is_all_day` false, prioridad alta, etiqueta `cole`.
2. La respuesta del bot confirma fecha y hora, prioridad, etiquetas y lista con el formato de Q.8, también en voz y en foto con caption.
3. La vista previa del quick-add web muestra exactamente lo mismo. El servidor vuelve a parsear y es el que manda.
4. `pnpm --filter @reflexionia/domain test` y los tests de API en verde, con los casos dorados y los de DST.
5. Sin dependencias nuevas salvo necesidad justificada. Parser determinista, sin LLM.
6. La captura por Telegram guarda metadata `{ capture: 'telegram' }`.

Verificación manual aparte de la tabla: la entrada original, escrita otra vez, no puede quedar como todo el día ni conservar `a las 16:00` en el título. La tarea real `db97fdb0-…` no se edita para demostrar el arreglo.
