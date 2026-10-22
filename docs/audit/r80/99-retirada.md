# TTD-AUD-99 — retirada por pasos

## Paso 1: inventario

`scripts/attachments-inventory.ts --dry-run` solo lee. Cuenta filas heredadas, bytes, usuarios con/sin Google y ficheros del volumen; no imprime nombres, correos, rutas ni credenciales. No sigue enlaces simbólicos. Se ejecuta primero en ttd_r80.

La instrucción expresa de Pablo prevalece sobre el texto del paso 2: **no se borran ficheros ni volúmenes de producción sin su OK**, incluso después de migrarlos. La migración separará la subida de la retirada física. La migración de esquema bloqueará cualquier fila que conserve storage_key. No se despliega ese corte sobre datos pendientes.

## Paso 2: migración y preparación

Migración aditiva `20261022104424_attachment_drive_metadata`: estado de Google, metadatos y tabla de carpetas, manteniendo las claves locales durante la transición. Script de bajada incluido.

`migrate-attachments-to-drive.ts --dry-run` lista solo recuentos; local aislado: 0 pendientes. `--apply --backup /ruta/nueva.dump` valida primero pg_dump y su catálogo. Busca la marca del adjunto heredado en Drive para recuperar una interrupción sin duplicarlo. Verifica carpeta y tamaño antes de guardar metadatos. **Por defecto no elimina los originales**. La retirada física requiere `--remove-local --pablo-approved`; sin Drive conserva todo y cuenta pendientes. `--purge-unmigrated` exige la misma aprobación explícita y backup. Estos indicadores son para un operador después del OK de Pablo, nunca autorización implícita para que el agente los use. No se han ejecutado sobre producción.

Transporte en streaming con un buffer de 7,75 MiB y fragmentos de entrada de hasta 256 KiB (total ≤8 MiB); las peticiones resumables tienen fragmentos múltiplos de 256 KiB. Referencias: [subidas resumables](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [errores de cuota](https://developers.google.com/workspace/drive/api/guides/handle-errors). La web usará la URL de sesión, sin access token en el navegador.

Corrección comprobada durante el paso 2: la ruta antigua de enlaces creaba claves locales ficticias, sin fichero. Esas filas se convierten a enlaces sin copiar ni borrar datos físicos; si aparece un fichero inesperado, el script se detiene. Las copias binarias antiguas no se confunden con el original de Drive: se recuperan por la marca ttdLegacyAttachmentId de la migración.
