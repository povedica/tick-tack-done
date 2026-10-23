# Aceptación pendiente con Pablo — 23 de octubre de 2026

El código y la infraestructura los prepara Codex. Esta lista contiene únicamente decisiones, accesos y comprobaciones que requieren a Pablo. No pegar secretos en el chat, GitHub ni Git.

## 1. Autorizar la activación del proxy compartido

La configuración actual `/opt/turugby/production/Caddyfile` tiene `admin off` y Caddy es 2.10.2: no admite recarga por API ni SIGUSR1. Activar el dominio requiere un reinicio breve del proxy, con una posible interrupción de las webs que comparte. La instrucción de no interrumpir producción impide hacerlo sin una autorización específica.

Codex ha preparado y validado `/opt/todo-staging/runtime/Caddyfile.proposed`, con administración en `127.0.0.1:2019` dentro del contenedor, sin publicar ese puerto. Conserva el original en `Caddyfile.before`. Una vez autorizado, Codex aplica el cambio, reinicia solo el proxy, comprueba ambas webs y TLS, y revierte si falla. Las siguientes recargas, incluida la retirada de staging, podrán ser suaves.

**Necesario de Pablo:** autorizar ese reinicio y elegir el momento.

## 2. Google Cloud y consentimiento de una cuenta de prueba

**Necesario de Pablo:** un cliente OAuth de tipo web dedicado a staging, en un proyecto con Calendar API, Drive API y Google Picker API habilitadas. Añadir la cuenta de prueba al consentimiento si el proyecto está en modo prueba.

- Origen JavaScript: `https://staging-todo.reflexionia.com`.
- Callback: `https://staging-todo.reflexionia.com/api/v1/integrations/google/callback`.
- Nombre visible: `tick-tack-done` (puede identificarse como entorno de pruebas).
- Permisos: `openid`, `email`, `calendar.calendarlist.readonly`, `calendar.events` y `drive.file`; la aplicación los pide de manera incremental.
- Configurar las restricciones de Picker según la guía oficial, incluyendo el referrer de su iframe `https://docs.google.com/*` cuando proceda.

Guardar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PICKER_API_KEY` y `GOOGLE_PICKER_APP_ID` en `/opt/todo-staging/runtime/staging.env` en el servidor (archivo 0600). No reutilizar secretos ni tokens de producción. Si faltan, Codex indicará únicamente los nombres, nunca sus valores.

Cuando Codex pase la URL: completar personalmente el consentimiento parcial de Calendar, añadir Drive después y revocar la aplicación de prueba cuando se indique. La revocación afecta a ambos servicios. Codex ejecutará las subidas sintéticas, comprobará Drive/BD/disco y conservará evidencias saneadas.

## 3. Telegram y email de prueba

**Necesario de Pablo:** crear un bot exclusivo para staging con BotFather y guardar `TELEGRAM_BOT_TOKEN` en el mismo archivo privado. Codex genera el secreto de webhook y configura su URL: no se modifica el bot de producción.

Facilitar un SMTP de prueba capaz de entregar a un buzón real y guardar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` y `STAGING_TEST_EMAIL` en ese archivo. Este último identifica el buzón de prueba para la aceptación; Codex configurará la cuenta sintética con esa dirección antes de enviar. No usar destinatarios ajenos.

Con la URL lista, abrir el enlace de vinculación del bot, confirmar la recepción, bloquearlo/desbloquearlo cuando se indique y confirmar la desvinculación. Confirmar también la recepción del email y su tiempo de llegada. Codex maneja los botones de prueba y las verificaciones de historial.

## 4. iPhone y acciones de notificaciones reales

**Necesario de Pablo:** un iPhone físico, su versión de iOS y Safari; instalar la PWA de staging para Web Push y conceder permiso de notificaciones.

Con Codex, abrir el selector de fecha desde captura y detalle, abrir el teclado y comprobar que la hoja queda completa. Recibir un push real y probar las acciones que ofrezca iOS. También se necesitará un navegador/sistema que exponga los botones Completar y Posponer si iOS no los muestra. Codex no marcará como verificados los botones ausentes ni sustituirá el dispositivo por emulación.

## 5. Autorizar o rechazar la copia para 81/85

La exportación anterior fue rechazada por auto-review y no se ejecutó. No se reutiliza otro destino ni un subconjunto para evitarlo.

**Decisión necesaria de Pablo:** autorización específica para una copia completa de PostgreSQL que contendrá cuentas, tareas, notas, actividad, metadatos de adjuntos y credenciales almacenadas como hashes o cifradas. Propuesta: archivo 0600 dentro de `/opt/todo-staging/runtime/repair-validation/` en el mismo VPS, directorio 0700, restaurado en un PostgreSQL temporal con red aislada y sin puertos ni conexiones a servicios externos. Codex ejecutará los scripts allí, publicará solo recuentos y eliminará el dump y el contenedor/volumen al terminar. No se copian binarios de adjuntos y no se modifican datos de producción. Si se rechaza, ambos criterios siguen pendientes.

## 6. Acceso al destino del backup cifrado de producción

Los cron actuales fallan por falta de `APP_DIR`; el último intento externo falló por no tener refresh token de Google. Codex ya ha instalado `age` 1.3.2 desde su distribución oficial, verificado su SHA-256 y probado el cifrado/descifrado con texto sintético. La identidad de recuperación se conserva en un archivo privado fuera del repositorio. Codex corregirá el cron y verificará la restauración antes de publicar: esos pasos no los tiene que hacer Pablo.

**Necesario de Pablo:** completar el consentimiento de Drive de la cuenta de producción que posee el destino ya configurado, o indicar un destino externo alternativo autorizado para el backup cifrado. Codex comprobará la compatibilidad antes de subir nada y entregará la clave de recuperación por una ruta privada para que Pablo la guarde fuera del VPS; guardarla es la intervención humana necesaria para recuperar el backup si se pierde el servidor. No hay que facilitar un dump ni pegar una clave en el chat.

## Después de estas intervenciones

Codex ejecuta el cliente MCP y el reinicio de API en staging, completa los smoke y las evidencias, actualiza la PR y mantiene los criterios externos pendientes hasta demostrarlos. Con aceptación, CI, backup restaurable y rollback preparados, hace merge y despliega producción. Al terminar retira solo los recursos propios de staging y deja su index estático. Los cuatro archivos huérfanos del volumen de adjuntos de producción se conservan: borrarlos requiere autorización independiente y no se necesita para publicar.

Referencias: [Caddy 2.10.2, señales](https://github.com/caddyserver/caddy/blob/v2.10.2/sigtrap_posix.go), [Google Identity, CSP/COOP](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker).
