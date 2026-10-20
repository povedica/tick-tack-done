# Auditoría de seguridad: tick-tack-done (repo + todo.reflexionia.com)

Fecha: 19 oct 2026. **Versión 2 (ronda 1 pasiva + ronda 2 autenticada en vivo).** Documento para el agente de Cursor: cada hallazgo trae severidad, evidencia, riesgo, arreglo con archivos y cómo verificarlo.

## 0. Alcance y método

- **Repo**: github.com/povedica/tick-tack-done. Es PÚBLICO (comprobado con la API de GitHub sin autenticar). Rama `main` = 41e866d. El build desplegado (`/api/v1/health` devuelve commit `6512136`) está en la rama `fix/ux-audit-2026-10-18`, NO en main. Revisé el código en 6512136 y comparé con 41e866d: los cambios de seguridad entre ambos son nulos (solo `touchLastUsed`, redirect de manifest y pool de Prisma). Así que todo lo de abajo vale para ambos.
- **App publicada**: https://todo.reflexionia.com (IP <SERVER_IP>). Solo comprobaciones pasivas: cabeceras, TLS, rutas expuestas, CORS, 20 logins fallidos contra un email inexistente, GET sin credenciales a los 136 paths del OpenAPI.
- **Estándares**: MDN HTTP Observatory, OWASP Top 10 2021, OWASP API Top 10 2023, ASVS (autenticación, sesiones, configuración).
- **MDN Observatory**: nota **B (75/100)**, 11 de 12 pruebas pasadas, 1 fallida. Informe: https://developer.mozilla.org/en-US/observatory/analyze?host=todo.reflexionia.com . Reescaneado en la ronda 2: sigue en B 75, 11/12. La API v2 no devuelve el detalle. Confirmado a mano que `GET /` no lleva CSP (solo la API la lleva), que casi seguro es la prueba que falla (ver S-05); abre el informe para confirmarlo.
- **Ronda 2 (autenticada, 19 oct 2026 11:00-11:05 CEST)**: pruebas en vivo con el login de Pablo en el navegador y con 3 tokens PAT de prueba (`ZZ TEST sec-ro`, `sec-rw`, `sec-pw`, todos revocados al terminar; comprobado que dan 401). Datos de prueba con prefijo `ZZ TEST` (1 lista, 1 etiqueta, 1 tarea con subtarea y 5 adjuntos, 3 webhooks, 2 suscripciones iCal, 1 token extra): **todos borrados**, tareas reales y papelera de Pablo intactas, `display_name` restaurado a su valor original. No se pudo probar IDOR con un segundo usuario: el registro está cerrado (`registration_closed`, correcto), así que IDOR se revisó en código. Detalle en la sección 6.
- No se encontró ningún secreto real en el repo ni en su historial completo (ver sección 3). Nada urgente que obligue a rotar claves hoy.

## 1. Resumen priorizado

| ID   | Sev.  | Hallazgo                                                                                                                                                                                                                                    |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | Alta  | Login sin límite de intentos ni bloqueo (+ enumeración de usuarios por tiempo)                                                                                                                                                              |
| S-02 | Alta  | `trust proxy` sin configurar: `req.ip` es siempre el proxy; el límite del email entrante es un único cubo global                                                                                                                            |
| S-03 | Alta  | Dependencias de producción con 5 CVE altos (nodemailer, deepmerge-ts) y 9 medios                                                                                                                                                            |
| S-04 | Media | Repo público con datos de infraestructura. **Decisión de Pablo: el repo sigue público.** Ver sección 5 (cómo dejarlo limpio)                                                                                                                |
| S-05 | Media | El HTML de la SPA no lleva CSP ni Permissions-Policy (Observatory B)                                                                                                                                                                        |
| S-06 | Media | Swagger y `/api/docs-json` públicos en producción                                                                                                                                                                                           |
| S-07 | Media | SSRF: webhooks, acción webhook de automatizaciones y URL iCal sin filtro de destinos                                                                                                                                                        |
| S-08 | Media | Secretos en claro en la base de datos (TOTP, refresh token de Google, secreto de webhooks)                                                                                                                                                  |
| S-09 | Media | Contenedores como root, sin `.dockerignore`, sin endurecimiento; nginx revela versión                                                                                                                                                       |
| S-10 | Baja  | Sesión 30 días sin caducidad por inactividad, sin prefijo `__Host-`; CSRF de login                                                                                                                                                          |
| S-11 | Baja  | Cabecera `X-Request-Id` aceptada del cliente; mensajes de error que filtran estado de config                                                                                                                                                |
| S-12 | Baja  | SPA devuelve 200 en `/.env`, `/.git/HEAD`, etc. (no filtra nada, pero ensucia escáneres)                                                                                                                                                    |
| S-13 | Baja  | Sin escaneo de secretos/dependencias/SAST en CI; protección de rama no verificable                                                                                                                                                          |
| S-14 | Info  | Puerto 22 abierto al mundo; resto de puertos sin verificar desde fuera (sigue sin poder verificarse desde mi red)                                                                                                                           |
| S-15 | Alta  | **Escalada de privilegios con PAT** (confirmado en vivo): un token con `profile:write` puede crear otro token con cualquier scope (`POST /me/tokens`), y puede borrar la cuenta entera (`DELETE /me`, solo pide el email como confirmación) |
| S-16 | Media | Un PAT de solo `tasks:read` puede listar y revocar las sesiones del navegador (`/auth/sessions`) y leer `/sync` con eventos de listas, etiquetas, tokens y Telegram (confirmado en vivo)                                                    |
| S-17 | Media | Guard de auth con "abierto por defecto": una ruta sin `@Scopes`/`@Authenticated` es pública. Hoy ninguna lo es, pero un endpoint nuevo olvidado quedaría abierto                                                                            |
| S-18 | Baja  | Sin límite de cuota en adjuntos, sin lista de tipos MIME, MIME del cliente guardado tal cual; las respuestas autenticadas no llevan `Cache-Control: no-store`; exportación CSV sin neutralizar fórmulas (`=`, `+`, `-`, `@`)                |
| S-19 | Baja  | Errores 500 donde debería haber 4xx: `GET /tasks?project_id=x` (UUID inválido), cuerpo >100 KB, fallo de conexión al crear suscripción iCal                                                                                                 |
| S-20 | Baja  | `api` y `web` comparten la red Docker `<EDGE_NETWORK>` con otra aplicación (`<NEIGHBOR_APP>`): cualquier contenedor de esa red llega a `todo-api:3000` sin pasar por Caddy                                                                  |
| S-21 | Baja  | Valores fijos que deberían ser variables de entorno: dominio `todo.reflexionia.com` y localhost en `google-oauth.ts`, `todo@reflexionia.com` por defecto en `reminder.transport.ts`, usuario/base `reflexionia` en CI                       |

## 2. Hallazgos

### S-01 (Alta) Login sin rate limit ni bloqueo

