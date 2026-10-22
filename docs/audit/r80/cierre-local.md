# Cierre de bordes locales

RF-701/704/705: `close-orphan-series` considera solo anclas abiertas, vuelve a comprobar bajo advisory lock, filtra tareas y avances por propietario y emite `series.closed@v1` solo cuando cambia algo. Una prueba sobre PostgreSQL sintético ejecuta los scripts reales: dry-run sin mutación, pg_dump nuevo con permisos0600 y catálogo válido, aplicación de cierre y reparación todo el día, segunda ejecución sin cambios ni eventos adicionales. No se utiliza copia de producción.

RF-1102: los carriles horarios de Día reservan el último carril legible para +N cuando no caben bloques de64px con2px de separación. El botón abre el día completo. Dos semanas limita a cinco tareas visibles por celda (además de la altura disponible) para garantizar el acceso +N con seis; decisión explícita de capacidad, conservando la fila compacta. 16 pruebas de calendario verdes en ambos tamaños y temas.

RF-601/102: cuatro anclas en esquinas del escritorio dentro del viewport; Escape devuelve el foco. Hoja móvil y teclado emulado pasan. Guardar con composer global aparece en Hoy y en etiqueta sin recargar, ocho pruebas. Tabla de contextos ampliada a19 casos.

RF-104/S-18: límite de adjuntos inválido (NaN, infinito, fracciones, cero o negativo) vuelve al límite100MiB; firmas recogidas en un prefijo de8000 bytes a través de chunks fragmentados, con replay sin pérdida y cierre del iterador en errores. Se rechaza un chunk mayor256KiB antes de bufferizarlo, respetando el máximo8MiB con el buffer de subida. Los fragmentos del prefijo se liberan al reproducirlos y el prefijo se libera tras identificar el tipo. Tres unitarias y cinco e2e Drive simulado verdes.

Regresión global: se actualizan expectativas del trigger normalizado (85), se declara `due_date:null` para probar explícitamente inicio sin final, se aísla la lista de paginación MCP y se simula un envío push exitoso para comprobar la reiteración constante. La prueba no afirma recepción externa.

La validación con proveedores reales, staging, iOS físico y copia de producción sigue pendiente. No se han borrado archivos ni volúmenes de producción.
