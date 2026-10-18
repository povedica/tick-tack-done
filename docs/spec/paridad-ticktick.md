# Paridad visual y funcional con TickTick

Comparación hecha el 19 de octubre de 2026 contra `https://ticktick.com/webapp/#q/all/tasks`
(sesión ya iniciada, vista All) y contra el cliente local. El objetivo es que tick-tack-done
se parezca y se comporte como TickTick. Esto no reescribe tareas ya importadas.

## Hecho en esta pasada

- El `+` de la barra de iconos, el `+` inferior y la tecla `N` enfocan el campo
  «+ Añadir tarea» de la lista. Ya no abren el formulario de captura en la columna
  derecha del grid, sin caja ni fondo.
- Si la vista no tiene ese campo, la captura se abre como diálogo centrado.
- El lateral pasa a un azul continuo, con la fila activa en pastilla clara, como TickTick.
- En Hoy, una tarea de hoy dice «Hoy» y no la fecha numérica. Como mucho se ven dos etiquetas.

## Sidebar

TickTick: carril de iconos azul y panel azul más claro, en una sola pieza. Arriba, avatar.
Luego All, Today, Tomorrow, Next 7 Days, Assigned to Me, Inbox y Summary, con el contador
a la derecha. Una línea separa las listas. Las listas van con icono, nombre truncado y
contador. Carpetas (Trabajo, Personal) se pliegan. Debajo, listas archivadas, filtros y
etiquetas. La fila activa es una pastilla blanca translúcida.

Pendiente:

- Orden y nombres de las listas inteligentes (All primero; Assigned y Summary no están).
- Carpetas de listas y sección de archivadas plegable.
- El carril de TickTick lleva matriz, foco, búsqueda, calendario suscrito, avisos y ayuda.
  El nuestro mezcla Hoy, calendario, búsqueda, hábitos y el `+`.
- El contador de la papelera no debe quedarse en «—» cuando el resto ya cargó.

## Añadir una tarea

TickTick: una barra redondeada al inicio de la lista, «+ Add task to "inbox"». Al enfocarla
aparece el cursor, un icono de calendario y un chevron. No abre un panel lateral.

- Iconos de fecha y de más opciones dentro de esa barra: al enfocar aparecen calendario (Hoy / Mañana) y un chevron que abre el diálogo completo.

Pendiente: el placeholder con el nombre de la lista de destino.

## Fila de tarea

TickTick: una sola línea. Checkbox, título, pastillas de color, nombre de lista en gris,
iconos pequeños (recordatorio, repetición) y la fecha a la derecha. La fecha vencida va en
rojo (`Apr 28`). No hay asa de arrastre ni botón de más hasta pasar el ratón. El título
puede seguir llevando `#etiqueta` además de la pastilla.

Pendiente:

- Quitar el asa salvo en orden manual (Hoy ya lo oculta; el resto hay que revisarlo).
- Iconos de recordatorio y repetición en la fila.
- Fecha corta en rojo si está vencida, también fuera de Hoy.
- El meta no puede empujar la página: máximo dos etiquetas y la fecha siempre visible.
- Cabecera de grupo «Overdue 55» con una acción «Postpone» a la derecha.

## Detalle de tarea

Pendiente de comparar sección a sección: al abrir una tarea, TickTick sustituye la lista
por un panel ancho (título, fecha, prioridad, etiquetas, lista, checklist, descripción),
no un formulario estrecho sin maquetar.

## Resto de secciones

Pendiente de recorrer con la misma sesión: Today, Calendar (mes, semana, día, agenda),
Matrix, Habits, Focus, Search, Summary, Filters, Tags, Settings. Cada diferencia que
aparezca se añade aquí y se corrige en la misma rama.
