# Operación de CI/CD y 1Password

## Flujo y límites

PR → CI (`ci-ok`) → merge en main → imágenes GHCR → staging → aprobación de Pablo → producción.
El Compose raíz es un camino manual/de desarrollo; producción usa `deploy/production` y staging `deploy/staging`.
El Caddy de borde permanece externo, con redes/aliases existentes y sin publicar 80/443 desde estos stacks.
Staging es permanente y no reinicia Caddy. Producción lo reinicia solo si cambia `todo.caddy`.

Los workflows no crean Environments. Primero deben existir por M4; el preflight comprueba también al reviewer Pablo.
La imagen web de producción se construye en el job aprobado, después de staging, con su propia site key pública.
Los tags web siempre llevan sufijo `staging` o `prod`; así nunca se confunden las dos configuraciones.
El job de deploy espera una CI de push a main en verde para el SHA exacto. Una PR no despliega.

## Preparación manual (Pablo)

| Paso | Preparación, sin enviar valores al agente                                                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | Bóveda `ttd` e ítems `dev`, `staging`, `prod`; no usar Personal/Private/Shared por defecto.                                                                                                                |
| M2   | Cuenta de servicio con `read_items` exclusivamente en `ttd`.                                                                                                                                               |
| M3   | Secret `OP_SERVICE_ACCOUNT_TOKEN` en cada Environment.                                                                                                                                                     |
| M3b  | Importar los archivos privados con los scripts y comprobar nombres.                                                                                                                                        |
| M4   | Environments `staging` y `production`; production: reviewer Pablo y solo main. Variable `VITE_RECAPTCHA_SITE_KEY` en ambos.                                                                                |
| M5   | Paquetes GHCR privados y acceso del repo; login del usuario deploy del VPS con PAT classic `read:packages`.                                                                                                |
| M6   | `DEPLOY_SSH_KEY` como secret; variables `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_APP_DIR`, `RUNTIME_ENV_FILE`, `PUBLIC_HEALTH_URL`. Verificar la huella SSH por un canal independiente. |
| M7   | Ítem `prod` completo; variables `EDGE_NETWORK`, `CADDY_SITES_DIR`, `EDGE_CADDY_CONTAINER`. Aprobar el primer deploy después de fusionar.                                                                   |
| M8   | Ruleset/main: PR obligatoria y check `ci-ok`; `public-tree-guard` y `pr-check` aparte son opcionales. El agente no cambia la protección.                                                                   |
| M9   | Verificar `op run --env-file=.env.tpl -- pnpm dev` en un checkout limpio.                                                                                                                                  |

El usuario deploy necesita Docker sin sudo, Bash, jq, curl, herramientas POSIX y permisos de escritura en
`DEPLOY_APP_DIR`, el directorio de `RUNTIME_ENV_FILE` y, en producción, `CADDY_SITES_DIR`.
BACKUP_DIR debe apuntar a un directorio persistente fuera de releases, para mantener la retención entre despliegues.
Para backups externos necesita age y rclone o la integración Drive ya configurada (RF-1704).
El runtime env de staging debe llamarse `staging.env`; `PUBLIC_URL` debe ser el dominio de staging y `POSTGRES_DB=ttd_staging`.
Cada Environment debe usar su propio directorio base, archivo privado, red y volúmenes. No reutilizar los de producción.

La primera transición exige un stack ya arrancado y sano: el script descubre sus imágenes como respaldo inicial.
No se deben borrar las imágenes anteriores. Tras el primer éxito se escribe `last-good.env` en el subdirectorio `.ttd-deploy-<entorno>` junto al runtime env.
La inicialización desde cero de Postgres/Redis/redes es manual; el deploy habitual nunca los recrea.

## Importación privada y Mac nuevo

Instalar 1Password CLI, activar integración con la app de escritorio e iniciar sesión. No copiar archivos entre equipos.
Todos los campos, incluso los opcionales vacíos, viven en su ítem; los nombres están en `.env.example`.
Los campos públicos (flags, puertos, IDs, URLs y site keys) comparten ítem para tener una sola fuente.

