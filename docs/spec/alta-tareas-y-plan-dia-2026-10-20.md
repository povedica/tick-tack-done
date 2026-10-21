# Alta de tareas y planificación diaria — ampliación del 20 de octubre de 2026

Petición de Pablo sobre la PR #57, ampliada durante la implementación. Requisitos relacionados: RF-101/102/107, RF-601/604, RF-801 y RF-2301/2302. La petición actual sustituye Agenda de hoy por un acceso a Planificar mi día y sustituye la propuesta breve en línea por la revisión diaria explícita.

## Alta compartida

Hoy, Mañana, vistas inteligentes, listas, Bandeja —incluida vacía— y captura global comparten `TaskComposer`. Un solo campo para el título/NLP, fecha visible a la derecha y menú de opciones separado. Enter crea; las opciones nunca envían el formulario. El título no se reescribe al elegir metadatos. Fechas explícitas prevalecen sobre las inferidas y los valores por defecto de la vista. Las fechas respetan la zona de la cuenta.

El menú ofrece capacidades existentes: prioridad, lista, etiquetas, adjuntos, plantillas locales, nota, descripción y voz. El calendario conserva fecha, hora, duración, repetición y recordatorio. No se añade conversión a un evento externo, ya que esos calendarios son de solo lectura. El selector de archivos permanece oculto hasta pulsar Adjuntos.

Los flotantes se anclan al control que los abre, mediante portal, con ancho propio y límites de ventana. Solo hay un panel del compositor abierto; Escape y clic exterior lo cierran. Al elegir una opción se vuelve al título. Las opciones no crean tareas ni vacían el borrador. Un error conserva texto y metadatos. Las altas usan idempotencia y la cola sin conexión existente; los archivos requieren conexión y reintentar su subida no crea otra tarea.

La API acepta `reminder_trigger` en `POST /tasks`, con los disparadores relativos del selector. La ausencia conserva el comportamiento anterior; `null` desactiva tanto el recordatorio inferido como el predeterminado. La selección se guarda dentro de la transacción de creación. Scheduler mantiene la materialización de recurrencias y recordatorios.

## Planificar mi día

- Agenda de hoy se retira de la pantalla Hoy. El acceso a Planificar mi día está siempre visible y conserva enlaces secundarios a cierre/replanificación cuando están habilitados.
- La planificación pide únicamente la fuente de hoy, sin vencidas de otros días, Bandeja ni tareas sin fecha. Incluye los intervalos activos de inicio y vencimiento que abarcan el día.
- Mismo patrón visual de revisión semanal: casillas compartidas, títulos truncados, contexto de lista/fecha, selección azul y barra común Listo / Hoy / Mañana / No haré. La casilla solo selecciona. Sin papelera en esta pantalla.
- Las acciones registran decisiones en la sesión; no modifican tareas hasta Confirmar plan. La vista previa muestra únicamente decisiones explícitas. Cada chip permite quitar una decisión. Terminar planificación no exige decidir todas las tareas.
- Hoy/Mañana organizan el plan y conservan el vencimiento. Completar o No haré requieren confirmación con el número exacto antes de aplicar.
- Las recurrentes, y los snapshots antiguos sin una señal de seguridad verificable, no se seleccionan desde esta pantalla; enlazan al detalle y explican la limitación.
- Filas compactas y barra inferior móvil compartida con revisión semanal. Estados de carga, vacío y error con reintento.

## Aceptación

La validación y capturas con datos sintéticos se documentan en [el informe del cambio](../reviews/alta-y-planificacion-diaria-2026-10-20.md). Sin migraciones, eventos nuevos ni cambios en tareas personales durante la investigación de referencia. Se mantiene la rama actual por instrucción expresa del usuario; los cambios previos del Jardín permanecen separados.
