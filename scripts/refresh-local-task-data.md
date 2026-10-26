# Copia local de tareas de producción

RF-1703/1705: herramienta de desarrollo para obtener datos de tareas y reutilizarlos como datos locales de prueba.

```bash
python3 scripts/refresh-local-task-data.py          # Vista previa y recuentos
python3 scripts/refresh-local-task-data.py --apply  # Copiar y actualizar localmente
```

El perfil privado se guarda en `.env-config/local-task-data.json`, fuera de Git:

```json
{
  "source_host": "deploy@HOST_CONOCIDO",
  "ssh_identity": "~/.ssh/CLAVE_EXISTENTE",
  "source_container": "todo-postgres-1",
  "source_email": "CUENTA_DE_ORIGEN",
  "target_container": "CONTENEDOR_POSTGRES_LOCAL",
  "target_database": "ttd_DESARROLLO",
  "target_email": "demo@reflexionia.test"
}
```

Requiere Python 3, Docker local y acceso SSH existente al servidor. La clave del servidor debe estar verificada en `known_hosts`; la herramienta no acepta claves nuevas ni desactiva esa comprobación. No guarda contraseñas ni tokens en el perfil.

La lectura remota se hace en una transacción `REPEATABLE READ READ ONLY`. Solo copia tareas (incluidas completadas, notas y papelera), carpetas, listas, columnas, etiquetas y sus asociaciones, checklists, enlaces, comentarios y metadatos de adjuntos. No copia archivos binarios de Drive, cuentas, contraseñas, sesiones, tokens, integraciones, hábitos, calendarios, notificaciones, automatizaciones ni colas de trabajos.

Los datos se asignan a una cuenta local ya existente. Los identificadores se convierten en UUID locales deterministas; los autores se asignan a esa cuenta y se conservan las relaciones entre tareas, subtareas y etiquetas. Las asignaciones a otras personas no se importan. La bandeja usa la bandeja local existente y las etiquetas con el mismo nombre se reutilizan.

Antes de aplicar se genera y verifica un `pg_dump` completo de la BD **local**, junto con el snapshot de solo tareas, en `backups/task-data/<fecha>/`. Ese directorio está excluido de Git; los archivos son privados (0600) y el directorio de cada copia usa 0700. Son datos privados reales de tareas utilizados para pruebas, no datos anonimizados. Se conservan hasta que decidas eliminarlos; no se suben a Git ni a servicios externos.

La importación es transaccional, hace upsert y conserva los datos demo ajenos a la copia. Repetir el comando actualiza los registros, sin duplicarlos. Si el contenido no cambia, conserva también las versiones locales de las tareas; las versiones locales son monotónicas y no se reinician con el valor de producción. Si una tarea importada desaparece del origen, se envía a la papelera local. Las modificaciones locales de los registros importados se sustituyen por los datos del origen en la siguiente copia.

También se puede reaplicar una copia descargada sin acceder a producción:

```bash
python3 scripts/refresh-local-task-data.py --snapshot backups/task-data/FECHA/source-tasks.json --apply
```

La herramienta solo escribe en un contenedor PostgreSQL conectado mediante un socket Docker local y una base de desarrollo `ttd_*`; rechaza `ttd_staging` y destinos Docker remotos. No modifica usuarios ni genera eventos, recordatorios o llamadas de integración al importar. El comando no restaura una BD completa de producción.

Para restaurar el estado local anterior, puedes usar el archivo `local-before.dump` con `pg_restore` contra la misma BD de desarrollo, deteniendo primero la app local. No ejecutes esa restauración contra producción.
