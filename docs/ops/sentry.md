# Sentry: errores de ttd-api y ttd-web (#209)

Runbook de operación. Sentry solo recibe **errores** y el check-in del scheduler. Todo
cabe en el plan gratuito **Developer** y nunca se paga.

## Alcance

| Proyecto  | Origen                                    | Qué envía                                                                     |
| --------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `ttd-api` | API, workers BullMQ, scheduler, MCP       | 5xx no controlados, jobs fallidos, fases del scheduler, cron `scheduler-tick` |
| `ttd-web` | PWA, por el túnel `/api/v1/sentry-tunnel` | Errores de render, de acciones y no capturados                                |

Región de datos: **UE** (`de.sentry.io`). Sentry, de Functional Software, Inc., es encargado
del tratamiento. Retención del plan: 30 días.

**No se configuran funciones de pago ni de trial:** Session Replay, tracing o performance,
profiling, logs, métricas, el widget de user feedback, attachments, el transporte offline,
spans de las tools del MCP, rate limits por DSN, Slack, filtros por mensaje, presupuesto
pay-as-you-go (se queda en 0 €) ni nada marcado como Business o Team.

## Variables

| Variable                   | Dónde                                                    | Valor                                                                    |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `SENTRY_ENABLED`           | 1Password `render-env` (staging y prod)                  | `true` para enviar. Cualquier otro valor deja la API inerte.             |
| `SENTRY_DSN`               | 1Password `render-env`                                   | DSN de `ttd-api`                                                         |
| `SENTRY_ENVIRONMENT`       | 1Password `render-env`                                   | `staging` o `production`                                                 |
| `SENTRY_RELEASE`           | normalmente vacío                                        | Vacío: `ttd-api@<versión>+<sha7>`                                        |
| `SENTRY_CRON_EVERY_TICKS`  | normalmente vacío                                        | Vacío = 5; `0` apaga el cron monitor                                     |
| `SENTRY_TUNNEL_ENABLED`    | 1Password `render-env`                                   | `true` para reenviar los eventos de la web                               |
| `SENTRY_WEB_DSN`           | 1Password `render-env`                                   | DSN de `ttd-web`, el único que acepta el túnel                           |
| `VITE_SENTRY_DSN`          | Variable del Environment `staging` en GitHub             | DSN de `ttd-web`. Es público por diseño, como reCAPTCHA.                 |
| `SENTRY_ORG`, `SENTRY_URL` | Variables de los Environments                            | Slug de la org; la URL es opcional (por defecto `https://de.sentry.io/`) |
| `SENTRY_AUTH_TOKEN`        | **Secreto** de los Environments `staging` y `production` | Organization Token. Nunca en el repo, la imagen ni el `render-env`.      |

Sin DSN, o con `SENTRY_ENABLED` distinto de `true`, la API no inicializa el SDK ni abre
conexiones. Sin `VITE_SENTRY_DSN`, la PWA no descarga el chunk de Sentry. Sin
`SENTRY_AUTH_TOKEN`, no se suben mapas ni se marcan deploys. Vitest nunca envía.

`scripts/secrets/check-1password-fields.sh` compara los nombres con `.env.example`, así que
los campos nuevos tienen que existir en 1Password aunque estén vacíos.

## Qué se envía y qué no

- El evento se reconstruye desde una lista blanca en `beforeSend`:
  - API: `apps/api/src/observability/sentry/scrub-event.ts`.
  - Web: `apps/web/src/observability/scrub.ts`.
- Lo que sí viaja:
  - Tipo de error, mensaje saneado y frames (fichero, función, línea).
  - Ruta normalizada: sin query, con tokens e ids enmascarados.
  - Release, entorno y las etiquetas permitidas.
  - En la API, `user.id`.
- Lo que nunca viaja:
  - Email, IP, cookies, cabeceras, cuerpos ni query string.
  - Títulos, notas, `raw_text`, PATs (`rfx_pat_`, `rfx_ort_`) ni la cookie de sesión.
