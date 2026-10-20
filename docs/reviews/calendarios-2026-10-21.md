# Calendarios: lenguaje común en las ocho vistas

RF-1101–1105, RF-1902/1903 y bloque 4 del documento del 20/10.

Barra compartida con navegación anterior/Hoy/siguiente, periodo y salto mediante calendario nativo, semana ISO, vistas segmentadas y Más, captura global y opciones de visibilidad conservadas. En móvil hay selector de las ocho vistas y Hoy visible, comprobado hasta 320 px.

Tareas con checkbox interactivo; eventos con icono de calendario y detalle de solo lectura. Ninguna marca se deduce del título ni de la hora. Agenda agrupa mes y día, separa la hora/rango del título y conserva el texto íntegro. Permite consultar periodos anteriores. Eventos a medianoche mantienen 00:00.

Día/Semana/Varias jornadas comparten cabeceras y franja de todo el día. Cada tarea usa su columna y los eventos de varios días abarcan solo sus fechas. Eventos con hora que cruzan medianoche permanecen en la rejilla, divididos por sus días. La rejilla cubre desde las 00:00 y distribuye solapamientos en columnas paralelas. Semana móvil conserva los siete días con desplazamiento contenido.

Mes/Varias semanas muestran chips íntegros y barras continuas de eventos de varios días. Las filas crecen con el contenido: se elimina el recorte arbitrario a tres elementos, sin ocultar registros mientras haya espacio. En móvil usan puntos por elemento; pulsar un día abre diálogo inferior con toda su lista y cierre por Escape. Año/Trimestre reutilizan el mismo componente de mini-meses con altura natural, marcas de tareas/eventos y enlace de cada día a Día; Trimestre añade semanas ISO.

Tokens del tema para fondos, acento y controles. El token `--on-accent` permite texto legible sobre acento también en oscuro en los flujos modificados. Se mantienen fuentes/colores del registro, filtros de visibilidad e integraciones de solo lectura.

## Verificación

Seis recorridos Playwright de las ocho vistas (48 combinaciones: 1440/390/320, claro/oscuro) más prueba de salto y diálogo completo del día. Datos sintéticos, sin escribir en cuentas personales. Unitarias de distribución horaria y eventos nocturnos; regresión de suscripciones, alineación y otras superficies. Capturas en `assets/calendar-2026-10-21/`.

## Cierre del alcance

Lint y TypeScript correctos; 436 unitarias y 110 pruebas de integración correctas. 84 pruebas de navegador distintas verificadas entre los flujos afectados, incluidas las siete de Calendarios. Build API/SDK/PWA correcto; permanece el aviso previo de tamaño del bundle principal. OpenAPI y SDK regenerados de nuevo, sin diff. Contraste medido del texto nuevo: 5,59:1 en primarios, 5,46:1 en vencimiento claro y 6,87:1 en oscuro. El redimensionado del panel se prueba con teclado, arrastre y recarga.