- **Evidencia**: 20 POST seguidos a `/api/v1/auth/login` con credenciales falsas: 20 respuestas 401, ningún 429, ninguna cabecera `Retry-After`. `apps/api/src/auth/auth.service.ts` `login()` (líneas ~58-76): no hay contador. El único limitador (`token-rate-limit.ts`) es por PAT, no por IP/cuenta. Además, si el email no existe se responde sin ejecutar `argon2.verify`, lo que da una diferencia de tiempo medible entre "usuario existe" y "no existe".
- **Riesgo**: fuerza bruta/credential stuffing contra la única cuenta. 2FA (TOTP) es opcional.
- **Arreglo**:
  1. Limitar `POST /auth/login` por IP (p. ej. 10 por 15 min) y por email normalizado (5 fallos y backoff exponencial o bloqueo de 15 min). Reutiliza `SlidingWindowRateLimit` (`auth/token-rate-limit.ts`) o `@nestjs/throttler` con almacén en Redis (el actual es memoria y se resetea al reiniciar).
  2. Verificar siempre con un hash falso cuando el usuario no existe (`verifyPassword(DUMMY_HASH, dto.password)`), para igualar tiempos.
  3. Registrar los fallos en ActivityLog. Aplicar también a `/auth/register`, `/oauth/token` y `/me/totp/*`.
  4. Ver S-02 antes: sin `trust proxy` el límite por IP no sirve.
- **Verificación**: test de integración que haga 11 logins fallidos y espere 429 con `Retry-After`; test que mida que ambas ramas llaman a `argon2.verify`. En vivo: repetir los 20 logins y ver 429 a partir del undécimo.

### S-02 (Alta) `trust proxy` sin configurar

- **Evidencia**: `rg 'trust proxy' apps/api/src` no devuelve nada. Tras Caddy, `req.ip` es la IP del contenedor Caddy. `modules/tasks/inbound-email.controller.ts:65` usa `req.ip` como clave del límite del correo entrante (30 por 15 min).
- **Riesgo**: cualquiera puede agotar ese cubo único y bloquear la captura por email para todos; no hay forma de limitar por cliente (S-01) ni de auditar IPs reales.
- **Arreglo**: en `configure-app.ts`, antes de `app.use(helmet())`: `(app as NestExpressApplication).set('trust proxy', 1)` (un salto, el Caddy). Mejor aún: variable `TRUST_PROXY_HOPS` en `.env.example`. Comprueba que Caddy envía `X-Forwarded-For` (lo hace por defecto con `reverse_proxy`).
- **Verificación**: test unitario con cabecera `X-Forwarded-For` que compruebe `req.ip`; en vivo, que el log de actividad muestre IPs distintas.

### S-03 (Alta) Dependencias vulnerables (`pnpm audit --prod`, 15 avisos: 5 altos, 9 medios, 1 bajo)

- Altos: `nodemailer` (pinned `7.0.11` en `apps/api/package.json`): GHSA-2x7j-588g-ccc2, GHSA-v53p-9fqp-m79j (backtracking en addressparser), GHSA-r7g4-qg5f-qqm2 (validación TLS en OAuth2), GHSA-p6gq-j5cr-w38f (opción `raw` salta `disableFileAccess`). `deepmerge-ts <8` GHSA-ggr8-5vv4-36mx (agotamiento de pila). Medios: más avisos de nodemailer (inyección CRLF en SMTP/List-\*, bypass de allowlist de dominios), `js-yaml` GHSA-r3ph-w7gj-g6xm.
- **Riesgo**: nodemailer solo envía correo propio (recordatorios), la superficie real es limitada; aun así hay que subir.
- **Arreglo**: subir `nodemailer` a `>=10.0.6` (quita el pin exacto; revisa cambios de API en `apps/api/src/**` donde se use `createTransport`), actualizar la dependencia que arrastra `deepmerge-ts` y `js-yaml` (`pnpm why deepmerge-ts js-yaml`; usar `pnpm.overrides` si es transitiva). Añadir `.github/dependabot.yml` (npm + docker + github-actions, semanal) y un job `pnpm audit --prod --audit-level=high` en `ci.yml`.
- **Verificación**: `pnpm audit --prod` sin altos; CI falla ante uno nuevo.

### S-04 (Media) Repo público con datos de infraestructura (el repo sigue público)

