# Operación de CI/CD y 1Password

## Flujo y límites

PR → CI (`ci-ok`) → merge en main → imágenes GHCR → solo staging.
Release por fast-forward de `production` a un SHA validado de `main` → preflight → aprobación de Pablo → producción, sin reconstruir imágenes.
El Compose raíz es un camino manual/de desarrollo; producción usa `deploy/production` y staging `deploy/staging`.
El Caddy de borde permanece externo, con redes/aliases existentes y sin publicar 80/443 desde estos stacks.
Staging es permanente y no reinicia Caddy. Producción lo reinicia solo si cambia `todo.caddy`.

Los workflows no crean Environments. Primero deben existir por M4; el preflight comprueba también al reviewer Pablo.
Images construye en main las variantes web staging/prod, con sus propias site keys públicas, antes del despliegue.
La variable pública `VITE_RECAPTCHA_PRODUCTION_SITE_KEY` del Environment staging (o de repositorio) debe contener la site key de producción actual; `VITE_RECAPTCHA_SITE_KEY` conserva la de staging. Ambas deben estar configuradas antes de publicar una variante nueva: Images falla con un error si falta la key correspondiente. No son secretos. Así no se necesita aprobar ni permitir main en el Environment production para construir imágenes.
Los tags web siempre llevan sufijo `staging` o `prod`; así nunca se confunden las dos configuraciones.
Images espera la CI del SHA exacto antes de publicar: el objetivo de deploy desde imágenes disponibles no incluye otra espera de CI.
El job de deploy verifica además una CI de push a main en verde para el SHA exacto. Una PR no despliega.

## Preparación manual (Pablo)

| Paso | Preparación, sin enviar valores al agente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1   | **Hecho por Pablo, 11/11/2026**: creados `ttd-dev`, `ttd-staging`, `ttd-prod` en 1Password Environments e importados los archivos desde la app. No hay bóveda.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M2   | Cuenta de servicio con lectura exclusivamente de `ttd-staging` y `ttd-prod`, nunca de `ttd-dev`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| M3   | Secret `OP_SERVICE_ACCOUNT_TOKEN` y Variable `OP_ENVIRONMENT_ID` correspondiente en cada GitHub Environment. Los IDs no son secretos.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| M3b  | Comprobar solo nombres con `check-1password-fields.sh <ID o nombre de Environment>`, frente a `.env.example`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| M4   | GitHub Environments `staging` y `production`; production con reviewer `povedica` y _Deployment branches_: solo la rama `production` (políticas personalizadas, sin tags). **Antes del primer merge**, configurar `VITE_RECAPTCHA_PRODUCTION_SITE_KEY` en el Environment staging o como variable de repositorio, con el mismo valor que la site key de producción actual; si falta, Images falla antes de publicar. `VITE_RECAPTCHA_SITE_KEY` de staging se usa para su variante; la del Environment production ya no la usa ningún build. Son distintos de los Environments de 1Password. |
| M5   | Paquetes GHCR privados y acceso del repo; login del usuario deploy con `read:packages`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| M6   | Secret `DEPLOY_SSH_KEY`; variables `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_APP_DIR`, `RUNTIME_ENV_FILE`, `PUBLIC_HEALTH_URL`; comprobar huella SSH por canal independiente.                                                                                                                                                                                                                                                                                                                                                                                           |
| M7   | Completar `ttd-prod`; variables `EDGE_NETWORK`, `CADDY_SITES_DIR`, `EDGE_CADDY_CONTAINER`. Aprobar primer deploy tras merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| M8   | Exigir PR y `ci-ok` en main; proteger `production` sin force-push ni borrado y con push restringido a Pablo. El agente no cambia protecciones.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| M9   | Verificar `op run --environment "$OP_ENVIRONMENT_ID" -- pnpm dev` en checkout limpio, usando el ID de `ttd-dev` y Touch ID, sin token de servicio local.                                                                                                                                                                                                                                                                                                                                                                                                                                  |

El usuario deploy necesita Docker sin sudo, Bash, jq, curl, herramientas POSIX y permisos de escritura en
`DEPLOY_APP_DIR`, el directorio de `RUNTIME_ENV_FILE` y, en producción, `CADDY_SITES_DIR`.
BACKUP_DIR debe apuntar a un directorio persistente fuera de releases, para mantener la retención entre despliegues.
Para backups externos necesita age y rclone o la integración Drive ya configurada (RF-1704).
El runtime env de staging debe llamarse `staging.env`; `PUBLIC_URL` debe ser el dominio de staging y `POSTGRES_DB=ttd_staging`.
Cada Environment debe usar su propio directorio base, archivo privado, red y volúmenes. No reutilizar los de producción.

La rama `production` ya existe. Pablo comprueba su estado; si no existe en una instalación nueva, la crea manualmente desde el SHA que está actualmente en producción (no desde la punta de main). No se crea ni se mueve automáticamente.