```bash
bash scripts/secrets/import-env-to-1password.sh "$PRIVATE_DEV_ENV" dev
bash scripts/secrets/import-env-to-1password.sh "$PRIVATE_STAGING_ENV" staging
bash scripts/secrets/import-env-to-1password.sh "$PRIVATE_PRODUCTION_ENV" prod
bash scripts/secrets/check-1password-fields.sh
op run --env-file=.env.tpl -- pnpm dev
```

Los scripts de importación aceptan asignaciones dotenv con quoting POSIX, export y multilinea entre comillas;
no evalúan sustituciones ni comandos. Un valor con espacios debe estar entre comillas. Los valores viajan a `op item edit`
por stdin y su respuesta se descarta. Solo se imprimen nombres y recuentos. No usar `set -x` con archivos privados.
El renderizador usa `op inject`, una llamada para todas las referencias, y escribe con rename atómico y modo 0600.
No genera artefactos de Actions. El archivo remoto se transfiere a un temporal 0600 y se renombra en su directorio.
Las plantillas de servidor omiten `GIT_COMMIT`: el commit y BUILD_TIME vienen horneados en la imagen.
La compatibilidad con `.env` y `RUNTIME_ENV_FILE` sigue disponible durante la transición.

Conservar una copia privada del antiguo env hasta validar producción. Después eliminarla de forma controlada.
Rotar primero credenciales de deploy/proveedores por entorno y comprobar el servicio tras cada cambio.
`APP_SECRET` invalida sesiones: planificar ventana y reautenticación. **No rotar DATA_ENCRYPTION_KEY sin un plan de
re-cifrado, backup restaurable y verificación**: cifra TOTP, tokens Google y webhooks. La rotación no es parte automática del deploy.

## Imágenes e inspección

```bash
docker pull "ghcr.io/povedica/tick-tack-done-api:$SHA"
docker pull "ghcr.io/povedica/tick-tack-done-web:$SHA-staging"
docker buildx imagetools inspect "ghcr.io/povedica/tick-tack-done-api:$SHA"
```

API: tags `sha-<7>`, SHA completo, `main` y `v*` cuando exista. Web: SHA completo y `sha-<7>` con sufijo de entorno.
Los filtros evitan construir la otra aplicación en un cambio exclusivo. Un cambio solo de docs no publica ni despliega.
Las capas se cachean con scopes API/web-staging/web-prod. No publicar manualmente encima de tags de SHA existentes.
Los paquetes se mantienen privados aunque el repositorio sea público (M5). No se crean GitHub Releases: DEC-002 sigue fuera de alcance.

## Deploy, health y migraciones

El workflow copia solo `deploy/**` y `scripts/backup.sh` a un release por run dentro de `DEPLOY_APP_DIR`.
La dependencia de backup Drive se incluye en `deploy/lib` durante la transferencia. No hace falta el monorepo en el VPS.
`current` apunta al último release sano y es el `APP_DIR` que debe usar el cron de backup.
La nueva imagen se descarga antes de tocar el contenedor. Solo se ejecuta up sobre los servicios cuya imagen cambia,
con `--no-build --no-deps`; los datos permanecen en sus volúmenes.

Si el contenido SQL de migraciones difiere del de la imagen anterior:
backup externo RF-1704 → migrate deploy one-shot con la imagen nueva → recreación de API.
Si falla backup o migrate, el script sale y deja la API anterior en ejecución. No hay nuevas migraciones en esta PR.
Las migraciones futuras deben seguir expand/contract y rollback verificado: **el rollback de imagen no revierte el esquema**.

El health comprueba `status=ok`, commit de la imagen API y respuesta de nginx (90 s de límite).
En un deploy solo web, se verifica el commit de la API que continúa ejecutándose; no se exige artificialmente el SHA de web a esa API.
Si falla up o health, se restauran las imágenes de last-good y se comprueba su salud (45 s de límite).
Producción restaura también el sitio Caddy si se había cambiado.
Los estados y locks de staging/production se separan incluso si sus runtime env comparten directorio.
El archivo `last-good.env` se escribe atómicamente solo después del éxito; no contiene secretos.