- Breadcrumbs:
  - API: ninguno.
  - Web: solo navegación y fetch/xhr, en una línea sin datos. Ni consola ni clics.
- La web no envía `user`.
- El túnel reenvía solo `content-type`, `content-length` y `origin`. Nunca reenvía `x-forwarded-for`, cookies ni `referer`.
- Un test trampa en Vitest falla si el JSON completo del evento contiene `TRAMPA`, un email, `rfx_pat_`, `rfx_ort_` o `__Host-rfx_session`:
  - API: `apps/api/src/observability/sentry/sentry.spec.ts` y `background.spec.ts`.
  - Web: `apps/web/src/observability/sentry-client.spec.ts`.
- No se reportan los 4xx ni los health checks. En la web tampoco las `ApiError` (los 5xx ya los informa la API), los abortos ni los fallos de red.
- Sin red, el evento web se descarta: no hay cola offline de Sentry.

## Throttling

| Dónde        | Producción                                                      | Staging                                    |
| ------------ | --------------------------------------------------------------- | ------------------------------------------ |
| API          | 10 eventos por huella cada 10 min; 60 por hora y proceso        | 3 por huella y hora; 60 por hora y proceso |
| API, resumen | Un evento `Sentry: suprimidos N eventos` como mucho cada 10 min | Igual                                      |
| Web          | 10 por sesión de pestaña y 3 por huella                         | 3 por huella y hora, 10 por sesión         |
| Túnel        | 30 sobres por minuto e IP, 64 KiB por sobre                     | Igual                                      |

## Cuota (5.000 errores/mes)

- **Revisión semanal** en _Stats_: errores aceptados, filtrados y descartados por proyecto.
- Si se pasa del 80 % del mes, o del 80 % en 24 h, es un disparador de rollback. Antes de apagar:
  - Ignorar o resolver la issue ruidosa.
  - Revisar si el throttling se queda corto.
  - Si hace falta, usar el interruptor de abajo.
- El cron monitor envía 1 check-in cada 5 ticks de 1 minuto: unos 8.640 al mes.

## Alertas (las crea Pablo en la UI)

- Solo **email**: error nuevo en `environment:production` y regresión (issue resuelta que vuelve).
- Alerta por frecuencia (más de 20 eventos de una issue en 1 h), solo si el plan gratuito la incluye (PENDIENTE DE VERIFICAR).
- **Sin** filtro «solo laborables»: el horario se gestiona en el correo.
- Cron `scheduler-tick`: avisa si falta un check-in o si llega `error`.

## Interruptores

- **API**:
  - Poner `SENTRY_ENABLED=false` (o el DSN vacío) en 1Password y **redeploy del mismo SHA** con _Deploy_ → _Run workflow_.
  - Cambia el `runtime.env`, así que se recrea el contenedor. No hace falta reconstruir la imagen.
- **Web, en caliente**:
  - `SENTRY_TUNNEL_ENABLED=false` en 1Password y redeploy del mismo SHA. El túnel responde 204 y descarta todo.
  - Alternativa sin deploy: desactivar la clave DSN de `ttd-web` en Sentry.
- **Web, del todo**: `VITE_SENTRY_DSN` vacío y reconstruir la imagen web. Solo hace falta si hay que sacar el SDK del bundle.

## Rollback por PII

1. Apagar los dos interruptores, el de la API y el de la web.
2. En Sentry, borrar los eventos o issues afectados («Delete and discard») y comprobar que el data scrubber de la organización está activo.
3. Rotar lo expuesto: PATs, sesiones (cerrar sesiones) o tokens de feeds.
4. Añadir el caso al test trampa, corregir el saneador y volver a encender.
5. Registrar el incidente. Pablo decide si hay que comunicarlo (RGPD).

Otros disparadores de rollback inmediato:

- Una incidencia de usuario causada por el SDK.
- Un p95 de más de 20 ms.
- Una cuota por encima del 80 % en 24 h.

