# Calendarios: revisión tras la auditoría del 21/10/2026

RF-1101–1105, RF-1902/1903 y bloque 4 del documento de alcance del 20/10 (ahora en `docs/spec/done/`). La revisión anterior certificaba composición con pruebas insuficientes; queda sustituida por esta revisión y su evidencia sintética.

## Primer corte

Toolbar móvil deliberadamente en dos filas, Hoy y selector legibles hasta 320 px. Mini-calendario visible con fecha completa, selección, flechas de teclado y salto directo; Popover existente para Escape, clic exterior, foco y límites del viewport. Opciones sin otra capa anidada. Año conserva el mes en URL al abrirlo. Navegación temporal con historial.

Agenda y detalle del día comparten composición compacta; eliminadas las definiciones globales conflictivas de `ui.css`. Fecha sin número duplicado, horas/rangos sin salto, títulos íntegros y marcas por tipo real. Los eventos que atraviesan días aparecen en cada día visible y el panel inferior utiliza el día seleccionado. La ayuda de integraciones vive en Opciones. La Agenda conserva su ventana de 60 días y avance de 30, ahora explícitos.

Rejilla de 24 horas con posición de entrada útil y estable al recibir datos, cabecera y franja persistentes, eje horario fijo al desplazar horizontalmente. Las marcas de todo-el-día y de solapamientos dejan más anchura al título. Varias semanas tiene selector 2–6 y filas compactas. Mes mide alturas reales de chips y barras (sin offsets de 28 px), muestra +n exacto ante desborde y abre el detalle completo. En móvil conserva puntos y acceso al día. Cabeceras sin cápsulas, fechas con nombre completo y cantidad, hoy anunciado, Año móvil con una columna más legible y Trimestre con altura natural.

R02 confirmado: el endpoint calendario incluye tareas con solo inicio, mientras la consulta por vencimiento las excluía. Se recupera su detalle por API existente y se sitúan en el inicio, sin alterar modelo/API. Los rangos de tareas con vencimiento siguen representados por su vencimiento; no se introduce una nueva duración semántica de tarea. R03 corregido en URL. R04 conserva el solape explícito. R07 no produce conjunto vacío: tres días naturales siempre contienen al menos un laborable; el título usa los días visibles.

## Validación en curso

`pnpm test` completo pasó con Node 26; la primera ejecución simultánea con lint y TypeScript tuvo un timeout de HealthController, que pasó al repetir la suite. TypeScript global correcto. Ajustes de lint corregidos; pendiente repetir comprobación final. OpenAPI regenerado sin diff. No se cambia API, modelo ni eventos de dominio.

Pruebas Playwright sintéticas: matriz de ocho vistas a 1440/390/320 claro/oscuro, capacidad 0/1/3/10/30, detalle completo, selector de rango y recarga, eje horario después de desplazamiento, inicio sin vencimiento y carga/error. Quince de dieciséis pasaron; el último recorrido esperaba un nombre antiguo de checkbox y se está repitiendo con el nombre real.

Las capturas anteriores en `assets/calendar-2026-10-21/` se conservan como antes sintético. El después se genera en `assets/calendar-remediation-2026-10-21/`; revisión visual final en curso. Ninguna evidencia privada se publica. No se certifica todavía lector de pantalla físico, gestos en dispositivo real ni la matriz ampliada de tablet/zoom/DST.