## Aprobación y recuperación

En Actions → Deploy, escoger el SHA completo de un run Images correcto, o `last-good` para redesplegar el último par sano.
La ejecución se hace desde main; staging debe pasar antes de que producción llegue a su aprobación.
Pablo revisa SHA y evidencia de staging y aprueba el Environment production. El primer deploy real es después del merge.
Para volver a un SHA anterior, usar ese SHA completo (debe existir su plan de imágenes y CI en main).
`last-good` representa el último éxito; tras un deploy correcto nuevo, para volver al éxito previo se usa su SHA explícito.
Nunca se cancela un deploy en curso. Un lock por runtime env impide solapamientos con el camino manual.
Si un proceso es interrumpido de forma abrupta, comprobar que no queda un deploy activo antes de retirar el directorio `.lock` del estado.

En emergencia, con el checkout completo y configuración privada ya preparada, existe el override de build:

```bash
export API_IMAGE="ttd-api:emergency-$GIT_COMMIT"
export WEB_IMAGE="ttd-web:emergency-$GIT_COMMIT"
bash deploy/staging/deploy.sh --build
# Producción usa deploy/production/deploy.sh --build con las variables de borde de M7.
```

No tocar el Caddy externo desde staging. No borrar volúmenes ni ejecutar `down -v` durante una recuperación.
Si el workflow nuevo debe retirarse, revertir el merge mediante otra PR; nunca force-push. Pablo adapta M8 al check que exista.

## Evidencias y límites de esta entrega

Consultar la tabla antes/después en PR #160 y el comentario final de #158: incluyen nº de runs y objetivos pendientes.
Las pruebas automáticas cubren incremento, ausencia de cambios, health KO/rollback y orden/fallo de migraciones con Docker simulado.
El smoke de imágenes sí usa Postgres/Redis reales y comprueba el commit API.
Deploy externo, migración ficticia con Postgres real, permisos GHCR, rendimiento GHA de imágenes y M9 esperan los pasos manuales.
Los tiempos simulados no cuentan como tiempos de staging/producción. No interpretar implementación como aceptación de M1–M9.

## Correo del restablecimiento de contraseña

Comprueba qué transporte está activo mirando si la variable existe, sin imprimir su valor:

```bash
test -n "$RESEND_API_KEY" && echo resend || echo smtp
```

1. El proceso de producción no arranca sin correo. Confirma Resend (`RESEND_API_KEY` y `EMAIL_FROM`) o SMTP (`SMTP_HOST` y `SMTP_FROM`).
2. El remitente debe ser un dominio propio, por ejemplo `tick-tack-done <no-reply@reflexionia.com>`.
3. Resend: dominio verificado (DKIM y SPF/MX del subdominio de envío) y seguimiento de clics y aperturas desactivado. Si el seguimiento reescribe el enlace, se pierde el fragmento `#token`.
4. SMTP: `SMTP_SECURE=true` en el puerto 465. Con otro puerto, `SMTP_SECURE=false` y TLS obligatorio salvo `mailpit` o `localhost`. SPF, DKIM y TLS los firma el proveedor.
5. DMARC en `_dmarc.reflexionia.com`, empezando por `p=none`.
6. `PUBLIC_URL` es la única base del enlace. No se usa `Host` ni `X-Forwarded-Host`.
7. Prueba de humo solo si la pide quien opera la cuenta: el aviso llega a la bandeja (no a spam), `Authentication-Results` muestra `spf=pass dkim=pass dmarc=pass` y el enlace conserva `#token`.
8. Si se pierden a la vez el TOTP y los códigos de recuperación, en el servidor: `docker exec -it "$API_CONTAINER" node dist/scripts/disable-totp.js --email "$ACCOUNT_EMAIL"`. Pide confirmación, deja ActivityLog y no tiene endpoint HTTP.
