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