Revertir las PRs es seguro: no hay migraciones.

## Cron monitor y uptime

- `scheduler-tick` se crea solo con el primer check-in, por `monitorConfig`: un check-in cada 5 ticks, margen de 5 min, `maxRuntime` de 10 min, UTC.
- Un tick fallido envía `error`.
- El **uptime monitor** de `/api/v1/health` lo crea Pablo en la UI: el plan incluye 1.

## Smoke (solo staging)

- **API**: el hook `after_success` de `deploy/staging/deploy.sh` ejecuta `node dist/scripts/sentry-smoke.js` en el contenedor.
  - Envía un evento `smoke=true`.
  - Si no termina, el deploy sigue.
  - Fuera de `SENTRY_ENVIRONMENT=staging` no hace nada.
- **Web**: abrir cualquier página de staging con `?sentry-smoke` envía un evento `smoke=true` por el túnel.
- En producción no hay smoke.
- Para comprobarlo: en Sentry, filtrar por `smoke:true` y el `release` desplegado.

## Releases y source maps

- Las releases son `ttd-api@<versión>+<sha7>` y `ttd-web@<versión>+<sha7>`, con la etiqueta `deploy_sha`.
- `DEPLOY_SHA` llega al contenedor de la API desde `remote.sh`. Si llega vacío, se usa el `GIT_COMMIT` de la imagen.
- Web:
  - Con token, la imagen se construye con mapas `hidden`.
  - `apps/web/scripts/split-sourcemaps.mjs` los saca a la etapa `sourcemaps` y rompe el build si queda un `.map` o un `sourceMappingURL` servible. nginx también devuelve 404 a los `.map`.
  - Un paso aislado de `images.yml` exporta esa etapa y la sube con `sentry-cli`.
- Tras un deploy sano, `deploy/lib/sentry-release.sh` marca el deploy de cada componente. Sin token no hace nada.
- La API no sube mapas: arranca con `node --enable-source-maps` y las trazas ya llegan mapeadas.

## Pasos manuales de Pablo

- [ ] Confirmar que la org no depende de funciones de trial o Business.
- [ ] Activar en la org el data scrubber del servidor y «Prevent Storing of IP Addresses» si existe. Campos sensibles: `title`, `content`, `notes`, `raw_text`, `email`, `authorization`, `cookie`, `rfx_pat`, `rfx_ort`, `rfx_session`, `token`. Hay que hacerlo **antes** del primer evento real.
- [ ] Confirmar o aceptar el DPA de Sentry (región UE).
- [ ] Crear los proyectos `ttd-api` y `ttd-web`.
- [ ] Crear el Organization Token (`SENTRY_AUTH_TOKEN`) con permiso de subida de source maps y de releases. Guardarlo solo como secreto de los Environments `staging` y `production`.
- [ ] Poner `SENTRY_ENABLED`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TUNNEL_ENABLED` y `SENTRY_WEB_DSN` en 1Password (`ttd-staging` / `ttd-prod` → `render-env`).
- [ ] Poner `VITE_SENTRY_DSN` y `SENTRY_ORG` como variables del Environment `staging`, y `SENTRY_ORG` también en `production`.
- [ ] Crear las alertas por email: error nuevo en producción y regresión. La alerta por frecuencia, solo si está en el plan gratuito.
- [ ] Crear el uptime monitor de `/api/v1/health`.
- [ ] Activar los inbound filters (extensiones, localhost, navegadores antiguos, crawlers) y spike protection si aparece en Settings.
- [ ] Revisar el texto legal de la política de privacidad (marcado PENDIENTE) antes del merge.
- [ ] Hacer el primer deploy en staging y comprobar en Sentry:
  - El smoke de la API y el de la web (`smoke:true`).
  - Una traza web desminificada.
  - El check-in de `scheduler-tick`.
  - Los marcadores de deploy.
- [ ] Revisar _Stats_ cada semana.
- [ ] No configurar nada que solo exista en Business o trial.
