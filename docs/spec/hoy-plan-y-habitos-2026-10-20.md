# Hoy: Plan del día y Hábitos

Ampliación autorizada el 20 de octubre de 2026 a partir de `cursor-prompt-plan-y-habitos-hoy-ece8e006.md`. Requisitos relacionados: RF-1301/1302/1304 (hábitos y registro), RF-2640/2641/2642 (carga real), RF-2671 (acceso a replanificación).

**Corrección posterior del usuario:** se retira del alcance la pantalla Cerrar el día y se elimina su enlace en Hoy. La franja ofrece Planificar y Replanificar; este último va dentro del menú secundario en móvil. No se rediseña la pantalla de cierre ni se modifica su API.

## Alcance aceptado

Sólo la pantalla Hoy. Sustituir el banner de planificación por una franja de superficie, borde fino y tamaño de fila. Mostrar Plan del día, carga real y capacidad configurada, aviso de tareas sin duración cuando el recuento es conocido y positivo, Planificar destacado y Replanificar secundario. Permitir wrap sin alturas rígidas ni overflow. Carga desconocida/error: texto neutro o ausencia del dato, nunca cero ficticio.

Hábitos sin crear: cabecera colapsable y fila fantasma Añadir un hábito, con Ocultar. Reutilizar la ocultación existente durante siete días con la misma clave de localStorage. Hábitos existentes sin programación hoy: fila de estado independiente, sin CTA de creación ni contador de completitud. Hábitos programados hoy: filas compactas, check redondo, nombre, progreso, contador y hora de recordatorio; contador de sección X/Y hoy. Mantener el incremento actual por pulsación, sin completar de golpe objetivos de cantidad. Recordar colapsado.

Preservar cabecera, quick-add, sidebar, chips, agrupaciones, tareas, rutas y lógica de los flujos existentes. Usar tokens y verificar escritorio/móvil, claro/oscuro. No introducir datos de muestra en producción ni backend nuevo.