La primera transición exige un stack ya arrancado y sano: el script descubre sus imágenes como respaldo inicial.
No se deben borrar las imágenes anteriores. Tras el primer éxito se escribe `last-good.env` en el subdirectorio `.ttd-deploy-<entorno>` junto al runtime env.
La inicialización desde cero de Postgres/Redis/redes es manual; el deploy habitual nunca los recrea.

## Environments y Mac nuevo

Instalar CLI ≥ 2.42.0 y activar su integración en la app de escritorio. Pablo ya importó los archivos con _Import .env file_ (M1). `.env.example` es el único esquema versionado; un secreto por variable, incluidos campos opcionales vacíos y configuración pública. No copiar archivos privados entre worktrees.

```bash
# ID público de ttd-dev, obtenido desde la app; autenticación local mediante Touch ID.
op run --environment "$OP_ENVIRONMENT_ID" -- pnpm dev
# Solo nombres; sin --reveal. Seleccionar el Environment que se va a comprobar.
bash scripts/secrets/check-1password-fields.sh "$OP_ENVIRONMENT_ID"
```

Alternativa local: _Local .env file_ de la app (FIFO en Mac/Linux, sin lecturas concurrentes; no hacer que Vite lo vigile). `.env` y `RUNTIME_ENV_FILE` siguen siendo compatibles.
CI usa `op environment secret list "$OP_ENVIRONMENT_ID" --reveal --format=dotenv`, capturado sin logs, y obtiene también JSON para contrastar los valores exactos. Antes de publicar el archivo, verifica su round-trip con el parser real de Compose. Si no coincide, serializa el JSON con quoting de Compose y verifica de nuevo; si sigue sin coincidir, falla conservando el archivo anterior. Esto cubre PEM y escaping sin asumir compatibilidad de la salida dotenv de la CLI. El test con datos ficticios verifica PEM multilínea, `$`, comilla simple, comilla invertida y barra inversa a través de `docker compose config` y un contenedor que consume su salida. Compose representa `$` como `$$` al serializar su config; el valor recibido por el contenedor es idéntico.
El archivo se escribe por rename atómico en 0600, sin artefactos de Actions. CLI fijada en 2.42.0 mediante install-cli-action. No se usa el comando de lectura deprecado ni load-secrets-action. El servidor no tiene cuenta de servicio; recibe el archivo temporal por SSH. La sustitución ocurre bajo el lock del deploy y guarda el runtime anterior; cualquier fallo lo restaura antes de recrear las imágenes anteriores.
`GIT_COMMIT` y `BUILD_TIME` se excluyen del runtime: proceden de la imagen.

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
El plan resuelve la última revisión de los inputs de cada componente en todo el historial. Cada revisión tiene un tag inmutable; si ya existe, no se reconstruye. Ambas referencias deseadas viajan siempre: el servidor compara con las imágenes en marcha, aunque un push anterior no se haya aprobado o haya fallado. Solo se recrean los componentes distintos; cambiar runtime env recrea ambas apps, nunca Postgres ni Redis. Un cambio solo de docs no publica ni despliega.
Las capas se cachean con scopes API/web-staging/web-prod. No publicar manualmente encima de tags de SHA existentes.
Los paquetes se mantienen privados aunque el repositorio sea público (M5). No se crean GitHub Releases: DEC-002 sigue fuera de alcance.

## Deploy, health y migraciones

El workflow copia solo `deploy/**` y `scripts/backup.sh` a un release por run dentro de `DEPLOY_APP_DIR`.
La dependencia de backup Drive se incluye en `deploy/lib` durante la transferencia. No hace falta el monorepo en el VPS.
`current` apunta al último release sano y es el `APP_DIR` que debe usar el cron de backup.
La nueva imagen se descarga antes de tocar el contenedor. Solo se ejecuta up sobre los servicios cuya imagen cambia,
con `--no-build --no-deps`; los datos permanecen en sus volúmenes.

Si el contenido SQL de migraciones difiere del de la imagen anterior:
backup local previo a migración → migrate deploy one-shot con la imagen nueva → recreación de API.
Si falla backup o migrate, el script sale y deja la API anterior en ejecución. No hay nuevas migraciones en esta PR.
Las migraciones futuras deben seguir expand/contract y rollback verificado: **el rollback de imagen no revierte el esquema**.

El health comprueba `status=ok`, commit de la imagen API y respuesta de nginx (90 s de límite).
En un deploy solo web, se verifica el commit de la API que continúa ejecutándose; no se exige artificialmente el SHA de web a esa API.
Si falla up o health, se restauran las imágenes de last-good y se comprueba su salud (45 s de límite).
Producción restaura también el sitio Caddy si se había cambiado.
Los estados y locks de staging/production se separan incluso si sus runtime env comparten directorio.
El archivo `last-good.env` se escribe atómicamente solo después del éxito; no contiene secretos.

## Aprobación y recuperación

Solo se pueden liberar SHAs de main con CI de push en verde, plan Images y staging correcto. Un commit solo de documentación no genera `deployment-plan`; en ese caso se libera el último SHA con plan y staging correcto. La release consiste en avanzar `production` por fast-forward a ese SHA exacto:

