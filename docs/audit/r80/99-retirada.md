# TTD-AUD-99 — retirada por pasos

## Paso 1: inventario

`scripts/attachments-inventory.ts --dry-run` solo lee. Cuenta filas heredadas, bytes, usuarios con/sin Google y ficheros del volumen; no imprime nombres, correos, rutas ni credenciales. No sigue enlaces simbólicos. Se ejecuta primero en ttd_r80.

La instrucción expresa de Pablo prevalece sobre el texto del paso 2: **no se borran ficheros ni volúmenes de producción sin su OK**, incluso después de migrarlos. La migración separará la subida de la retirada física. La migración de esquema bloqueará cualquier fila que conserve storage_key. No se despliega ese corte sobre datos pendientes.
