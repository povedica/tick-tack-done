# TTD-AUD-99 — retirada por pasos

## Paso 1: inventario

`scripts/attachments-inventory.ts --dry-run` solo lee. Cuenta filas heredadas, bytes, usuarios con/sin Google y ficheros del volumen; no imprime nombres, correos, rutas ni credenciales. No sigue enlaces simbólicos. Se ejecuta primero en ttd_r80.

La instrucción expresa de Pablo prevalece sobre el texto del paso 2: **no se borran ficheros ni volúmenes de producción sin su OK**, incluso después de migrarlos. La migración separará la subida de la retirada física. La migración de esquema bloqueará cualquier fila que conserve storage_key. No se despliega ese corte sobre datos pendientes.

## Paso 2: migración y preparación

Migración aditiva `20261022104424_attachment_drive_metadata`: estado de Google, metadatos y tabla de carpetas, manteniendo las claves locales durante la transición. Script de bajada incluido.

`migrate-attachments-to-drive.ts --dry-run` lista solo recuentos; local aislado: 0 pendientes. `--apply --backup /ruta/nueva.dump` valida primero pg_dump y su catálogo. Busca la marca del adjunto heredado en Drive para recuperar una interrupción sin duplicarlo. Verifica carpeta y tamaño antes de guardar metadatos. **Por defecto no elimina los originales**. La retirada física requiere `--remove-local --pablo-approved`; sin Drive conserva todo y cuenta pendientes. `--purge-unmigrated` exige la misma aprobación explícita y backup. Estos indicadores son para un operador después del OK de Pablo, nunca autorización implícita para que el agente los use. No se han ejecutado sobre producción.

Transporte en streaming con un buffer de 7,75 MiB y fragmentos de entrada de hasta 256 KiB (total ≤8 MiB); las peticiones resumables tienen fragmentos múltiplos de 256 KiB. Referencias: [subidas resumables](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [errores de cuota](https://developers.google.com/workspace/drive/api/guides/handle-errors). La web usará la URL de sesión, sin access token en el navegador.

Corrección comprobada durante el paso 2: la ruta antigua de enlaces creaba claves locales ficticias, sin fichero. Esas filas se convierten a enlaces sin copiar ni borrar datos físicos; si aparece un fichero inesperado, el script se detiene. Las copias binarias antiguas no se confunden con el original de Drive: se recuperan por la marca ttdLegacyAttachmentId de la migración.

## Paso 3: código de captura y contratos

Se sustituyen las rutas binarias por metadatos y redirecciones; desaparecen attachment-storage.ts y la descarga de copias desde Drive. Busboy propaga contrapresión y serializa los adjuntos de un correo; MCP codifica su multipart por fragmentos en lugar de construirlo entero. Telegram descarga como flujo; la voz, que antes solo se transcribía, ahora se envía al proveedor de transcripción también como flujo, sin introducir un nuevo adjunto de audio.

Web: sesión resumable firmada, PUT directo en trozos de 8 MiB, progreso y reanudación por Range. El backend no devuelve access tokens. Picker usa una autorización interactiva propia del SDK de Google (drive.file), solo en memoria y con cierre a los 10 minutos; no reutiliza ni expone la credencial del servidor. Configuración pública necesaria: GOOGLE_PICKER_API_KEY (clave de navegador restringida por origen), GOOGLE_PICKER_APP_ID y GOOGLE_CLIENT_ID. No se han introducido valores de credenciales en el repo.

Pruebas con Drive HTTP simulado: sesión/finalización, HMAC manipulado, streaming REST y MCP, correo y Telegram, redirección 302/no-store, borrado con y sin papelera, quota 507 y revocación 409. Las capturas y el waterfall de Playwright usan datos sintéticos; la validación real en la consola de Drive y staging queda explícitamente pendiente.

Cambio deliberado del correo: si un fichero supera el límite después de capturar el asunto, la tarea se conserva y el fichero se rechaza (413). Sin conexión a Drive, la tarea se conserva con el aviso solicitado. Los reenvíos con el mismo message_id no duplican ni tarea ni adjuntos. El enlace Drive antiguo requiere ahora conexión y verificación; copy:true se conserva como adaptador de solo enlace y devuelve copied:false.

## Inventario de producción (22/10/2026)

Se ejecutó el mismo inventario transpilado, por stdin y sin escribir el script en el servidor. Las consultas se ejecutaron en una transacción `READ ONLY`. Resultado: **0 filas heredadas / 0 bytes referenciados; 4 ficheros / 201 bytes en el volumen**. Los recuentos de usuarios se refieren únicamente a propietarios de filas heredadas, no al total de cuentas con Google. No se imprimieron nombres ni se leyó el contenido.

Los cuatro ficheros sin referencia se preservan. No se ejecutó migrate-attachments-to-drive en producción, ni se eliminó ningún fichero ni volumen. El inventario está en 99-inventario-produccion.json; retirar esos restos requiere el OK explícito de Pablo.