```bash
git fetch origin
# SHA completo ya validado; sin --force.
git push origin <sha>:production
```

Una PR main → production con merge commit o rebase no sirve: genera un SHA nuevo sin CI de main ni plan de imágenes. El push normal rechaza avances que no sean fast-forward. El preflight comprueba además que el SHA pertenece al historial de main y que existe un deployment correcto en staging; si falla no accede al servidor. Solo lee la configuración del Environment production: exige reviewer `povedica` y Deployment branches exclusivamente `production`, sin modificarla.

En Actions → Deploy, escoger `environment` y SHA completo de un run Images correcto, o `last-good` para redesplegar el último SHA desplegado correctamente en ese entorno. Para staging ejecutar desde la rama `main`; para production, desde `production`. `last-good` se resuelve mediante los deployments explícitos `ttd-deploy` de GitHub (registrados con el SHA objetivo incluso en dispatch) antes de validar y hacer checkout del SHA exacto, nunca del main actual.
Para production, incluso en rollback, el SHA debe ser alcanzable desde `production`, conservar CI de push en main y plan Images, y tener staging correcto. Los preflights fallan antes de acceder al servidor o solicitar la aprobación del deploy. Pablo revisa SHA y evidencia de staging y aprueba el Environment production también en redespliegues y rollbacks.
Tras un deploy correcto nuevo, para volver al éxito previo se usa su SHA explícito; no se retrocede la rama production. Los planes de imágenes caducan a los 30 días: sin plan disponible el preflight falla.
No se puede volver por workflow a SHAs anteriores a este pipeline: no tienen deployment `ttd-deploy` ni imagen web `-prod`. Esa marcha atrás es manual, usando `last-good.env` en el servidor.
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

## Backup local previo a migraciones (#169)

En staging y producción, antes de migrar se guarda un `pg_dump` comprimido en
`PRE_MIGRATE_BACKUP_DIR/<STAMP>/db.sql.gz`. Por defecto se usa
`<padre de DEPLOY_APP_DIR>/backups/pre-migrate/`, por ejemplo
`/opt/todo-staging/backups/pre-migrate/` o `/opt/todo/backups/pre-migrate/`.
Con `DEPLOY_APP_DIR=/opt/todo-staging/app` (producción: `/opt/todo/app`),
las copias quedan junto a `app/`. Si `DEPLOY_APP_DIR` no está exportada en el VPS,
se obtiene del release (`<DEPLOY_APP_DIR>/releases/<run>`) y se usa su padre.
Las rutas dentro de `releases/`, incluso mediante enlaces simbólicos, se rechazan. Puede configurarse
una ruta absoluta persistente con `PRE_MIGRATE_BACKUP_DIR` en el entorno.
El usuario de deploy debe poder crear y escribir ese directorio.

Los directorios tienen permisos 0700 y el dump 0600. El log muestra únicamente la
ruta y el tamaño de la copia. Si falla la escritura, `pg_dump` o el dump está vacío,
el deploy termina antes de migrar o reemplazar la API anterior y elimina el
archivo parcial y el directorio del STAMP si queda vacío.
`BACKUP_RETENTION_DAYS` fija la retención (30 días por defecto); se conservan siempre
las tres copias completas más recientes, aunque excedan ese plazo. La limpieza se
hace después de completar una copia nueva y solo afecta a este directorio.

Esta copia local no usa Drive, rclone, cifrado para subida ni tokens de usuario.
El cron diario externo de RF-1704 conserva su comportamiento: llama al mismo
código previo, ahora denominado `backup_daily_external`, y a `scripts/backup.sh`.
El render importa los valores de 1Password; no fija `GOOGLE_DRIVE_FOLDER_ID` en
staging. Pablo debe eliminar esa entrada de 1Password para staging.

Para restaurar, usa `scripts/restore.sh` desde un checkout del repositorio
(el release mínimo del VPS no incluye ese script). El comando aplica SQL sobre la
base indicada: detén las escrituras y selecciona explícitamente el stack correcto.
Ejemplo para staging, con su archivo privado existente:

```bash
export COMPOSE_FILE="$PWD/deploy/staging/docker-compose.yml"
export COMPOSE_PROJECT_NAME=todo-staging
export COMPOSE_ENV_FILES=/etc/todo/staging.env
export POSTGRES_USER=reflexionia POSTGRES_DB=ttd_staging
BACKUP_DIR=/opt/todo-staging/backups/pre-migrate RESTORE_CONFIRM=restore \
  bash scripts/restore.sh <STAMP>
```

En producción usa `deploy/production/docker-compose.yml`, proyecto `todo`, su
archivo privado y sus nombres reales de base/usuario, con
`BACKUP_DIR=/opt/todo/backups/pre-migrate`. No imprime ni copies secretos al log.
La aceptación operativa queda pendiente de que Pablo fusione y relance Deploy de
staging: health verde y dump no vacío con 0600 en la ruta persistente.