- **Decisión de Pablo (19 oct 10:53)**: el repo se queda público para que otros se beneficien. Entonces hay que sanear lo que identifica TU servidor y TU persona, y dejar el repo útil para terceros. La guía completa y ejecutable está en la **sección 5**.
- **Evidencia**: `docs/deployment.md`, `docs/handoff.md`, `deploy/` y `.cursor/` publican IP <SERVER_IP>, usuario `deploy`, clave SSH `~/.ssh/<SSH_KEY_NAME>`, rutas `/etc/todo/production.env`, `/opt/todo/app`, `/opt/todo/backups`, el nombre de otra app del mismo host (`<NEIGHBOR_APP>`, con enlace a su PR #59 y su red Docker `<EDGE_NETWORK>`), y el email personal en los 122 commits.
- **Riesgo**: reconocimiento gratis (IP, usuario de SSH, estructura de directorios, app vecina). El historial de git conserva la IP y el nombre de clave aunque se borren de los docs (2 commits con la IP, 1 con el nombre de clave).
- **Verificación**: ver sección 5, paso 9.

### S-05 (Media) El HTML no lleva CSP ni Permissions-Policy

- **Evidencia**: `curl -I https://todo.reflexionia.com/` devuelve HSTS, nosniff, X-Frame-Options, Referrer-Policy, pero NO `Content-Security-Policy`, `Permissions-Policy` ni `Cross-Origin-Opener-Policy`. Las respuestas de la API sí traen la CSP de helmet. Esos headers viven en `deploy/production/todo.caddy` y `Caddyfile`, y no cubren el documento de la SPA.
- **Riesgo**: si alguna vez entra un XSS, no hay red de seguridad. Es la causa más probable del B de Observatory. HSTS sin `preload`.
- **Arreglo**: en el bloque `header` de `deploy/production/todo.caddy` (y `Caddyfile` raíz) añadir:
  `Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"`
  `Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"`, `Cross-Origin-Opener-Policy "same-origin"`. Probar en `Content-Security-Policy-Report-Only` primero: la PWA usa Web Push y service worker. Quitar `'unsafe-inline'` de estilos si Vite lo permite. El mismo `style-src ... https: 'unsafe-inline'` de helmet en la API se puede apretar a `'self'`. Si el host Caddy es el de <NEIGHBOR_APP>, el cambio va en el `todo.caddy` que se importa.
- **Verificación**: `curl -sI https://todo.reflexionia.com/ | rg -i 'content-security|permissions-policy|cross-origin-opener'`, nueva pasada en Observatory (objetivo A o A+), y la app funciona (login, push, offline).

- **Ronda 2**: confirmado con `curl -I https://todo.reflexionia.com/`: sin `Content-Security-Policy` ni `Permissions-Policy` en el HTML (la API sí lleva CSP de helmet). `index.html` no tiene scripts en línea y el CSS no importa recursos externos, así que una CSP estricta es viable. Cabecera propuesta para `Caddyfile` y `deploy/production/todo.caddy`, dentro de `header { ... }` de la web:
  `Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"`
  `Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"` (quita `geolocation` si la web usa `POST /me/location`).
  `Cross-Origin-Opener-Policy same-origin`. Probar con la consola abierta (React usa atributos `style`, por eso `style-src 'unsafe-inline'`). Si algo falla, empezar con `Content-Security-Policy-Report-Only`.
  En `apps/web/nginx.conf` el `Cache-Control: no-cache` también cubre `/assets/*` (ficheros con hash): añade `location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }`. `manifest.webmanifest` sale como `application/octet-stream`: añade `types { application/manifest+json webmanifest; }`.

### S-06 (Media) Swagger y OpenAPI públicos

- **Evidencia**: `GET /api/docs` (Swagger UI) y `GET /api/docs-json` devuelven 200 sin autenticar (100 KB, 136 paths). `apps/api/src/main.ts` monta `SwaggerModule.setup('api/docs', ...)` siempre.
- **Riesgo**: mapa completo de la API para un atacante (OWASP API9, gestión de inventario/exposición). El OpenAPI además declara `security` vacío en todos los paths (183 operaciones sin esquema), lo que desinforma.
- **Arreglo**: en `main.ts`, montar Swagger solo si `process.env.NODE_ENV !== 'production'` o `ENABLE_API_DOCS=true`; o protegerlo con el guard. En producción, bloquear también en Caddy: `@docs path /api/docs*` → `respond 404`. Declarar `security: [{bearer: []}]` en el documento para los endpoints autenticados.
- **Verificación**: `curl -so /dev/null -w '%{http_code}' https://todo.reflexionia.com/api/docs-json` da 404.

### S-07 (Media) SSRF en webhooks, automatizaciones e iCal

- **Evidencia**: `modules/webhooks/webhooks.controller.ts:111` y `automations.controller.ts:183` hacen `fetch(url)` sobre una URL guardada por el usuario; `modules/calendar/calendar.service.ts:~444` `fetchIcal` acepta `http:` y `https:` y sigue redirecciones. No hay bloqueo de IPs privadas, loopback, link-local (169.254.169.254) ni nombres internos Docker (`postgres`, `redis`, `todo-api`).
- **Riesgo**: quien tenga un PAT con `webhooks:manage`/escritura (agente comprometido, prompt injection a un agente con MCP) puede sondear la red interna del host y la red compartida con <NEIGHBOR_APP>. El destino de webhook se puede leer también por la respuesta de iCal.
- **Arreglo**: crear `apps/api/src/security/safe-fetch.ts`: solo `https:` (http solo si `ALLOW_HTTP_WEBHOOKS=true`), resolver DNS y rechazar loopback, RFC1918, 169.254.0.0/16, fc00::/7, ::1, y revalidar tras cada redirección (o `redirect: 'manual'`); fijar la IP resuelta para evitar DNS rebinding; limitar tamaño de respuesta (p. ej. 2 MB en iCal) y timeout. Usarlo en los tres sitios. Validar la URL también al crearla (DTO `@IsUrl({protocols:['https'], require_tld:true})`).
- **Verificación**: tests que intenten `http://127.0.0.1:5432`, `http://169.254.169.254/`, `http://redis:6379`, un dominio que resuelva a 10.x y una redirección a localhost, todos rechazados.

- **Confirmado en vivo (ronda 2)**: `POST /webhooks` acepta `https://127.0.0.1:1/zz`, `https://[::1]:1/zz` y `https://127.0.0.1.nip.io:1/zz` (nombre público que resuelve a loopback); `POST /webhooks/:id/ping` devuelve `{state:"failed",status:null}`, es decir, un oráculo de conexión (puerto abierto/cerrado, estado HTTP) hacia la red interna. `POST /calendar/subscriptions` con `provider:ical` acepta `http://127.0.0.1:1/...` e intenta conectar (500 por S-19). Solo usé el puerto 1 de loopback (cerrado); no probé metadatos de nube ni redes internas. Las acciones `webhook` de automatizaciones usan `fetch` directo en `automations.controller.ts` ~183 sin validar esquema ni destino (revisado en código, no ejecutado). `fetchIcal` (`calendar.service.ts` ~451) sigue redirecciones y lee todo el cuerpo con `response.text()` antes de comprobar el tamaño (consumo de memoria).

### S-08 (Media) Secretos en claro en la base de datos

- **Evidencia**: `apps/api/prisma/schema.prisma`: `User.totpSecret` (l.189), `User.googleRefreshToken` (l.191), `WebhookEndpoint.secret` (l.951) sin cifrar. El secreto de Telegram es `sha256(botToken)` sin sal (`integrations/telegram-secret.ts`).
- **Riesgo**: un volcado de la BD o del backup (que sale a Google Drive) da acceso a 2FA, a Google Calendar/Drive de Pablo y permite falsificar firmas de webhooks.
- **Arreglo**: cifrado AES-256-GCM en la capa de servicio con clave derivada de `APP_SECRET` (HKDF, o mejor una variable `DATA_ENCRYPTION_KEY` distinta) para esos tres campos, con migración que cifre lo existente. Telegram: secreto aleatorio propio `TELEGRAM_WEBHOOK_SECRET` en vez de derivado del token. Exigir `APP_SECRET` ≥32 bytes al arrancar y fallar si es el valor de ejemplo (`generar-con-openssl-rand-hex-32`). Cifrar también los backups (`age`/`gpg`) antes de subirlos.
- **Verificación**: `SELECT totp_secret FROM users` no muestra texto legible; test de ida y vuelta; el backup restaurado funciona.

### S-09 (Media) Contenedores y despliegue

- **Evidencia**: `apps/api/Dockerfile` y `apps/web/Dockerfile`: la API corre como root (sin `USER`), la imagen final es la de build completa (copia `/app` con devDependencies y fuentes), `prisma migrate deploy` se ejecuta en cada arranque con las credenciales del runtime. No hay `.dockerignore` en el repo (el contexto incluye `.git`, docs, posibles `.env` locales). `deploy/production/docker-compose.yml` sin `read_only`, `cap_drop`, `security_opt: no-new-privileges`, límites de memoria/CPU. Redis sin contraseña (mitigado: red `private: internal`). nginx de la web no oculta versión: `POST /mcp` en la web devuelve página 405 con `nginx/1.31.7`.
- **Bien hecho**: ni Postgres ni Redis publican puertos en el compose de producción (red interna), el stack no toca 80/443, secretos en `/etc/todo/production.env` fuera de git, `AUTH_MODE` forzado vacío.
- **Arreglo**: crear `.dockerignore` (`.git`, `node_modules`, `.env*`, `docs`, `data`, `backups`, `*.md`). Dockerfile API: etapa final con `pnpm deploy --prod` o copiar solo `dist` + `node_modules` de producción, `USER node`. Compose: `read_only: true` + `tmpfs: [/tmp]`, `cap_drop: [ALL]`, `security_opt: ['no-new-privileges:true']`, `mem_limit`, `pids_limit`. Redis: `--requirepass` + `REDIS_URL` con contraseña. nginx: `server_tokens off;` en `apps/web/nginx.conf` y páginas de error propias. Separar usuario de migraciones del de la app en Postgres. Fijar imágenes por digest o versión menor (`postgres:17-alpine` a `17.x-alpine`).
- **Verificación**: `docker compose exec api id` no es root; `docker inspect` muestra `ReadonlyRootfs=true`; `curl -s -X POST https://todo.reflexionia.com/mcp` no muestra versión.

### S-10 (Baja) Sesión y cookie

- **Evidencia**: `auth/session-cookie.ts`: cookie `rfx_session` httpOnly, SameSite=Lax, Secure en producción (bien), 30 días fijos; el token CSRF se exige por cabecera `X-CSRF-Token` en métodos no GET (`api-auth.guard.ts` `assertCsrf`, bien). Faltan: caducidad por inactividad, rotación del id de sesión al elevar privilegios, prefijo `__Host-`. `POST /auth/login` no exige token CSRF (login CSRF, bajo impacto).
- **Arreglo**: renombrar a `__Host-rfx_session` (Secure, Path=/, sin Domain), expiración deslizante de 7 días de inactividad + máximo 30, revocar sesiones al cambiar contraseña o desactivar 2FA, y `SameSite=Strict` si el flujo OAuth de Google lo permite (el callback es GET de navegación: probar).
- **Verificación**: cabecera `Set-Cookie` con `__Host-`; sesión inactiva 7 días da 401.

### S-11 (Baja) Pequeños fallos de información

- `configure-app.ts`: `X-Request-Id` se refleja tal cual del cliente (sin límite de longitud ni charset): validar `^[A-Za-z0-9-]{8,64}$` o generar siempre uno propio (riesgo de inyección en logs).
- `POST /api/v1/mcp` sin credenciales responde `Authentication is not configured`, que cuenta que `AUTH_MODE` está vacío. Cambiar a `Authentication required` genérico en `api-auth.guard.ts` `devUser()`.
- Errores de parseo JSON devuelven el mensaje interno `Unexpected end of JSON input`: devolver mensaje genérico.

### S-12 (Baja) SPA responde 200 a rutas sensibles

- `GET /.env`, `/.git/HEAD`, `/.git/config`, `/package.json`, `/docker-compose.yml`, `/Caddyfile`, `/backups/` devuelven 200 con el `index.html` (782 bytes). Verifiqué que el cuerpo es el HTML de la SPA: no hay fuga real. Los source maps NO están publicados (el `.map` devuelve HTML).
- **Arreglo**: en `apps/web/nginx.conf`: `location ~ /\.(?!well-known) { return 404; }` y `location ~* \.(env|yml|yaml|json|md|sql|map|bak)$ { return 404; }` (excepto `manifest.webmanifest`). Añadir `/.well-known/security.txt` con contacto.
- **Verificación**: `curl -so /dev/null -w '%{http_code}' https://todo.reflexionia.com/.env` da 404.

### S-13 (Baja) CI y gobierno del repo

- `.github/workflows/ci.yml` tiene lint, tipos, tests y OpenAPI check, pero ningún escaneo de seguridad. No hay `dependabot.yml`, ni CodeQL, ni escaneo de secretos.
- **Arreglo**: añadir jobs `pnpm audit --prod --audit-level=high`, `github/codeql-action` (javascript-typescript), `gitleaks/gitleaks-action`, y activar en GitHub: Secret scanning + Push protection, Dependabot alerts, protección de `main` (PR obligatorio, CI verde). No pude verificar la protección de rama (la API la oculta sin autenticar): Pablo debe revisarlo en Settings > Branches.
- Detalle de qué añadir (SECURITY.md, LICENSE, dependabot, CodeQL, gitleaks, branch protection) con ficheros listos en la **sección 5**.
- **Verificación**: pestaña Security del repo con las tres funciones activas.

### S-14 (Info) Puertos

- Banner real solo en el **22/tcp**: `SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.20`. 80 redirige 308 a HTTPS y 443 sirve TLS (certificado Let's Encrypt emitido 18 oct 2026, caduca 16 ene 2027, renovación automática de Caddy).
- **Limitación**: desde mi red todo intento TCP "conecta" (incluso el puerto 31337 inventado), así que el escaneo de otros puertos no es fiable. No afirmo que 2375, 5432, 6379, etc. estén cerrados o abiertos.
- **Arreglo/verificación en el servidor**: `sudo ss -tlnp` (solo deben escuchar 22, 80, 443 hacia fuera), `docker ps --format '{{.Names}} {{.Ports}}'` (ningún `0.0.0.0:5432/6379/2375`; Docker salta UFW al publicar puertos), `sudo ufw status verbose`, `sshd -T | rg -i 'passwordauthentication|permitrootlogin'` (debe ser `no` y `no`; solo claves), instalar `fail2ban` o `crowdsec`. Desde fuera: `nmap -Pn -p- <SERVER_IP>` con una máquina que no tenga proxy transparente.

### S-15 (Alta) Un PAT con `profile:write` escala a todos los scopes y puede borrar la cuenta

- **Evidencia (en vivo)**: creé el token `ZZ TEST sec-pw` solo con `profile:write` (en la UI). Con él, `POST /api/v1/me/tokens` con scopes `tasks:read, tasks:write, backup:read, webhooks:manage, automations:manage, profile:write` devolvió 201 y un token nuevo con todos esos scopes (revocado al instante; con el token revocado `GET /tasks` da 401). Código: `apps/api/src/auth/tokens.service.ts` `create()` solo valida que los scopes existan (`isApiScope`), no que el llamante ya los tenga. `DELETE /api/v1/me` (`me.controller.ts` ~38) exige `profile:write` y `dto.confirmation` (el email, que cualquiera con `profile:read` conoce); no pide contraseña ni TOTP. No ejecuté el borrado de cuenta.
- **Riesgo**: un agente (Cursor, ChatGPT, MCP) al que se dé `profile:write` puede darse a sí mismo `backup:read` (exportar todo), `webhooks:manage` (exfiltrar por SSRF/eventos) o borrar toda la cuenta. También `POST /oauth/clients` pide `profile:write`.
- **Arreglo**:
  1. `tokens.service.ts create()`: si la petición viene de un PAT (`user.tokenId !== null`), prohibir crear/revocar tokens ajenos y exigir que los scopes pedidos sean subconjunto de `user.scopes`. Lo más seguro: la gestión de tokens (`POST/DELETE /me/tokens`, `/oauth/clients`) solo con sesión de navegador (`user.sessionId !== null`), nunca con PAT.
  2. Separar el scope `profile:write` de la gestión de cuenta: crear scope `account:admin` que **no se pueda asignar a un PAT** (quitarlo de `API_SCOPES` de PAT en `scopes.ts` y de la UI `TokensPage.tsx`), y exigir sesión.
  3. `DELETE /me`: exigir contraseña actual (y TOTP si está activo) además del email, y solo con sesión. Enviar un correo de aviso.
  4. Tests e2e en `apps/api/test/agent-access.e2e-spec.ts`: PAT con `profile:write` recibe 403 en `POST /me/tokens` y `DELETE /me`.
- **Verificación**: repetir con un PAT `profile:write`: `curl -X POST .../me/tokens` devuelve 403; `DELETE /me` devuelve 403.

### S-16 (Media) Endpoints "autenticado sin scope" accesibles con cualquier PAT

- **Evidencia (en vivo)**: con el token `ZZ TEST sec-ro` (solo `tasks:read`): `GET /api/v1/auth/sessions` 200 (lista sesiones con user agent y último uso), `DELETE /api/v1/auth/sessions/<uuid inexistente>` llega al manejador (404 `session_not_found`, no 403), `GET /api/v1/sync` 200 con eventos `project.*`, `tag.*`, `session.created`, `token.created`, `telegram.linked`, y `GET /search` devuelve también listas y etiquetas. Causa: `auth.controller.ts` usa `@Authenticated()` sin scope en `sessions`, y `sync`/`search` solo piden `tasks:read`. En la práctica un token de solo lectura puede cerrar la sesión de Pablo en el navegador. MCP sí filtra bien por scope (con `tasks:read` solo ve 5 herramientas y `create_task` devuelve `scope_missing`).
- **Arreglo**: en `auth.controller.ts` exigir sesión (no PAT) en `GET/DELETE sessions`: `if (user.sessionId === null) throw 403`. En `sync.service.ts` filtrar los eventos por los scopes del token (`task.*` requiere `tasks:read`, `project.*` `lists:read`, `tag.*` `tags:read`; nunca devolver `session.*`, `token.*`, `telegram.*` a un PAT). En `search.service.ts` devolver solo los grupos permitidos por scope.
- **Verificación**: con un PAT `tasks:read`: `/auth/sessions` 403; `/sync` no contiene `session.created` ni `token.created`; `/search` solo grupo `task`.

### S-17 (Media) El guard de autenticación falla "abierto"

- **Evidencia**: `apps/api/src/auth/api-auth.guard.ts` `canActivate()`: `if (!authenticated && scopes.length === 0) return true;`. Cualquier controlador nuevo sin `@Scopes(...)` ni `@Authenticated()` es público. Hoy las rutas públicas son las esperadas (`/health`, `/auth/login`, `/auth/register`, `/oauth/token`, `/integrations/telegram/webhook` con secreto, `/integrations/google/callback`, `/inbound/email`, `/feeds/:token`), comprobado: los 136 GET sin credenciales dan 401 salvo esos.
- **Arreglo**: invertir el valor por defecto. Añadir un decorador `@Public()` y registrar `ApiAuthGuard` como `APP_GUARD` global que exija auth si la ruta no es `@Public()`. Marcar `@Public()` solo las 8 rutas anteriores. Añadir un test que recorra todas las rutas del OpenAPI y falle si hay una pública fuera de la lista blanca.
- **Verificación**: test nuevo `public-routes.e2e-spec.ts` en verde; añadir un controlador de prueba sin decorador devuelve 401.

### S-18 (Baja) Adjuntos, caché y CSV

- **Adjuntos (en vivo)**: subí `.html`, `.svg` y `.exe` con `Content-Type: text/html` declarado: los acepta y guarda el MIME del cliente (`mime_type: text/html` incluso para el `.svg` y el `.exe`). Mitigado: la descarga lleva `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` y la CSP de la API, por lo que **no hay XSS almacenado**. Nombre `../../../../tmp/zz"; x=y.txt` se sanea (`zz__ x_y.txt`), sin path traversal. 26 MB devuelve 413 (límite de 25 MB correcto). No hay cuota total por usuario ni por tarea: un token con `tasks:write` puede llenar el disco (25 MB por petición, 1000 peticiones por ventana).
  - Arreglo: en `attachment-storage.ts`/`tasks.controller.ts`, lista blanca de MIME (imágenes, pdf, texto, office), detectar el tipo real por magic bytes, cuota por usuario (p. ej. 2 GB) y un máximo de adjuntos por tarea.
- **Caché (en vivo)**: `GET /api/v1/auth/session`, `/tasks`, etc. no llevan `Cache-Control`. Arreglo: en `configure-app.ts` un middleware que ponga `Cache-Control: no-store` a todo `/api/*` salvo lo público cacheable.
- **CSV**: `packages/domain/src/transfer/csv.ts` `csvCell()` no neutraliza celdas que empiezan por `=`, `+`, `-`, `@`, tab o CR. Una tarea creada por correo entrante, Telegram o API con título `=HYPERLINK(...)` se ejecuta al abrir la exportación en Excel. Arreglo: anteponer `'` a esas celdas al exportar y añadir test en `csv.spec.ts`.

### S-19 (Baja) Errores 500 donde debe haber 4xx

- **Evidencia (en vivo)**: `GET /api/v1/tasks?project_id=x` devuelve 500 `internal_error` (falta `ParseUUIDPipe`/`@IsUUID` en el query). Cuerpo JSON de 3 MB devuelve 500 en lugar de 413 (el filtro `api-exception.filter.ts` convierte `PayloadTooLargeError` en 500). `POST /calendar/subscriptions` con una URL que no conecta devuelve 500 y **deja guardada la suscripción** (fetch sin try/catch en `calendar.service.ts`).
- **Arreglo**: validar con `@IsUUID()` todos los filtros de query (`project_id`, `tag_id`, `filter_id`, etc.); en `api-exception.filter.ts` respetar `error.status` de errores HTTP de Express (413, 400 por JSON malformado sin reflejar el texto del parser); en `calendar.service.ts` hacer el fetch inicial antes de persistir y devolver 502 `calendar_fetch_failed`.
- **Verificación**: las tres peticiones devuelven 400, 413 y 502.

### S-20 (Baja) Red Docker compartida con otra app

- **Evidencia**: `deploy/production/docker-compose.yml`: `api` y `web` se unen a `<EDGE_NETWORK>` (externa) con alias `todo-api` y `todo-web`; `postgres` y `redis` solo en la red `private` interna (bien).
- **Riesgo**: un contenedor comprometido de `<NEIGHBOR_APP>` llega a `todo-api:3000` directamente (sin límite de 26 MB de Caddy, sin cabeceras) y viceversa.
- **Arreglo**: red `edge` dedicada solo entre el Caddy y `todo-*` (el Caddy se conecta a esa red además de a la suya); o al menos no exponer `api:3000` a toda la red compartida: `todo-api` solo debe ser accesible desde el contenedor Caddy. Fijar `trust proxy` al CIDR de esa red (ver S-02).

### S-21 (Baja) Configuración fija que debería ser variable de entorno

- `apps/api/src/modules/integrations/google-oauth.ts`: `REDIRECTS` fija `https://todo.reflexionia.com` y `localhost:5173`; `integrations.controller.ts` ~199 cae a `http://127.0.0.1:5173` si el estado no valida. Usar `PUBLIC_URL` (ya existe) para construir la lista y el retorno.
- `scheduler/reminder.transport.ts` líneas 53 y 72: `todo@reflexionia.com` por defecto. Exigir `SMTP_FROM` y `VAPID_SUBJECT` en producción (fallar al arrancar si faltan).
- `.github/workflows/ci.yml`: usuario `reflexionia` y contraseña `ci` de Postgres de CI: está bien para CI efímero, pero muévelo a `env:` del job para no repetirlo.
- `.env.example`: `POSTGRES_PASSWORD=dev` y `AUTH_MODE=dev` por defecto. Mantén los avisos, y haz que la API **no arranque** con `AUTH_MODE=dev` si `NODE_ENV=production`.
- `docker-compose.dev.yml` publica 5432, 6379, 1025 y 8025 en `0.0.0.0` con contraseña `dev`: cambia a `127.0.0.1:5432:5432`, etc. (en un portátil en una red compartida quedaría expuesto).

## 3. Lo que revisé y está bien (no tocar)

- **Secretos**: ningún token/clave en el árbol ni en el historial completo (regex de claves AWS/GitHub/Slack/OpenAI/Telegram/PEM y de `secret|password|token|key = "..."`); solo valores de test (`correct-horse`, `rfx_pat_secret`). `.env` y `.env.*` ignorados, `.env.example` sin valores reales (usa `dev`/`dev-only` para local: está avisado en el propio fichero).
- **SQL injection**: las 3 consultas crudas (`tasks.service.ts` ~1824 y ~2011, `search.service.ts` ~145) usan plantillas etiquetadas de Prisma con parámetros; el resto es Prisma ORM. No hay `$queryRawUnsafe`.
- **XSS (ronda 2, en vivo)**: creé una lista, etiqueta, tarea, nota, subtarea, token y nombre de usuario con `<img src=x onerror=...>`, `<svg onload>`, `<script>`, `[x](javascript:...)` y `<a href=javascript:>`; los abrí en lista, tarea, etiqueta, búsqueda, calendario, panel, ajustes/tokens, ajustes/cuenta y hoy: siempre se pinta como texto, 0 elementos inyectados, `window.__xss` nunca se ejecutó. No hay renderizado de markdown. Además la web no usa `dangerouslySetInnerHTML`, `innerHTML`, `eval` ni `new Function` (React escapa). El token de sesión es httpOnly, no hay secretos en `localStorage` (solo preferencias de UI). El bundle JS no contiene claves.
- **CSRF (ronda 2, en vivo)**: desde el navegador con sesión, POST sin cabecera `X-CSRF-Token` da 403 `csrf_required`, con cabecera falsa 403 `csrf_invalid`, y con `Content-Type: text/plain` (petición simple cross-site) también 403. La cookie `rfx_session` no es visible desde JS (httpOnly). **CSRF**: cookie SameSite=Lax + cabecera `X-CSRF-Token` comparada en tiempo constante en todo método no GET con cookie; los PAT por `Authorization: Bearer` no son vulnerables a CSRF. No hay CORS habilitado (no se reflejan orígenes: bien).
- **Autenticación**: Argon2id (19 MiB, t=2), PAT y sesiones guardados solo como hash SHA-256, comparaciones con `timingSafeEqual`, scopes por endpoint, registro cerrado tras el primer usuario, OAuth con PKCE y `redirect_uri` exacto contra lista, estado de Google firmado y con caducidad de 10 min y lista blanca de redirecciones.
- **Autorización**: scopes de PAT bien aplicados en lo comprobado (matriz de 33 rutas con `tasks:read`: todas 403 salvo las de S-16), MCP filtra por scope, el PAT revocado da 401 de inmediato, la cabecera `x-dev-user-email` no funciona en producción (401), `forbidNonWhitelisted` activo (campos desconocidos dan 400). `/feeds/:token` con tokens falsos y con `../../etc/passwd`: 404 uniforme. Webhook de Telegram: 401 sin secreto correcto. IDOR (código): en todas las rutas de tareas/listas/etiquetas/filtros se busca primero por `ownerId` y luego se actúa (`batch` incluido); recomiendo añadir `ownerId` también a los `updateMany`/`update` por id como defensa en profundidad (`tasks.service.ts` ~829, `webhooks.controller.ts` ~240, `notes.controller.ts` ~105). Sin credenciales, los 136 GET del OpenAPI devuelven 401 (salvo `/health`, el callback de Google y `/feeds/*`, que es público por diseño; no revisé cómo valida el token de feeds: confírmalo). `webhooks/deliveries/:id/retry` filtra por `endpoint.ownerId`. Ojo: `WebhookDispatcher.deliverOne` (`webhooks.controller.ts` ~95) busca por `id` sin owner; hoy solo lo llaman rutas ya filtradas, pero añade `ownerId` en la firma para que no se use mal en el futuro.
- **Adjuntos (ver S-18 para lo que falta)**: clave de almacenamiento validada con regex y `startsWith(root)` (sin path traversal), `safeFileName`, `safeMime`, `nosniff`, descarga con `Content-Disposition: attachment`, límite de 25 MB.
- **TLS/cabeceras**: HTTPS forzado (308), HSTS 1 año con subdominios, `Server` oculto en Caddy, helmet en la API, `X-Frame-Options: DENY`.
- **Red del compose de producción**: DB y Redis solo en red `internal`. Sin puertos publicados en `deploy/production/docker-compose.yml`.
- **Entradas externas**: webhooks salientes solo `https` (`IsUrl({protocols:['https']})`), validación `class-validator` con whitelist, errores sin stack, registro cerrado (`POST /auth/register` da 403 `registration_closed`), HTTP responde 308, TLS 1.2 y 1.3 (sin 1.0/1.1), certificado Let's Encrypt válido, sin `.map` publicados, sin CORS.
- **SQL injection (en vivo)**: `search?q=' OR 1=1--`, `sort=title;DROP`, cursores y límites manipulados: respuestas 200/400 normales, sin error de base de datos.

## 4. Orden de trabajo sugerido para el agente

1. **S-15 y S-16** (escalada de scopes, sesiones y `sync`): lo más serio de la ronda 2; afecta a los tokens de agentes. Con tests e2e.
2. S-17 (guard cerrado por defecto), en el mismo cambio que S-15/S-16 porque toca el mismo guard.
3. S-01 y S-02 juntos (rate limit de login + trust proxy), con tests.
4. S-03 (subir nodemailer y resto) + S-13 (CI de seguridad, Dependabot).
5. S-05, S-06, S-12, S-18 (caché, CSP, cabeceras): bajo riesgo, en Caddy/nginx/`configure-app.ts`.
6. S-07 (safe-fetch), S-08 (cifrado de secretos, con migración) y S-19 (errores 4xx).
7. S-09, S-10, S-20, S-21 (contenedores, sesión, red, configuración).
8. **S-04 / sección 5: dejar el repo público limpio.** Antes de difundir el repo.
9. S-14: comprobar en el servidor (comandos en S-14).

Al terminar cada punto: `pnpm lint typecheck test`, el comando de verificación indicado y volver a lanzar Observatory (objetivo A o A+).

## 5. Cómo dejar el repositorio público limpio

Decisión de Pablo (mensaje de WhatsApp del 19 oct, 10:53): el repo sigue público para que otros se beneficien. Objetivo: que cualquiera pueda clonarlo, desplegarlo y contribuir sin que el repo revele TU servidor, TU usuario de SSH ni TU persona. Nada de esto es un secreto que haya que rotar (no hay claves en el repo ni en el historial), pero es información de reconocimiento.

**Paso 1. Datos de tu infraestructura a sacar del árbol.** Comando para verlos todos: `git grep -nIE '<SERVER_IP>|<NEIGHBOR_APP>|deploy@|~/\.ssh|/opt/todo|/etc/todo|<PERSONAL_EMAIL>' -- . ':!pnpm-lock.yaml'`. Encontrado en `main`:

- `docs/deployment.md` (líneas 1-32): IP, app vecina `<NEIGHBOR_APP>`, ruta `/opt/turugby/production`, PR #59 de otro repo.
- `docs/handoff.md` (líneas ~99, 141, 168-180): IP, comando `ssh -i ~/.ssh/<SSH_KEY_NAME> ... deploy@<IP>`, rutas, usuario `deploy`, enlace a `github.com/povedica/<NEIGHBOR_APP>/pull/59`. Es un diario de traspaso entre agentes: bórralo del repo público o deja solo la parte técnica genérica.
- `deploy/production/docker-compose.yml` (líneas 1-3 y red `<EDGE_NETWORK>`), `deploy/production/todo.caddy`, `deploy/production/deploy.sh`, `deploy/reflexionia.cron`, `deploy/production/cron-backup.sh`, `deploy/production/cron-restore-verify.sh`: nombre de la app vecina, rutas `/opt/todo/...`, usuario `deploy`.
- `docs/prompts/*`, `docs/spec/*`, `.cursor/rules/00-project.mdc`, `AGENTS.md`, `README.md`, `scripts/init-harness.sh`: "Hetzner existente de Pablo". No es grave, pero generaliza a "un VPS con Docker".
- `docs/spec/bugs-prueba-canales-2026-10-18.md` y los `cursor-prompt-*`: revisa a mano que no lleven chat IDs de Telegram, correos, nombres de familiares o datos reales (no los abrí uno a uno; `git grep` no encontró chat IDs ni teléfonos).

**Paso 2. Cómo sustituirlo.**

- Marcadores en docs y scripts: `<SERVER_IP>`, `<DEPLOY_USER>`, `<SSH_KEY>`, `/opt/<app>/app`, `/etc/<app>/production.env`. `deploy.sh` ya lee `RUNTIME_ENV_FILE` y `CADDY_SITES_DIR`: extiéndelo a `APP_DIR`, `BACKUP_DIR` y `EDGE_NETWORK` en lugar de fijarlos.
- `deploy/production/docker-compose.yml`: red externa configurable, `name: ${EDGE_NETWORK:-todo_edge}` en vez de `<EDGE_NETWORK>`. Quita los comentarios que nombran la app vecina.
- Los datos reales (IP, usuario, clave, estructura de la otra app, PR ajeno) van **fuera del repo**: nota local, repo privado aparte (`povedica/tick-tack-done-ops`) o gestor de contraseñas. Añade `docs/private/` y `*.private.md` a `.gitignore`.
- `docs/deployment.md` nuevo y genérico: requisitos (VPS con Docker, dominio), `cp .env.example .env`, generar secretos con `openssl rand -hex 32`, `docker compose up -d`, Caddy/HTTPS, primer usuario, `REGISTRATION_OPEN=false`, backups, actualización. Sin IP ni usuario reales.

**Paso 3. `.env.example` y secretos.** Ya no tiene valores reales. Mejoras:

- Cabecera: "NO pongas secretos reales aquí; copia a `.env` (ignorado por git)".
- Ejemplos claramente falsos que fallen en producción: `APP_SECRET=change-me-openssl-rand-hex-32`. La API debe negarse a arrancar con `NODE_ENV=production` si `APP_SECRET` empieza por `change-me` o `AUTH_MODE=dev` (ver S-21).
- `SMTP_FROM` y `VAPID_SUBJECT`: `todo@example.com` en vez de `todo@reflexionia.com`.
- `.gitignore`: añade `.env*.local`, `*.pem`, `*.key`, `*.p12`, `id_*`, `*.sqlite`, `*.dump`, `*.sql.gz`, `docs/private/`, `*.private.md`. Crea `.dockerignore` con `.git`, `node_modules`, `.env*`, `data`, `backups`, `docs`.

**Paso 4. Historial de git.** La IP aparece en 2 commits, el nombre de clave SSH en 1 y tu email en los 122 commits; las ramas `feat/v1-v2`, `fix/capture-and-import-roundtrip`, `fix/ux-audit-2026-10-18` y `refs/pull/*` también los contienen. Elige nivel:

- **Nivel A (sin riesgo, suficiente en general)**: no reescribir. La IP no es un secreto y la clave privada no está. Mitiga cerrando el servidor (S-14: solo SSH con clave, `PermitRootLogin no`, fail2ban, UFW) y usa el email noreply desde ahora (paso 5).
- **Nivel B (cero rastro en la rama, con trabajo)**: reescribir con `git filter-repo` sobre un clon espejo nuevo:
  ```
  git clone --mirror https://github.com/povedica/tick-tack-done.git && cd tick-tack-done.git
  pip install git-filter-repo
  cat > /tmp/replace.txt <<'EOT'
  <SERVER_IP>==><SERVER_IP>
  <SSH_KEY_NAME>==><SSH_KEY>
  <NEIGHBOR_APP>==>another-app
  <EDGE_NETWORK>==>edge_network
  EOT
  git filter-repo --replace-text /tmp/replace.txt
  # mailmap: "Nombre Nuevo <email nuevo> Nombre Viejo <email viejo>"; sustituye ID por tu id numérico de GitHub
  echo 'povedica <ID+povedica@users.noreply.github.com> povedica <<PERSONAL_EMAIL>>' > /tmp/mailmap
  git filter-repo --mailmap /tmp/mailmap
  ```
  filter-repo elimina el remoto `origin`: vuelve a configurarlo apuntando al repo y haz `git push --force --mirror`. Después, el servidor (`/opt/todo/app`), los worktrees de Cursor y cualquier clon deben hacer `git fetch && git reset --hard origin/main` o clonar de nuevo. Las PR cerradas conservan `refs/pull/*` y GitHub puede servir commits antiguos por hash: para purgarlos hay que pedirlo a GitHub Support ("remove cached views and sensitive data"). Por eso, si quieres cero rastro de verdad, usa el nivel C.
- **Nivel C (el más simple y 100% limpio)**: repo nuevo público con el árbol ya saneado y un único commit (`git checkout --orphan clean && git add -A && git commit -m "Initial public release"` y subirlo a un repo nuevo), y pasar el actual a privado como respaldo con historial (`gh repo edit povedica/tick-tack-done --visibility private --accept-visibility-change-consequences`). Se pierden estrellas, forks e issues si los hubiera.
- En todos los niveles, antes de publicar: `gitleaks detect --source . --log-opts="--all"` y `trufflehog git file://. --only-verified`.

**Paso 5. Identidad de commits.** En GitHub > Settings > Emails activa "Keep my email addresses private" y "Block command line pushes that expose my email". Localmente: `git config --global user.email "<ID>+povedica@users.noreply.github.com"` (y que `.cursor/setup-worktree-unix.sh` lo configure en los worktrees). Los commits ya hechos solo cambian con nivel B o C.

**Paso 6. Ficheros de comunidad que faltan** (hoy no existen `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS` ni `.github/dependabot.yml`):

- `LICENSE`: decisión tuya. Sin licencia nadie puede reutilizar legalmente el código aunque sea público. MIT o Apache-2.0 para máxima adopción; AGPL-3.0 si quieres que quien lo ofrezca como servicio publique sus cambios. Añade `"license"` en los `package.json`.
- `SECURITY.md` en la raíz:
  ```
  # Política de seguridad
  ## Versiones con soporte
  Solo la rama `main` recibe correcciones de seguridad.
  ## Cómo informar de una vulnerabilidad
  No abras un issue público. Usa "Report a vulnerability" en la pestaña Security del repositorio
  (private vulnerability reporting de GitHub) o escribe a <correo de seguridad>.
  Respuesta inicial en 7 días. Divulgación coordinada: 90 días o hasta publicar el arreglo.
  ## Alcance
  Proyecto personal de un solo usuario. Si lo autoalojas, mantén REGISTRATION_OPEN=false,
  AUTH_MODE vacío en producción, secretos fuertes y el servidor actualizado.
  ```
- `.github/dependabot.yml`:
  ```
  version: 2
  updates:
    - package-ecosystem: npm
      directory: /
      schedule: { interval: weekly }
      groups: { minor-and-patch: { update-types: [minor, patch] } }
    - package-ecosystem: github-actions
      directory: /
      schedule: { interval: weekly }
    - package-ecosystem: docker
      directory: /apps/api
      schedule: { interval: weekly }
    - package-ecosystem: docker
      directory: /apps/web
      schedule: { interval: weekly }
  ```
- `CONTRIBUTING.md` corto (entorno con `docker-compose.dev.yml`, `pnpm test`, commits convencionales, "no subas `.env` ni datos reales"), `.github/CODEOWNERS` con `* @povedica`.
- `README.md`: aviso de proyecto personal en desarrollo, pasos de autoalojado genéricos, enlace a `SECURITY.md`; quita "Hetzner de Pablo".

**Paso 7. Ajustes de GitHub** (no los puedo ver sin tu sesión de GitHub):

- Code security: **Secret scanning** y **Push protection**, **Dependabot alerts** y **security updates**, **Private vulnerability reporting**, **CodeQL** (default setup).
- Rulesets o Branches para `main`: PR obligatoria, checks `quality`, `test-unit` y `test-integration` obligatorios, sin force-push ni borrado, conversaciones resueltas.
- Actions > General: permisos por defecto "Read repository contents", Actions no puede crear ni aprobar PR, y aprobación obligatoria para PR de primeros colaboradores.
- Desactiva Wiki y Projects si no los usas. Revisa Deploy keys y Secrets de Actions.

**Paso 8. CI de seguridad** (en `.github/workflows/security.yml`; fija las acciones por SHA con ayuda de Dependabot):

```
name: Security
on: { push: { branches: [main] }, pull_request: {}, schedule: [{ cron: '0 6 * * 1' }] }
permissions:
  contents: read
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --prod --audit-level=high
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
  codeql:
    runs-on: ubuntu-latest
    permissions: { security-events: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with: { languages: javascript-typescript }
      - uses: github/codeql-action/analyze@v3
```

Añade `.gitleaks.toml` con `[allowlist]` para los valores de test conocidos (`correct-horse`, `rfx_pat_secret`) y un `.pre-commit-config.yaml` con gitleaks.

**Paso 9. Verificación final** (todo debe cumplirse):

- `git grep -nIE '<SERVER_IP>|<NEIGHBOR_APP>|ssh -i|deploy@|<PERSONAL_EMAIL>' -- . ':!pnpm-lock.yaml'` sin resultados; con nivel B o C, además `git log --all -S'<SERVER_IP>' --oneline` sin resultados.
- Nivel B o C: `git log --all --format='%ae' | sort -u` solo muestra el noreply.
- `gitleaks detect --source . --log-opts="--all"` sin hallazgos.
- Pestaña Security con secret scanning, push protection, Dependabot, CodeQL y private reporting activos; existen `SECURITY.md`, `LICENSE` y `dependabot.yml`.
- `gh api repos/povedica/tick-tack-done/branches/main/protection` devuelve la regla (o el ruleset aparece en Settings).
- Un clon limpio en otra máquina arranca con `cp .env.example .env && docker compose -f docker-compose.dev.yml up -d && pnpm install && pnpm dev` sin nada tuyo.

## 6. Registro de la ronda 2 (qué se probó y cómo se limpió)

| Prueba                                                                    | Resultado                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro de usuario de prueba                                             | 403 `registration_closed` (bien; sin usuario creado)                                                                                                                                                                                                                                                                                                |
| Matriz de scopes con PAT `tasks:read` (33 rutas, MCP, escrituras)         | Correcto salvo `/auth/sessions`, `/sync`, `/search` (S-16)                                                                                                                                                                                                                                                                                          |
| Escalada con PAT `profile:write`                                          | Confirmada (S-15); token creado y revocado; borrado de cuenta NO ejecutado                                                                                                                                                                                                                                                                          |
| XSS en título, notas, subtarea, etiqueta, lista, token, nombre de usuario | No explotable; todo escapado                                                                                                                                                                                                                                                                                                                        |
| Adjuntos (html, svg, exe, nombre con traversal, 26 MB)                    | Sin XSS ni traversal; falta lista de MIME y cuota (S-18)                                                                                                                                                                                                                                                                                            |
| SSRF webhooks (loopback https, `::1`, nip.io)                             | Aceptado (S-07); solo puerto 1 de loopback; el ping devuelve `failed/null`                                                                                                                                                                                                                                                                          |
| SSRF iCal (`http://127.0.0.1:1`)                                          | Intenta conectar; 500 y queda guardada (S-07, S-19)                                                                                                                                                                                                                                                                                                 |
| CSRF con sesión (sin cabecera, falsa, `text/plain`)                       | 403 en los tres casos (bien)                                                                                                                                                                                                                                                                                                                        |
| CORS (Origin ajeno, preflight)                                            | Sin cabeceras CORS (bien)                                                                                                                                                                                                                                                                                                                           |
| Errores: JSON roto, tipos erróneos, UUID inválido, SQLi en query, 3 MB    | 400 salvo `project_id=x` y 3 MB (500, S-19); sin stack traces                                                                                                                                                                                                                                                                                       |
| Telegram webhook, inbound email, `/feeds/:token`, `/open/v1`, OAuth token | 401/404/400 correctos sin credenciales                                                                                                                                                                                                                                                                                                              |
| Cabecera `x-dev-user-email`                                               | Ignorada (401)                                                                                                                                                                                                                                                                                                                                      |
| TLS y HTTP                                                                | TLS 1.2 y 1.3, certificado válido hasta 16 ene 2027, HTTP 308                                                                                                                                                                                                                                                                                       |
| Source maps, `.env`, `.git`, `/metrics`                                   | Sin mapas; las rutas devuelven el `index.html` de la SPA (S-12)                                                                                                                                                                                                                                                                                     |
| Puertos                                                                   | Sigue sin ser fiable desde mi red (todo "conecta"); usa los comandos de S-14 en el servidor                                                                                                                                                                                                                                                         |
| Observatory                                                               | B 75, 11/12; causa más probable: CSP del HTML (S-05)                                                                                                                                                                                                                                                                                                |
| No probado                                                                | IDOR con dos usuarios (registro cerrado: solo código), 429 de PAT (límite 1000 por ventana, cabeceras `x-ratelimit-*` presentes; no lo inundé), logout e invalidación de sesión en vivo (no cerré tu sesión; PAT revocado sí verificado), ejecución de acciones `webhook` de automatizaciones, protección de rama de GitHub, detalle de Observatory |

**Limpieza**: tarea, lista, etiqueta y 5 adjuntos `ZZ TEST` borrados (la tarea también de la papelera, solo por id, sin vaciar tu papelera); 3 webhooks y 2 suscripciones iCal borrados; 5 tokens de prueba revocados (solo queda activo `chato_agent`, no tocado); nombre de usuario restaurado a "Pablo Poveda". Este documento no contiene secretos (los tokens de prueba están revocados y no se reproducen).

## 7. Limpieza del relato público (alcance añadido el 19 oct 2026)

Además de la sección 5 (identificadores de infraestructura, nivel A: no se reescribe el historial), el árbol público no debe presentarse como una copia medida de otro producto. El texto normativo está en `docs/spec/cursor-prompt-limpieza-repo-publico-2026-10-19.md` y forma parte de esta spec.

Decisiones ya cerradas, para no reabrirlas:

- Licencia: MIT, copyright Pablo Poveda, año 2026. Ya no está pendiente.
- Historial git: nivel A de la sección 5. No `filter-repo` ni force-push.
- Paso 9 (cambiar el acento `#4772fa`): no se hace.
- `scripts/init-harness.sh`: se elimina. El remoto ya es la instantánea.
- Se conserva la interoperabilidad nominativa: sección 10.4, sección 22, RF-503, RF-1701 y las URLs públicas de la Open API.
- Código ejecutable, campos de API, endpoints, variables de entorno e identificadores TypeScript no se renombran por este apartado.
