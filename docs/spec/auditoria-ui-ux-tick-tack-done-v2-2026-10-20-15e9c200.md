# Auditoría UI/UX — Tick-Tack-Done (v2, pasada de detalle fino)

**Producto:** https://todo.reflexionia.com
**Fecha:** 20 de octubre de 2026 (v1 publicada ~11:30; segunda pasada 12:21-12:35, CEST)
**Alcance de la v2:** segunda pasada en vivo, de solo lectura, a nivel de detalle fino sobre todas las pantallas principales y ajustes, en escritorio (1280x800) y móvil (390x844), fusionada con la v1. Se conservan íntegros todos los hallazgos de la v1 y se añaden los nuevos con sus IDs, prioridad, ruta, evidencia medida en el navegador y propuesta de corrección.
**Método:** sesión autenticada real, navegación pantalla a pantalla, mediciones con JavaScript en el navegador (clases CSS, tamaños, estilos calculados, atributos ARIA, textos visibles) e inspección visual de capturas de cada hallazgo. Sin modificar ningún dato.

## Cómo leer este documento

- **Parte 1** = auditoría v1 íntegra, sin cambios de redacción.
- **Parte 1.5** = estado actualizado de los hallazgos v1 tras la segunda pasada (re-verificados, corregidos o matizados).
- **Parte 2** = hallazgos nuevos de la pasada de detalle fino, por pantalla.
- **Parte 3** = decisiones de diseño actualizadas.

Prioridades: **P0** rompe o engaña al usuario / dato incorrecto; **P1** fricción visible que degrada la confianza; **P2** pulido.

## Resumen ejecutivo de la v2 (lo más importante nuevo)

1. **[P0] Menú "Más" del móvil invisible** (MOV-1): la hoja se abre con sus 10 opciones (Buscar, Hábitos, Matriz, Foco, Cuenta atrás, Jardín, Reportes, Revisión, Filtros, Ajustes) pero el texto es blanco sobre fondo blanco (`color: rgba(255,255,255,0.82)`). En móvil, esos módulos son inalcanzables.
2. **[P0] Datos incoherentes entre superficies** (DAT-1): la campana marca 8 vencidas, el Jardín dice "Vencidas 9" y Revisión dice "Revisar vencidas · 9". Además, en Jardín > Logros el texto dice "Puntuación activada" con un chip "Puntuación desactivada" (JAR-2).
3. **[P0] Descripción de tarea con texto corrupto repetido** (DET-5, el de la captura de Pablo): la descripción guardada contiene el texto repetido decenas de veces; la segunda pasada confirma que el campo descripción es un `<textarea>` plano de altura fija sin auto-crecer ni render de markdown (DET-3/DET-4).
4. **[P0 aparentemente corregido] UUIDs en "Plan de hoy"** (EXT-9): en la captura de 12:15 las sugerencias mostraban UUIDs crudos; en la segunda pasada (12:21) ya se ven títulos. Apunta a corregido en el redeploy de esta mañana; conviene verificar con datos frescos antes de cerrar.
5. **[P1] Enlaces azules por defecto sin estilar en varias pantallas** (EXT-7, REV-1): "Ayúdame con esta tarea", "Cerrar el día (2)", "Replanificar el día", "Abrir bandeja" y los de Revisión son `<a>` sin clase: azul `rgb(0,0,238)` subrayado, aspecto de web de 1998 junto al resto de la UI.
6. **[P1] Hashtags crudos en títulos por todas partes** (TSK-4, ampliado): títulos de tareas, filas de matriz, listas y hasta los `aria-label` de los checkboxes ("Completar «Pagar asistenta #casa #personal...»"), que el lector de pantalla lee en voz alta (TSK-6).
7. **[P1] Recurrencia "El día -1 de cada mes"** (DET-6): la recurrencia de fin de mes se expresa con un -1 en crudo en vez de "El último día de cada mes".
8. **[P1] Matriz solo muestra ~1,5 de 4 cuadrantes a 1280px** (MTX-1): el grid mide 1911px de ancho dentro de un contenedor de 919px.
9. **[P1] Flechas del calendario con aria-label equivocado en todas las vistas** (CAL-9): dicen "Mes anterior/siguiente" también en Día, Semana, Año y Agenda (en Año mueven un año entero).
10. **[P2 systemic] Detalles de copy y formato**: zonas horarias en inglés crudo, lista inteligente "someday" sin traducir, "Parada" como etiqueta de estado, "30 min antes" vs "5 minutos antes", fecha "19/11/2026" vs "17 may", variable de entorno `TICKY_UI_ENABLED` visible en copy de usuario, ruta interna "/cierre" visible en un texto de ayuda.

---

# PARTE 1 — Auditoría v1 (íntegra)

> Texto original de la primera pasada, conservado sin cambios. Las actualizaciones de estado tras la segunda pasada están en la Parte 1.5.

# Auditoría UI/UX - tick-tack-done (20 oct 2026)

Documento 1 de 2. Auditoría visual y de maquetación de la app en producción (https://todo.reflexionia.com), hecha vista a vista sobre la sesión real de Pablo, en desktop (viewport 1280x713), sin modificar datos. El documento 2 (pantalla de Estadísticas) va aparte, como pidió Pablo.

Cómo leerlo: cada hallazgo lleva ID, prioridad, dónde está (ruta y clases CSS reales del DOM, para localizarlo rápido en el repo), qué se ve hoy (evidencia medida), qué debería pasar y propuesta de arreglo. Al final hay una lista de decisiones abiertas con propuesta por defecto, para que Pablo confirme o cambie.

Prioridades: P0 = bug visible que rompe confianza (overlap, dato incoherente, scroll inesperado). P1 = mejora fuerte de look and feel que Pablo ya pidió. P2 = pulido.

---

## 1. Sección de tokens (Ajustes > Tokens y MCP, /settings/tokens)

Valoración general: la página funciona y la información es correcta, pero es plana: todo son tarjetas grises iguales, sin jerarquía visual, y la tarjeta de cada token es un muro de 20 pastillas idénticas. No transmite "zona de seguridad profesional" (comparar con la página de tokens de GitHub o de Linear).

### TOK-1 (P1) Las tarjetas de token son un muro de pastillas ilegible
- Dónde: `/settings/tokens`, tarjetas bajo "Tokens de agente" (clase de la lista de scopes dentro de cada tarjeta).
- Qué se ve: cada token muestra ~20 chips idénticas ("Leer tareas", "Escribir tareas", "Leer listas", "Escribir listas", "Leer etiquetas", "Leer etiquetas"...) en 5 filas que se repiten sin orden claro (lectura/escritura mezclados, "Leer etiquetas" aparece dos veces en el mismo token, una al final de la primera fila y otra al inicio de la segunda: probable duplicado de scope o mala ordenación).
- Propuesta: agrupar permisos por recurso en una tabla compacta de 2 columnas (Recurso | Permiso): "Tareas: lectura+escritura", "Listas: lectura+escritura", "Hábitos: lectura", etc. Una línea por recurso, no una pastilla por permiso. Revisar además el duplicado de "Leer etiquetas".

### TOK-2 (P2) Fechas con precisión de segundos
- Qué se ve: "Creado 19 oct 2026, 17:24:36 · Último uso 20 oct 2026, 11:53:24".
- Propuesta: quitar segundos ("19 oct 2026, 17:24") y usar formato relativo para el último uso ("hoy, 11:53" / "ayer, 16:30").

### TOK-3 (P1) "Revocar" no parece destructivo
- Qué se ve: "Actividad" y "Revocar" son dos enlaces de texto plano, idénticos en estilo, al pie de la tarjeta.
- Propuesta: "Revocar" como botón discreto pero en color peligro (rojo tenue), separado a la derecha, con confirmación. "Actividad" como enlace normal.

### TOK-4 (P2) Jerarquía de secciones y copy redundante
- Qué se ve: el subtítulo de cabecera dice "El secreto se muestra una sola vez" y la tarjeta "Nuevo token" repite "El secreto aparece una sola vez". Tres bloques (MCP, Nuevo token, lista) con el mismo peso visual.
- Propuesta: una sola mención al secreto (en el diálogo de creación, que es donde importa). Dar a la lista de tokens el peso principal (es el contenido), y MCP y Nuevo token como bloques secundarios más compactos.

### TOK-5 (P2) Bloque "Configuración para Cursor"
- Qué se ve: caja de código monoespaciada correcta (el JSON se renderiza con comillas dobles, bien), con botón "Copiar configuración".
- Propuesta: añadir también la configuración lista para ChatGPT (URL `https://todo.reflexionia.com/api/v1/mcp` + auth OAuth) y, si aplica, Claude; con pestañas o un desplegable "Cliente: Cursor / ChatGPT / Claude". Es la página donde la gente viene a conectar clientes; hoy solo cubre Cursor.

### TOK-6 (P2) Ancho de contenido
- Qué se ve: en viewport de 1280px la columna de contenido queda muy ancha y las tarjetas se estiran; con la subnavegación de ajustes abierta queda una calle vacía grande entre nav y contenido.
- Propuesta: max-width ~720-760px para el contenido de ajustes, centrado en el espacio disponible.

---

## 2. Vistas de calendario

Rutas reales (extraídas del bundle y de la barra de pestañas): `/calendar/day`, `/calendar/week`, `/calendar/multi-day`, `/calendar/multi-week`, `/calendar/month`, `/calendar/quarter`, `/calendar/year`, `/calendar/agenda`. La barra de pestañas (Día, Semana, Varios días, Varias semanas, Mes, Trimestre, Año, Agenda) es buena y hay que conservarla.

### CAL-0 (P0) Vista desconocida renderiza Mes en silencio
- Qué se ve: `/calendar/days` (ruta inexistente) muestra la vista Mes con la pestaña "Mes" activa, manteniendo la URL `/calendar/days`.
- Propuesta: redirigir a `/calendar/month` (301 en cliente) o 404. Un fallback silencioso deja URLs ambiguas guardadas en historial y enlaces.

### CAL-1 (P1) Número de semana en Semana y Varios días (petición de Pablo)
- Qué se ve: ni la cabecera ("19 - 25 oct") ni ninguna parte de la vista muestra el número de semana ISO.
- Propuesta: cabecera tipo "19 - 25 oct · S43" (ISO-8601, semana que empieza en lunes, coherente con locale es-ES). En Varios días, si el rango cruza dos semanas: "20 - 22 oct · S43". Mismo sitio y formato en ambas vistas. Aprovechar y mostrarlo también como columna fina de números de semana en Mes (ver CAL-6), como hace FullCalendar (`weekNumbers: true`).

### CAL-2 (P1) Toggle "solo semana laboral" en Semana (petición de Pablo)
- Qué se ve: siempre 7 columnas.
- Propuesta (decisión D1, con opción por defecto): un toggle junto a las pestañas de vista ("L-V"), persistente en preferencias, que filtra sábado y domingo en Semana y en Varios días. Por defecto proponemos toggle en la vista Semana (no vista nueva), porque una vista extra añadiría una novena pestaña a una barra ya cargada.

### 2.1 Vista Día (/calendar/day) - la mejor parada
Pablo: "La vista Día parece bien". Confirmado, es la más cuidada. Detalles a pulir:

### DIA-1 (P2) Sin indicador de "ahora"
- Evidencia: no existe ningún elemento tipo `now`/`current-time` en el DOM de la vista; a las ~12:00 no hay línea ni marca en la hora actual.
- Propuesta: línea fina roja/naranja con puntito en el gutter (estilo FullCalendar `nowIndicator`), solo cuando el día mostrado es hoy.

### DIA-2 (P2) Franja de todo el día sin etiqueta
- Qué se ve: la tarea de todo el día ("Recoger a Markus del cole a las 16:00") cuelga en una tira sobre el gutter sin rótulo, y el título del día ("mar 20") está centrado en el área del grid, lejos del gutter de horas.
- Propuesta: rotular la franja como "todo el día" (pequeño, en el gutter) y alinear la cabecera del día sobre su columna.

### DIA-3 (P2) Rejilla horaria demasiado tenue
- Qué se ve: líneas solo por hora, casi invisibles; sin medias horas.
- Propuesta: reforzar la línea de hora en punto y añadir media hora punteada muy tenue. Rango visible 06:00-16:00+ con scroll; valorar empezar en 07:00 según ajuste de jornada que ya existe en Ajustes > Jornada.

### 2.2 Vista Semana (/calendar/week)

### SEM-1 (P0) Scroll horizontal inesperado
- Evidencia medida: `.hour-board` tiene scrollWidth 1068px frente a 919px disponibles (también `.hour-allday` y `.screen-page.is-wide` desbordan). Aparece scrollbar horizontal en un viewport de 1280px, sobrando espacio vertical.
- Propuesta: la rejilla debe encajar al ancho (columnas con `minmax(0,1fr)` y contenido con `min-width:0` para que el texto trunque en vez de empujar). El desborde lo causan las barras rojas de eventos multiday (ver SEM-3) que se pintan más allá de su columna.

### SEM-2 (P1) Sin separación entre días (petición de Pablo)
- Evidencia medida: las columnas `.hour-col` tienen border-left y border-right de 0px. Es imposible ver a qué día pertenece un bloque sin subir a la cabecera.
- Propuesta: borde izquierdo de 1px en cada `.hour-col` con un gris muy tenue (p. ej. `var(--border)` o #E5E7EB), y fondo ligeramente distinto para la columna de hoy (ver SEM-4). Es exactamente la sutileza que pide Pablo.

### SEM-3 (P0) Eventos de varios días: repetidos, cortados y fuera de la rejilla
- Qué se ve: "Stay at Hotel Termas Baln…" aparece como 3 barras rojas independientes (vie 23, sáb 24, dom 25) con el título repetido, y la última se corta contra el borde del viewport (contribuye al scroll horizontal de SEM-1). Además se pintan en la franja superior, por encima de la fila de cabeceras de día (lun 19 ... dom 25), en vez de debajo.
- Propuesta: una única barra continua que atraviesa vie-dom (spanning), colocada en la franja de todo el día bajo las cabeceras de día; truncado con "…" dentro de la barra, nunca desbordando la celda. Color coherente con el resto de eventos (hoy estas barras son rojas mientras los demás eventos son azul tenue; ver CAL-7).

### SEM-4 (P1) El día de hoy no se distingue
- Evidencia: no hay ningún elemento con clase `today` ni `aria-current` en la vista; la cabecera "mar 20" tiene el mismo estilo que el resto.
- Propuesta: número del día de hoy con círculo azul (como ya hace Mes y Trimestre) y fondo de columna azul muy tenue.

### SEM-5 (P2) Orden de franjas
- Qué se ve: la franja de todo el día/multiday está encima de las cabeceras de día.
- Propuesta: orden estándar (FullCalendar/Bryntum/Google): cabecera de días, luego franja "todo el día", luego rejilla horaria.

### 2.3 Vista Varios días (/calendar/multi-day)
### MDI-1 (P1) Aplicar el mismo estilo que Semana (petición de Pablo)
- Qué se ve: 3 columnas (mar 20, mié 21, jue 22) sin ningún separador; los eventos ("Preparar la comida") ocupan la primera columna y no se percibe dónde acaba un día y empieza otro. Mismo componente `.hour-col` sin bordes.
- Propuesta: compartir componente y CSS con Semana (mismos bordes de día, misma cabecera, mismo hoy resaltado, mismo número de semana en cabecera). Si Semana y Varios días comparten plantilla, este arreglo es gratis.

### 2.4 Vista Varias semanas (/calendar/multi-week)

### MWE-1 (P1) La rejilla no llena el alto: medio viewport vacío
- Qué se ve: 2 filas de semanas ocupando ~300px y debajo un vacío blanco de ~400px. Sensación de página a medio hacer (Pablo: "puede mejorarse, algo más profesional").
- Propuesta: las filas deben repartirse el alto disponible (`grid-auto-rows: 1fr` sobre un contenedor a `height:100%`), con un mínimo razonable por fila.

### MWE-2 (P1) Chips cortados en el borde derecho de cada celda
- Qué se ve: "Stay at Hotel Termas E…" y "20:30 Taza + libro · le…" se cortan contra el límite de columna; el texto llega al borde de la celda sin padding.
- Propuesta: truncado con ellipsis dentro de la celda (`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`) y padding lateral en los chips.

### MWE-3 (P2) Sin indicador de desbordamiento por celda
- Qué se ve: celdas con 3 eventos apilados; si hubiera más, no hay "+N más" (verificado: no existe ningún elemento `+N` en Mes ni en Varias semanas).
- Propuesta: máximo N chips visibles por celda y enlace "+2 más" que abre el día (estilo FullCalendar `dayMaxEventRows`).

### 2.5 Vista Mes (/calendar/month)

### MES-1 (P1) Look and feel general
- Qué se ve: rejilla correcta y con hoy marcado (círculo azul en "20"), pero los eventos son chips rojo/rosa intenso con texto blanco, muy gritones para una vista de densidad alta; títulos truncados sin ellipsis ("18:20 Karate Lucas y"), sin "+N más", y la fila de cabecera de días (lun...dom) con fondo gris algo tosco.
- Propuesta: chips con fondo tenue y texto en color de acento (pastel sobre blanco, como FullCalendar dayGrid), ellipsis consistente, "+N más", y cabecera de días sin fondo gris (solo texto pequeño en mayúsculas gris, borde inferior fino).

### MES-2 (P2) Números de semana
- Propuesta: columna fina a la izquierda con el número de semana de cada fila (FullCalendar `weekNumbers`). Refuerza CAL-1.

### MES-3 (P2) Celdas de otros meses
- Qué se ve: los días de septiembre/noviembre aparecen con fondo gris y texto gris claro; correcto, pero los chips de esos días (p. ej. "20:30 Taza + libro" el 8 nov) se muestran también atenuados y apenas legibles.
- Propuesta: mantener atenuado el número pero los chips con opacidad ~0.6, no el fondo entero lavado.

### 2.6 Vista Trimestre (/calendar/quarter)

### TRI-1 (P0) El tercer mes se corta
- Qué se ve: "Diciembre" queda recortado por el borde derecho del viewport (la columna "dom" y las fechas salen parcialmente fuera). Desborde horizontal en una vista pensada para ver de un vistazo.
- Propuesta: 3 columnas fluidas con `minmax(0,1fr)` y gap fijo; si no caben, apilar a 1-2 columnas en vez de cortar.

### TRI-2 (P2) Puntos sin información
- Qué se ve: puntitos azules bajo algunas fechas, sin conteo, sin color por tipo y sin leyenda; al hacer hover/click no hay tooltip ni navegación evidente.
- Propuesta: punto por día con eventos con conteo si hay más de 3, tooltip con los títulos al hover, y click que navega a la vista Día de esa fecha. Color del punto por lista/prioridad si ya existe esa semántica en Mes.

### TRI-3 (P2) Alineación de los minim meses
- Qué se ve: los 3 minim meses tienen alturas distintas (5-6 filas) y no comparten línea base; queda desordenado.
- Propuesta: misma altura de fila fija para todos los minim meses (6 filas siempre, como hace el mes de calendario estándar).

### 2.7 Vista Año (/calendar/year)

### ANO-1 (P2) Densidad y navegación
- Qué se ve: 12 minim meses en grid 4x3, correcto y con hoy resaltado en octubre, pero la página hace scroll (la última fila queda cortada al cargar) y los meses no parecen clicables.
- Propuesta: reducir padding para que quepan los 12 meses sin scroll en 1280x800; cada mes clicable (navega a Mes) y cada día clicable (navega a Día). Valorar modo "heatmap" de intensidad por día (estilo GitHub) como capa opcional: ayuda mucho a la vista anual y es barato de pintar con los conteos que ya hay.

### 2.8 Nota transversal de calendario
### CAL-7 (P1) Semántica de color incoherente entre vistas
- Qué se ve: en Semana/Mes la mayoría de eventos son chips rojo/rosa ("18:20 Karate Lucas y Lola", "19:30 Batería", "Stay at Hotel Termas"...), pero algunos son azul tenue ("Preparar la comida", "Recibir feedback", "00:00 Cumple de …"). No hay leyenda ni patrón visible que explique la diferencia (no es lista, no es hora, no es todo el día).
- Propuesta: definir la regla de color (por lista con color, por prioridad, o un solo color de acento) y aplicarla igual en todas las vistas. Si hay colores por lista, mostrarlos también como punto de color en Agenda y chips tenues con texto de acento, no bloques saturados.

### CAL-8 (P2) Inspiración (sin cambiar de librería)
Pablo pidió inspirarse en FullCalendar y Bryntum sin adoptar la librería. Concreto y aplicable:
- FullCalendar timeGrid: separadores de día de 1px, `nowIndicator`, cabecera con hoy resaltado, eventos multiday como barra continua en la franja all-day. -> SEM-2, SEM-3, SEM-4, DIA-1.
- FullCalendar dayGrid (mes): `dayMaxEventRows` con enlace "+N más", chips pastel, `weekNumbers`. -> MES-1, MES-2, MWE-3.
- Bryntum Calendar (https://bryntum.com/products/calendar/examples/): su ejemplo de `listview` (eventos en forma de lista) y `list-range` son la referencia más cercana a nuestra Agenda (ver sección 3); el ejemplo `print` que enlazó Pablo es esencialmente el mes bien maquetado con celdas aireadas y chips contenidos: mismo principio que MES-1/MWE-2. Su demo `shifted` (día que no empieza a medianoche) encaja con DIA-3 y con el ajuste de Jornada existente.

---

## 3. Vista Agenda (/calendar/agenda)

Pablo: "requiere cariño... las pastillas sombreadas de color ocupan mucho y destacan demasiado". Confirmado y además hay problemas de fondo:

### AG-1 (P0) La agenda empieza 3 semanas en el pasado
- Qué se ve: con cabecera "octubre de 2026", la primera fila es "28 Lun" (28 de septiembre) y sigue 29, 30, 1, 4, 5, 6... Es la ventana visible del mes (lunes de la semana del 1 de octubre), no una agenda desde hoy. Una agenda que empieza mostrando días pasados de otro mes desorienta.
- Propuesta: la agenda empieza SIEMPRE en hoy y avanza hacia adelante (30-60 días o scroll infinito). Si se quiere contexto del mes, que la cabecera de mes cambie al hacer scroll (sticky), como hace TickTick.

### AG-2 (P1) Densidad muy baja y pastillas desproporcionadas
- Qué se ve: cada día es un bloque de ~80px de alto con un número gigante ("28") y la pastilla del evento a la derecha, rosa saturada con borde y sombra. Un solo evento por día ocupa toda la fila; el 70% del ancho queda vacío. Todas las pastillas son del mismo rosa aunque en Mes algunas eran azules (se pierde la semántica de color, ver CAL-7).
- Propuesta: formato lista compacta, una fila por evento (28-36px): checkbox opcional, hora, punto de color de la lista, título, lista/etiquetas discretas a la derecha. Cabecera de día como fila fina sticky ("Hoy · mar 20 oct", "Mañana · mié 21 oct", "jue 22 oct"), sin número gigante. Es el patrón de FullCalendar `listWeek` y de la agenda de TickTick, y el que menos sorpresas da.

### AG-3 (P1) Comparativa pedida por Pablo (FullCalendar / TickTick / otras) y recomendación
- FullCalendar list view: filas densas, cabecera de día como banda, punto de color + hora + título. Sin checkbox (es un calendario, no un gestor de tareas).
- TickTick (vista agenda de su calendario y lista "próximos"): agrupa por día con cabecera discreta sticky, cada tarea es una fila con checkbox redondo, hora a la izquierda del título, etiquetas/lista en gris pequeño; completar desde la propia agenda.
- Google Calendar "Agenda"/"Programación": igual que FullCalendar list, con franjas de día y chips de color por calendario.
- Recomendación (decisión D2, con opción por defecto): el modelo TickTick/FullCalendar-list (fila por evento + cabecera de día sticky + checkbox para completar), NO el de bloques grandes por día. Es el más simple, el más denso y el coherente con que esto es un gestor de tareas. Sin complicaciones: una sola lista cronológica, días vacíos omitidos.

### AG-4 (P2) Sin acciones desde la agenda
- Qué se ve: no se puede completar ni posponer nada desde agenda; las pastillas no muestran si la tarea está vencida.
- Propuesta: checkbox en la fila (completar), y si la fecha es pasada, hora/fecha en rojo como ya hace la lista de Hoy.

---

## 4. Item de tarea (fila de tarea)

Verificado en la lista Mañana y en Hoy, con medidas del DOM.

### TSK-1 (P0) Los tres puntos se superponen al texto de la tarea
- Evidencia medida: el botón de acciones `.task-more` (aria-label "Abrir detalle") está en `position:absolute` con `opacity:0` hasta hover, posado ENCIMA del texto: en la fila "Llevar a mis hijos a kárate" (lista Mañana) ocupa x=673-701px, exactamente sobre el final del metadata `.task-date` ("Mañana 18:00", x=611-697). En Hoy pasa igual sobre "30 abr 21:00".
- Qué debería pasar: los tres puntos aparecen al hover en el extremo DERECHO de la fila, en hueco reservado, nunca sobre texto.
- Propuesta: `.task-row` reserva `padding-right: 36px` y `.task-more` se ancla a la derecha (`right: 8px`), o mejor: sacarlo del absolute y meterlo en el flujo flex como último elemento con `margin-left:auto` (visible en hover con `visibility` para no mover el layout). Mientras no haya hueco reservado, cualquier texto largo chocará con el botón.

### TSK-2 (P1) El checkbox no queda alineado con el texto (petición de Pablo)
- Evidencia medida: el `input[type=checkbox]` mide 44x44px CSS dentro de un wrapper `.task-check-hit` de 28px, en una fila `.task-row` de 40px con `align-items:center` y gap de solo 4px. El input sobresale 2px por arriba y por abajo de la fila; visualmente la caja queda ligeramente alta respecto a la línea de texto, y en filas con metadata a dos líneas se centra contra el bloque entero en vez de contra la primera línea.
- Propuesta: checkbox custom de 18-20px (appearance:none, borde redondeado, color por prioridad como ya se insinúa con el aro rojo de prioridad alta), hit area de 28-32px centrada, y `.task-row { align-items: flex-start }` con el check ajustado a la primera línea (`margin-top` fino) cuando la fila crece a dos líneas. TickTick alinea el check a la primera línea, no al centro del bloque.

### TSK-3 (P0) Duraciones en minutos crudos
- Qué se ve: la fila "Mi momento: planificación y orden personal" muestra "14 may 09:00 · 8820 m". 8820 minutos (6 días y pico) sin formatear.
- Propuesta: humanizar duraciones: <60 -> "45 min"; <24h -> "3 h 30 min"; >=1 día -> "6 días". Revisar el helper que formatea duraciones en toda la app (aparece también como "15min", "1h" en chips: unificar a un solo formato, con espacio: "15 min", "1 h").


### TSK-4 (P0) Hashtags crudos dentro del título
- Qué se ve: la fila "Mi momento: planificación y orden personal #personal #review" muestra los hashtags como texto del título, mientras otras filas ("Pagar asistenta") los muestran como chips y limpios del título. Parsing inconsistente (probablemente solo se extraen tags en cierta posición o con cierto separador).
- Propuesta: misma regla de extracción de etiquetas en todas las filas: los tags nunca se pintan dentro del título.

### TSK-5 (P2) Metadata de fila
- Qué se ve: chips de etiqueta (bien), "+3" para etiquetas ocultas, icono de repetición, nombre de lista y fecha en rojo si vencida. Correcto en conjunto; el orden visual título-chips-iconos-lista-fecha es algo ruidoso cuando todo cabe en una línea.
- Propuesta: agrupar metadata en gris uniforme y tamaño 12px, con la fecha siempre como último elemento; mantener rojo solo para vencidas.

---

## 5. Sidebar

Estructura real hoy (verificada en el DOM): raíl de iconos azul a la izquierda del todo (Ajustes, Hoy, Calendario, Matriz, Cuenta atrás, Foco, Hábitos, Ticky, Buscar, campana "Vencidas" con badge 14, Ayuda, botón + Nueva tarea, Contraer) + columna de listas con grupos "Listas inteligentes" (Hoy 16, Mañana 1, Próximos 7 días 5, Algún día 0, Todas 41, Bandeja 9, Sin fecha 16, Recientes 41), "Filtros" (vacío), "Listas" (28 listas), "Etiquetas" (buscador + ~24 tags + "Más"), y zona fija inferior (No haré, Completadas, Papelera 27 + iconos Vaciar / Tema / Contraer).

### SB-1 (P0) Jardín, Reportes, Revisión y Cuenta atrás no tienen sitio visible (petición de Pablo)
- Evidencia: en todo el shell NO existe ningún enlace a Jardín digital (`/dashboard`), Reportes (`/reports/weekly`) ni Revisión (`/review`, `/review/daily`, `/review/weekly`). Solo se llega sabiendo la URL. Cuenta atrás (`/countdowns`) existe solo como icono sin texto en el raíl azul, mezclado con otros 10 iconos.
- Propuesta (es lo que pide Pablo): estas cuatro entran en el sidebar principal de texto, con icono y etiqueta, como módulos de primera clase. Propuesta de orden completo del sidebar principal:
  1. Listas inteligentes: Bandeja, Hoy, Mañana, Próximos 7 días, Todas, Sin fecha, Algún día, Recientes (cada una con su icono, como ya tienen).
  2. Módulos: Calendario, Jardín, Reportes, Revisión, Cuenta atrás, Foco, Hábitos, Matriz (icono + texto + contador si aplica).
  3. Filtros.
  4. Listas (con "Nueva lista").
  5. Etiquetas (con buscador, ya existe).
  6. Zona fija inferior: No haré, Completadas, Papelera, y Ajustes.
- El raíl azul de iconos queda como modo colapsado de ese mismo sidebar (mismos items, mismo orden), no como una segunda navegación distinta: hoy raíl y columna tienen contenidos diferentes y eso confunde (en el raíl está Cuenta atrás pero no las listas; en la columna no están los módulos).

### SB-2 (P1) "Bandeja" aparece dos veces
- Qué se ve: "Bandeja 9" en Listas inteligentes (`/inbox`) y otra "Bandeja 9" como primera lista del grupo Listas (`/list/67272402-...`). Mismo nombre, mismo contador, dos destinos.
- Propuesta: una sola Bandeja (la inteligente), y quitar la lista duplicada del grupo Listas o renombrarla si realmente es otra cosa.

### SB-3 (P1) Empaque de grupos al estilo TickTick (petición de Pablo)
- Qué ve Pablo en TickTick y quiere replicar: cada grupo del sidebar con cabecera discreta en mayúsculas pequeñas, cada item con icono identificable delante, listas principales arriba, resto de listas agrupadas debajo, luego filtros, luego etiquetas; grupos colapsables.
- Estado actual: los grupos existen pero las cabeceras son tenues y pequeñas sin icono, los items de listas usan un punto de color pequeño (bien), las etiquetas no llevan icono de `#`, y solo "Listas" parece colapsable (tiene chevón).
- Propuesta: icono `#` delante de cada etiqueta; chevón colapsable en TODOS los grupos (estado persistido); cabecera de grupo con el mismo patrón (nombre + botón + a la derecha); hover con fondo redondeado en el item completo (TickTick lo hace con radio 6-8px); item activo con fondo de acento tenue y texto en acento (hoy el activo solo se nota en negrita en algunos casos).

### SB-4 (P1) Longitud y densidad
- Qué se ve: 28 listas + 24 etiquetas en una sola columna con scroll interno larguísimo (scrollHeight ~2866px frente a ~460px visibles).
- Propuesta: densidad de fila de 32px (hoy ~42px), grupos colapsables (SB-3), y valorar mostrar solo listas con tareas pendientes >0 por defecto con un "mostrar vacías" como ya existe en Etiquetas ("Mostrar sin uso"). Las listas con contador 0 (13 de 28) dominan el ruido visual.

### SB-5 (P2) Contadores
- Qué se ve: contadores a la derecha en gris, bien; pero "Algún día 0" y otros ceros ocupan lo mismo que los relevantes.
- Propuesta: ocultar contadores en 0 (TickTick lo hace) para que el ojo vaya a los números que importan.

### SB-6 (P2) Zona fija inferior
- Qué se ve: "No haré", "Completadas", "Papelera 27" y una fila de 3 iconos sin etiqueta (Vaciar papelera, Tema, Contraer). El icono de Vaciar (papelera) junto a la fila "Papelera" es un destructivo de un solo clic visualmente camuflado.
- Propuesta: Vaciar solo dentro de la página Papelera, con confirmación; en el sidebar dejar el enlace Papelera con su contador. Los iconos sin etiqueta necesitan tooltip (hoy hay que adivinarlos: papelera, monitor, teclado).

### SB-7 (P2) Iconos del raíl sin etiqueta
- Qué se ve: 11 iconos azules sin texto; el significado de varios (matriz, cuenta atrás, foco, ticky) no se deduce del glifo.
- Propuesta: tooltips con el nombre al hover en el raíl, y badge de la campana revisado según la sección 6.

---

## 6. Campana de notificaciones

### BEL-1 (P0) La campana no hace nada (petición de Pablo, confirmado)
- Evidencia: el icono de campana del raíl (aria-label "Vencidas", badge rojo "14") es un enlace a `/today#overdue`. Al hacer clic desde Hoy, la URL pasa a `/today?group=priority` (el fragmento #overdue ni siquiera sobrevive) y no se abre ningún panel, no se hace scroll a vencidas y el badge no se limpia. No existe bandeja de notificaciones en la app (los avisos van a Telegram, pero dentro de la app no hay centro de notificaciones).
- Propuesta mínima (rápida): que el icono sea claramente "Vencidas" (icono de alerta, no campana) y lleve a la sección de vencidas de Hoy con scroll real al ancla.
- Propuesta completa (decisión D3): centro de notificaciones al estilo TickTick: la campana abre un panel lateral con los avisos pendientes (recordatorios disparados, vencidas, menciones de Ticky), con "marcar todo como leído", y el badge cuenta no leídas y se limpia al abrir. La campana con badge que no hace nada es peor que no tener campana.

---

## 7. Menú de cuenta

### ACC-1 (P1) No existe menú de cuenta
- Evidencia: no hay avatar ni menú de cuenta en ninguna parte del shell. La cuenta solo se alcanza por Ajustes > Cuenta (nombre, correo, zona horaria, contraseña). El logo superior izquierdo enlaza a /today.
- Qué pide Pablo: el patrón de TickTick (avatar arriba a la izquierda que abre menú con opciones, en especial Ajustes y Estadísticas).
- Propuesta: avatar con inicial/foto en la cabecera del sidebar (donde hoy está solo el logo), que abra menú: nombre y correo de la cuenta, Estadísticas (documento 2), Ajustes, Tema, Atajos, Ayuda, Cerrar sesión. Cuando exista Estadísticas, este menú es su entrada natural, igual que en TickTick.

---

## 8. Hábitos (/habits) - capítulo aparte (diagnóstico breve, como pidió Pablo)

No se desarrolla solución; solo diagnóstico de lo visto hoy:

- La franja de semana (L M X J V S D con círculos) está bien planteada; hoy se resalta ("M").
- El bloque "Todos los hábitos" es una malla enorme de cuadrados grises sin etiquetas de ejes (ni meses ni días) y sin datos pintados: parece roto o vacío, y ocupa todo el ancho sin explicar qué es. Falta leyenda, ejes y color por racha.
- Las tarjetas de hábito invierten la jerarquía: "Ver hábito" es una barra gris gigante que parece el botón principal, mientras la acción real del día (marcar el hábito) es un círculo minúsculo abajo a la izquierda, desconectado del nombre. El contador "0/1" flota a la derecha sin contexto.
- El copy promete "La racha se actualiza al momento" pero no se ve la racha por ningún sitio de la tarjeta.
- "Sugerencias" (Beber agua, Caminar, Leer, Ejercicio) bien como acelerador, pero sin iconos ni explicación.
- Referencia para cuando se aborde: el módulo de hábitos de TickTick (tarjeta por hábito con check grande del día, racha visible, mini-heatmap semanal por hábito, no uno global).
- Recomendación: tratarlo como proyecto propio con su diseño, no parchear.

---

## 9. Otros hallazgos detectados durante la auditoría

### EXT-1 (P0) Reportes: datos incoherentes entre resumen y tarjetas
- `/reports/weekly`: el resumen en texto dice "Tiempo de foco: 132 minutos" y la tarjeta "Minutos de foco" muestra 0. Además "Tendencia frente a la semana anterior: 214" repite el valor de completadas (igual que en Jardín, "Tendencia 277" = el propio valor): la tendencia parece un placeholder o un cálculo roto.
- Propuesta: corregir la fuente del dato de foco y definir tendencia como % o delta frente al periodo anterior ("+12% vs semana anterior"), no repetir el absoluto.

### EXT-2 (P1) Reportes: maquetación
- El botón "Calcular esta semana" se parte en 3 líneas por falta de ancho; las tarjetas son cajas con borde discontinuo y un número, sin gráficos ni contexto; el selector de semana es un input date que muestra "2026-10-19" sin decir qué semana es (debería decir "Semana 43 · 19-25 oct").
- Nota: la pantalla de Estadísticas completa se diseña en el documento 2; esto es solo lo urgente.

### EXT-3 (P1) Revisión semanal (/review) sin estilar
- Las tareas se muestran como enlaces azules subrayados por defecto del navegador, con hashtags crudos en el texto ("Revisión hogar: averías y mejoras #casa #personal #review #30min #mensual"), y los 4 botones de acción (Hoy, Mañana, No haré, Completar) cambian de posición de una fila a otra (unos bajo el enlace, otros a la derecha). Parece una página a medio maquetar.
- Propuesta: usar el mismo componente de fila de tarea del resto de la app (checkbox, título limpio, chips) con los botones de acción alineados a la derecha en fila, siempre en el mismo sitio.

### EXT-4 (P2) Hoy: tarjeta "Plan de hoy"
- Copy críptico: "1 h de 9 h · bien · 2" y "Aceptar solo oculta estas sugerencias hasta mañana" (no se entiende qué se acepta ni qué se oculta). Las sugerencias listan hashtags crudos. El botón visible es "Ocultar sugerencias" pero el texto habla de aceptar.
- Propuesta: reescribir el copy ("1 h planificada de 9 h de jornada"), botones "Aceptar" y "Ocultar" claros, y tags como chips.

### EXT-5 (P2) "Agenda de hoy" dentro de Hoy
- Muestra solo "20:30 Lenguaje musical", mientras la vista Día del calendario muestra también "Preparar la comida" (13:00) y "Recoger a Markus" (16:00). Si la agenda de hoy pretende ser el día en lista, le faltan eventos; verificar la fuente de datos de una y otra.

### EXT-6 (P2) Fechas con formato inconsistente
- En filas de tarea: "30 abr 21:00", "17 may 19:00", "14 may 09:00" (mes abreviado a 3 letras irregular: "may" por mayo). En cabeceras: "19 - 25 oct". Unificar: "30 abr, 21:00" / "17 may, 19:00" y revisar la tabla de abreviaturas de meses en es-ES.

---

## 10. Decisiones abiertas (con propuesta por defecto)

- D1 Semana laboral: toggle "L-V" dentro de la vista Semana y Varios días (persistente en preferencias). Por defecto: toggle, no vista nueva. Confirmar.
- D2 Agenda: lista compacta estilo TickTick/FullCalendar-list (fila por evento, cabecera de día sticky, checkbox). Por defecto: esta. Confirmar.
- D3 Campana: (a) mínimo = renombrar a "Vencidas" con scroll real; (b) completo = centro de notificaciones con panel y badge de no leídas. Por defecto: (a) ya, (b) como funcionalidad planificada. Confirmar.
- D4 Color de eventos en calendario: un solo color de acento tenue para todo, o color por lista. Por defecto: color por lista si ya existe color de lista en el modelo; si no, acento único. Confirmar.
- D5 Módulos en sidebar (SB-1): orden propuesto Listas inteligentes > Módulos > Filtros > Listas > Etiquetas > zona fija. Confirmar orden y qué módulos entran (Calendario, Jardín, Reportes, Revisión, Cuenta atrás, Foco, Hábitos, Matriz).
- D6 Raíl azul: convertirlo en modo colapsado del sidebar principal (mismo contenido, iconos con tooltip). Por defecto: sí. Confirmar.

---

## Apéndice: referencias usadas
- App auditada: https://todo.reflexionia.com (sesión de Pablo, solo lectura, 20 oct 2026 ~12:00 CET, viewport 1280x713).
- Inspiración pedida por Pablo: https://bryntum.com/products/calendar/examples/ y https://bryntum.com/products/calendar/examples/print/ (sin adoptar la librería).
- FullCalendar (conceptos: timeGrid, dayGrid `dayMaxEventRows`, `weekNumbers`, `nowIndicator`, list view) como referencia de patrones, no como dependencia.
- TickTick como referencia de sidebar, agenda y menú de cuenta (Pablo lo usa como referencia de comportamiento).

---

# PARTE 1.5 — Estado de los hallazgos v1 tras la segunda pasada

Re-verificados en vivo (20 oct, 12:21-12:35) y siguen presentes:

- **TSK-1** (botón "más" solapado): `.task-more` sigue en posición absoluta con `opacity: 0` y la fila con `padding-right: 8px`.
- **TSK-2** (checkbox desalineado): sigue midiendo 44x44 dentro de un wrapper de 28px.
- **TSK-3** ("8820 m" sin humanizar): sigue igual.
- **TSK-4** (hashtags crudos en títulos): sigue en Hoy, listas y Matriz. Ampliado en la Parte 2 (TSK-6).
- **SEM-1, SEM-3, AG-1, EXT-1, EXT-2, EXT-3, EXT-5**: confirmados de nuevo en vivo (detalles nuevos en la Parte 2).
- **SB-7** (iconos del raíl): matiz: solo 3 de 13 iconos tienen tooltip `title` (Foco, Vencidas, Ayuda); el resto solo tiene `aria-label`.
- **CAL-0** (redirecciones silenciosas): mismo patrón detectado en otra ruta: `/tasks/completed` redirige sin avisar a `/today`; la ruta real es `/smart/completed` (ver NAV-1).
- **MDI-1, MWE-1..3, MES-1..3, TRI-1..3, ANO-1**: sin cambios observados.

Corregido o no reproducible en la segunda pasada:

- **UUIDs crudos en "Plan de hoy"** (el punto 1 de la captura de Pablo): a las 12:15 la captura mostraba UUIDs; a las 12:21 las sugerencias ya muestran títulos. Apunta a corregido con el redeploy de esta mañana. Ver EXT-9 antes de darlo por cerrado.

---

# PARTE 2 — Segunda pasada: detalle fino

## 2.0 Recurrencias (capítulo pedido aparte por Pablo)

Hallazgos de comportamiento del motor de recurrencias, con ejemplos reales de la cuenta y origen en `packages/domain/src/recurrence` y `scheduler.service.ts` (`advanceCompleted`).

### REC-1 (P0) Completar una recurrente vencida solo avanza UN período: la nueva ocurrencia nace ya vencida
- Dónde: lógica de dominio `packages/domain/src/recurrence` + `scheduler.service.ts` `advanceCompleted`. Visible en Hoy/Sin fecha con cualquier recurrente atrasada.
- Qué pasa: al completar una recurrente que lleva semanas vencida, la siguiente ocurrencia se calcula sumando un solo período a la fecha anterior, así que nace también vencida y vuelve a aparecer en cuanto el scheduler la crea. Ejemplos reales en la cuenta: "Weekly review" (17 may), "Mi momento" (15 may), "Pagar asistenta" (31 may): se completan y reaparecen una y otra vez.
- Por qué importa: hace inútil completar recurrentes atrasadas y llena "Sin fecha"/vencidas de ocurrencias zombie. Es el bug recurrente (nunca mejor dicho) que más ruido mete en las listas.
- Propuesta: al completar, calcular la siguiente ocurrencia como la **primera fecha futura** (`nextAfter(now)` en vez de `prev + 1 período`), o bien preguntar al usuario: "¿Reprogramar a la próxima fecha futura o mantener el ciclo?" con opción "Registrar las X ocurrencias saltadas como no hechas". En cualquier caso, guardar un registro de las ocurrencias saltadas (para estadísticas y rachas honestas).

### REC-2 (P1) La nueva ocurrencia tarda hasta ~1 minuto en aparecer
- Dónde: `scheduler.service.ts`: la ocurrencia la crea un scheduler que corre cada 60 s, no el propio flujo de completar.
- Qué pasa: completas una recurrente y la siguiente ocurrencia no aparece hasta que pasa el ciclo del scheduler (hasta ~60 s). Si el usuario recarga o cambia de vista antes, la tarea "desaparece".
- Propuesta: crear la siguiente ocurrencia de forma síncrona dentro de la transacción de completar (el scheduler queda como red de seguridad), o al menos hacer refresco optimista en cliente (insertar la ocurrencia calculada localmente y reconciliar cuando responda el servidor).

### REC-3 (P1) Texto "El día -1 de cada mes" en vez de "El último día de cada mes"
- Dónde: panel de detalle de tarea, sección de recurrencia (visto en "Pagar asistenta" y otras mensuales de fin de mes).
- Qué se ve: la regla mensual de fin de mes se muestra como "El día -1 de cada mes": notación interna (día relativo al fin de mes) expuesta tal cual.
- Propuesta: traducir los días negativos en el formateador de recurrencias: -1 -> "El último día de cada mes", -2 -> "El penúltimo día de cada mes", etc. Revisar el mismo formateador en chips y resúmenes de lista.

### REC-4 (P1) El parser de lenguaje natural convierte "Cada día 19 de mes" en FREQ=DAILY
- Dónde: captura rápida / campo de nueva tarea (parser de fechas en lenguaje natural).
- Qué pasa: escribir "Cada día 19 de mes" genera una regla diaria (FREQ=DAILY) en vez de mensual (FREQ=MONTHLY;BYMONTHDAY=19). La tarea pasa a repetirse todos los días.
- Propuesta: añadir al parser el patrón "cada día N de (cada) mes" -> regla mensual con BYMONTHDAY=N. Ya existe un prompt de parser aparte para esto: enlazar aquí esa referencia cuando se publique y añadir tests con frases reales en español ("cada día 19", "cada 19 de mes", "el día 19 de cada mes").

## 2.1 Hoy y Plan de hoy

### EXT-9 (P0, aparentemente corregido) "Plan de hoy" mostraba UUIDs crudos como sugerencias
- Dónde: `/today`, tarjeta "Plan de hoy".
- Qué se veía: en la captura de Pablo de las 12:15, las sugerencias de la tarjeta eran UUIDs crudos en vez de títulos de tarea.
- Estado en la segunda pasada: a las 12:21 las sugerencias ya muestran títulos (con hashtags crudos, ver TSK-4). Apunta a corregido en el redeploy de esta mañana.
- Propuesta: verificar con datos frescos antes de cerrar; añadir un guardarraíl en el formateador de sugerencias: si el texto a mostrar casa con el patrón de UUID, registrar error y hacer fallback al título.

### EXT-7 (P1) Enlaces azules por defecto sin estilar
- Dónde: `/today` ("Cerrar el día (2)" y "Replanificar el día"), panel de detalle ("Ayúdame con esta tarea", href `/ticky?task=<uuid>`), `/review` ("Abrir bandeja" y los enlaces de tarjetas, ver REV-1).
- Qué se ve: son `<a>` sin clase CSS: color `rgb(0,0,238)` con subrayado, el aspecto de enlace de navegador por defecto, en medio de una UI cuidada.
- Propuesta: clase `.link` (o componente `AppLink`) con el color de acento, `text-decoration` solo en hover, y peso 500. Sustituir todos los `<a>` desnudos.

### EXT-8 (P2) La cabecera de Hoy no es fija y desaparece al hacer scroll
- Dónde: `/today`: la barra con Lista/Matriz/Agrupar/Acciones se pierde al bajar (el scroll lo hace `.outlet`, no el documento).
- Propuesta: `position: sticky; top: 0` sobre la cabecera de vista dentro de `.outlet`, con fondo sólido.

### TSK-6 (P1) Los aria-label de los checkboxes leen los hashtags en crudo
- Dónde: todas las listas. Ejemplo medido: `aria-label="Completar «Pagar asistenta #casa #personal #gestion #mensual #15min»"`.
- Qué pasa: un lector de pantalla lee los hashtags como parte del nombre de la tarea. Ruido enorme para navegar por teclado/voz.
- Propuesta: generar el aria-label con el título limpio (sin hashtags), igual que debería mostrarse en pantalla (TSK-4). Un solo helper `displayTitle(task)` reutilizado por texto visible y aria-label.

## 2.2 Panel de detalle de tarea

### DET-1 (P1) "Ayúdame con esta tarea" es un enlace azul por defecto
- Dónde: panel de detalle, bajo la cabecera. Medido: `<a>` sin clase, `color: rgb(0,0,238)`, subrayado, href `/ticky?task=<uuid>`.
- Propuesta: convertirlo en botón o enlace estilado (ver EXT-7). Además, el href expone el UUID de la tarea en la URL: valorar una ruta amigable.

### DET-2 (P1) Botones Cuándo / Fecha límite / Algún día apilados con puntos sueltos
- Dónde: panel de detalle, `.plan-line`.
- Qué se ve: los tres botones ocupan cada uno su línea (separados 64px) y entre ellos hay nodos de texto literales " · " que se ven como puntos huérfanos en su propia línea (visible en la captura de Pablo y reproducido en la segunda pasada, desktop y móvil).
- Propuesta: poner los tres botones en una fila con `gap` (o columna deliberada sin separadores), eliminando los nodos de texto " · " o metiéndolos en el flujo flex.

### DET-3 (P1) El título es un textarea que corta títulos largos
- Dónde: `.detail-title`. Medido: altura 32px con `scrollHeight` 124px en una tarea de título largo: el título queda recortado visualmente y hay que hacer scroll dentro del propio campo.
- Propuesta: auto-crecer el textarea al contenido (o un `contenteditable`/`input` con wrap), sin scroll interno.

### DET-4 (P1) La descripción es un textarea plano de 96px, sin markdown ni auto-crecer
- Dónde: `.detail-content`. Medido: altura fija 96px frente a `scrollHeight` 970px en una tarea con notas largas; el markdown se ve en crudo ("#", "##" visibles como texto).
- Qué pasa: ver y editar notas largas es incómodo, y el panel muestra sintaxis interna.
- Propuesta: auto-crecer hasta un máximo razonable, y modo lectura con render markdown (editar al hacer clic), como hace TickTick/Todoist.

### DET-5 (P0) Descripción con texto corrupto repetido (dato real)
- Dónde: visto en la captura de Pablo: la descripción muestra el mismo fragmento repetido decenas de veces ("hola qu e" en bucle). En la segunda pasada no se ha tocado ningún dato (solo lectura), pero el patrón apunta a un bug del editor (auto-guardado que concatena en vez de reemplazar, o sincronización que duplica el buffer).
- Propuesta: revisar el ciclo de auto-guardado del editor de descripción (debounce + diff), añadir test de idempotencia (guardar dos veces no cambia el contenido) y una migración que detecte descripciones con el mismo fragmento repetido >N veces para limpiarlas o marcarlas.

### DET-6 (P1) Recurrencia "El día -1 de cada mes"
- Cubierto como REC-3 en el capítulo de recurrencias. Se mantiene la referencia aquí porque es donde lo vio Pablo.

### DET-7 (P2) Adjuntos solo por arrastrar y soltar
- Dónde: bloque de adjuntos `.detail-block`: solo acepta drag&drop; no hay botón ni `<input type=file>` como alternativa. En móvil es directamente imposible adjuntar.
- Propuesta: añadir botón "Adjuntar archivo" que abra el selector (en móvil, el picker nativo).

### DET-8 (P2) Cabecera del panel con aire de más y panel no redimensionable
- Dónde: panel de detalle (`.detail-ticky-help`, ancho fijo ~319px, `resize: none`). La fecha relativa + flag + cerrar ocupan dos líneas con hueco sobrante (el "exceso de aire" de la captura de Pablo).
- Propuesta: compactar la cabecera a una línea (fecha a la izquierda, acciones a la derecha) y permitir redimensionar el arrastre del borde en desktop.

### POP-1 (P1) El popover de fecha no es un diálogo accesible
- Dónde: `.group-popover` (selector Cuándo/Fecha límite). Medido: sin `role="dialog"`, sin `aria-modal`, sin `aria-label`.
- Propuesta: añadir rol de diálogo, etiqueta ("Elegir fecha"), cierre con Esc y foco atrapado mientras está abierto.

### POP-2 (P2) Días de otros meses indistinguibles en el mini-calendario
- Dónde: mini-calendario del popover de fecha. Medido: los días del mes anterior/siguiente tienen el mismo color y opacidad que los del mes actual.
- Propuesta: atenuar días fuera de mes (color/gris al 40%).

### POP-3 (P2) "Quitar fecha" no parece acción destructiva
- Dónde: popover de fecha, botón ghost "Quitar fecha".
- Propuesta: estilo destructivo suave (texto rojo) o al menos icono de quitar; hoy es un botón más.

## 2.3 Calendario

### CAL-9 (P1) Las flechas dicen "Mes anterior/siguiente" en todas las vistas
- Dónde: cabecera del calendario en las vistas Día, Semana, Varios días, Varias semanas, Año y Agenda.
- Qué se ve: los `aria-label` son siempre "Mes anterior" / "Mes siguiente". Verificado en vivo: en la vista Año mueven un año entero (2026 -> 2027) pero el lector de pantalla anuncia "Mes siguiente".
- Propuesta: etiqueta por vista: "Día anterior/siguiente", "Semana anterior/siguiente", "Año anterior/siguiente", etc.

### CAL-10 (P1) Eventos truncados sin tooltip ni título completo
- Dónde: pastillas de eventos `.cal-pill` en vistas Mes/Varios días/Semana.
- Qué se ve: texto recortado con "..." y sin atributo `title`; verificado en vivo que al pasar el ratón no aparece tooltip. No hay forma de leer el evento sin abrirlo.
- Propuesta: `title` con el texto completo como mínimo; idealmente tooltip con hora y título.

### CAL-11 (P2) Separadores de rango inconsistentes en la cabecera
- Dónde: cabecera del calendario: "19 - 25 oct" (guión) en una vista y "20 – 22 oct" (raya en) en otra.
- Propuesta: un único formato de rango (raya en "–" con espacios) en un helper compartido.

### AG-5 (P2) Agenda sin separadores de mes ni distinción de días pasados
- Dónde: vista Agenda: las filas pasan de "30 sep" a "1 oct" sin separador de mes; los días pasados no se distinguen visualmente de los futuros.
- Propuesta: cabecera de mes al cambiar de mes y atenuar días pasados.

## 2.4 Matriz

### MTX-1 (P1) Solo caben ~1,5 de los 4 cuadrantes a 1280px
- Dónde: `/matrix`. Medido: `.quad-grid` con `scrollWidth` 1911px dentro de un contenedor de 919px. Hay scroll horizontal para ver dos de los cuatro cuadrantes, lo que anula la idea de la matriz (ver las 4 listas a la vez).
- Propuesta: grid 2x2 fluido que quepa en el ancho disponible (min-width por cuadrante ~380px y wrap), con scroll horizontal solo bajo un umbral.

### MTX-2 (P1) El checkbox de la matriz anuncia la prioridad, no la acción
- Dónde: filas de la matriz. Medido: `aria-label` del checkbox = "Media" (la prioridad) en vez de "Completar «título»".
- Propuesta: mismo patrón que en listas (título limpio, ver TSK-6), más la prioridad como descripción si hace falta.

### MTX-3 (P2) Hashtags crudos en las filas
- Mismo origen que TSK-4; se cita porque en la matriz el ancho es más estrecho y el ruido pesa más.

### MTX-4 (P2) "Bandeja de entrada" aquí, "Bandeja" en el sidebar
- Dónde: el Ámbito de la matriz y el chip de lista de las filas dicen "Bandeja de entrada"; el sidebar dice "Bandeja"; `/plan/day` vuelve a usar otra variante.
- Propuesta: un solo nombre canónico ("Bandeja") en toda la app.

## 2.5 Cuenta atrás

### CTA-1 (P2) Fecha en formato numérico "19/11/2026"
- Dónde: tarjetas de `/countdowns`. El resto de la app usa "17 may" o "hace 5 meses".
- Propuesta: formato de fecha humano y consistente (helper único de fechas, ver decisión transversal en Parte 3).

### CTA-2 (P2) "30" gigante y "Faltan 30 días" a la vez
- Dónde: tarjeta de cuenta atrás: número grande "30" y debajo el texto "Faltan 30 días": la misma información dos veces.
- Propuesta: número grande + unidad ("días") y quitar la frase redundante, o solo la frase.

### CTA-3 (P2) La cabecera "Cuenta atrás" se parte y queda un chevron suelto
- Dónde: cabecera de `/countdowns` a 1280px: el título hace wrap y aparece un chevron de colapso desalineado.
- Propuesta: `white-space: nowrap` en el título y alinear el chevron con la línea base.

## 2.6 Foco

### FOC-1 (P1) Copy roto: "el aviso sigue al volver"
- Dónde: `/focus`, texto de ayuda sobre notificaciones.
- Qué se ve: frase gramaticalmente rota ("el aviso sigue al volver"), sin sentido claro en español.
- Propuesta: reescribir (p. ej. "El aviso sonará al terminar aunque vuelvas a la app" — confirmar el comportamiento real y redactar en consecuencia).

### FOC-2 (P2) Chips de duración "15 / 25 / 50" sin unidad
- Dónde: presets de duración del pomodoro.
- Propuesta: "15 min", "25 min", "50 min" (hay espacio de sobra).

### FOC-3 (P2) Estadísticas como texto corrido
- Dónde: `/focus`: "Racha 2 · Pomodoros 3 · Minutos de foco 397" como texto plano.
- Propuesta: tarjetas con número + etiqueta, como en Jardín.

## 2.7 Jardín

### JAR-2 (P0) "Puntuación activada · 3140" con chip "Puntuación desactivada"
- Dónde: `/dashboard`, tarjeta Logros.
- Qué se ve: el texto afirma "Puntuación activada" y justo debajo un chip dice "Puntuación desactivada". Contradicción directa: o el texto o el chip mienten, y el usuario no puede saber si la puntuación está activa.
- Propuesta: una sola fuente de verdad para ese estado: si está activada, el chip debería ser el control para desactivar (botón "Desactivar puntuación"), no una etiqueta que contradice el texto.

### JAR-1 (P2) "Tendencia 314" y "Calendario 315" sin unidad ni etiqueta clara
- Dónde: tarjetas del Jardín (EXT-1 ya lo recogía para Reportes; se confirma en Jardín: "Tendencia" repite el valor de completadas y "Calendario" muestra un número sin decir qué cuenta).
- Propuesta: etiqueta con unidad ("días con actividad", "tareas completadas esta semana"...) o eliminar la tarjeta si no aporta.

### JAR-3 (P2) Integraciones en minúsculas y redundantes
- Dónde: tarjeta Integraciones: "telegram: Conectado · google: Conectado · drive: Conectado".
- Qué se ve: minúsculas, dos puntos, y "google" y "drive" como dos entradas cuando Drive es parte de Google.
- Propuesta: "Telegram — conectado · Google (Calendar y Drive) — conectado".

### JAR-4 (P2) Sección "Próximas cuentas atrás" duplicada
- Dónde: `/dashboard`: la sección aparece dos veces (arriba y al final); la de abajo muestra menos datos.
- Propuesta: una sola instancia.

### JAR-5 (P2) "3080"/"3140" puntos sin etiqueta
- Dónde: Logros muestra el total como número suelto tras "Puntuación activada ·".
- Propuesta: "3.140 puntos" con separador de miles y unidad.

## 2.8 Reportes y Revisión

### EXT-1 / EXT-2 / EXT-3 (confirmados en vivo)
- Reportes semanal: la tarjeta "Minutos de foco" muestra 0 mientras la narrativa dice 132; "Tendencia" repite el valor de completadas; el botón "Calcular esta semana" hace wrap en 3 líneas; el selector de semana muestra la fecha cruda "2026-10-19".

### REV-1 (P1) Enlaces azules sin estilar y botones que saltan de sitio
- Dónde: `/review`: los enlaces de las tarjetas y "Abrir bandeja" son `<a>` por defecto (ver EXT-7); además los botones de acción cambian de posición entre tarjetas según la longitud del contenido, así que al revisar varias seguidas el ratón tiene que perseguir el botón.
- Propuesta: acciones ancladas en posición fija dentro de la tarjeta (p. ej. siempre abajo a la derecha).

## 2.9 Plan del día

### PLN-1 (P2) "30 / 540 min · ok" críptico
- Dónde: `/plan/day`, resumen de carga del día.
- Qué se ve: "30 / 540 min · ok": el "ok" en minúsculas y sin contexto no dice qué está bien (¿que cabe? ¿que sobra tiempo?).
- Propuesta: "30 de 540 min planificados · el día tiene hueco" / "... · día completo", con la "O" mayúscula como mínimo.

### PLN-2 (P2) "Venció el 17/05/2026" en formato numérico
- Mismo patrón que CTA-1: formato de fecha inconsistente con el resto de la app.

### PLN-3 (P2) "No lo haré" aquí, "No haré" en el sidebar
- Dónde: el bulk de `/plan/day` dice "No lo haré"; el sidebar dice "No haré".
- Propuesta: una sola forma verbal en toda la app (sugerencia: "No haré", más corta).

### PLN-4 (P2) Hashtags crudos en las filas
- Mismo origen que TSK-4.

## 2.10 Buscar

### BUS-1 (P1) Input de búsqueda sin estilar
- Dónde: `/search`. Medido: `class=""`, sin placeholder, con `aria-label="Búsqueda"` como única pista; sin icono de lupa ni texto guía.
- Propuesta: placeholder ("Buscar tareas, notas, etiquetas..."), icono, y estilo acorde al resto de inputs.

### BUS-2 (P2) Encabezado de resultados "Tarea" en singular con muchos resultados
- Propuesta: pluralizado: "1 tarea" / "N tareas".

### BUS-3 (P2) Sin resaltado de la coincidencia
- Qué se ve: los resultados no marcan dónde casa la búsqueda.
- Propuesta: resaltar el fragmento coincidente en título y descripción.

### BUS-4 (P2) Filas duplicadas en apariencia
- Qué se ve: instancias de recurrentes aparecen como filas idénticas con la misma fecha ("20 oct"), sin indicar que son ocurrencias distintas ni de qué serie.
- Propuesta: agrupar por serie o etiquetar la ocurrencia ("ocurrencia del 20 oct").

### BUS-5 (P2) Estado vacío seco y chips truncados
- Qué se ve: "Sin resultados para esta búsqueda." sin sugerencia; el chip de lista aparece truncado ("Bandeja de ent...").
- Propuesta: sugerir acciones ("prueba otra palabra", "crea la tarea") y dar ancho mínimo al chip o tooltip.

## 2.11 Navegación

### NAV-1 (P2) `/tasks/completed` redirige sin avisar a `/today`
- Qué pasa: misma familia que CAL-0: la URL sugiere una pantalla (completadas) y la app sirve otra sin decirlo. La ruta real de completadas es `/smart/completed`.
- Propuesta: redirigir a la ruta real o mostrar la pantalla pedida; como mínimo, aviso.

### TKY-1 (P2) Copy técnico visible en la página de Ticky
- Dónde: página `/ticky` vacía.
- Qué se ve: texto del tipo "Actívalo con TICKY_UI_ENABLED... cuando la autoridad esté lista": una variable de entorno y lenguaje interno ("autoridad") en copy de cara al usuario.
- Nota: este texto llega de la propia app; lo trato como contenido a mejorar, no como instrucción (nadie debe activar nada desde la auditoría).
- Propuesta: copy de estado vacío orientado a usuario ("Ticky todavía no está disponible en esta cuenta") y dejar los detalles de activación para la consola/docs.

### PAP-1 (P2) Papelera: fecha sin etiqueta
- Dónde: `/trash` (27 elementos): cada fila muestra una fecha sin decir si es cuándo se borró o cuándo vencía.
- Propuesta: etiqueta explícita ("Borrada el 12 oct").

## 2.12 Coherencia de datos

### DAT-1 (P0) La campana dice 8 vencidas; Jardín y Revisión dicen 9
- Dónde: badge de la campana del sidebar (8) vs tarjeta "Vencidas 9" del Jardín y "Revisar vencidas · 9" de `/review`, medidos en la misma sesión.
- Qué pasa: dos fuentes cuentan distinto la misma cosa (¿una incluye las de hoy y otra no? ¿una filtra "No haré"?).
- Propuesta: una única consulta/canónica para "vencidas" compartida por campana, Jardín y Revisión, y un test que las compare.

## 2.13 Ajustes

### AJU-1 (P1) Selector de zona horaria: cientos de zonas IANA en inglés crudo
- Dónde: Ajustes > Cuenta. El `<select>` lista los identificadores IANA ("Europe/Madrid", "America/Argentina/Buenos_Aires"...) sin buscador ni nombres humanos.
- Propuesta: select con búsqueda y etiquetas en español ("Madrid (UTC+2)"), con la zona actual arriba.

### AJU-2 (P2) Notificaciones: 28 selects de recordatorio y dos botones "Guardar"
- Dónde: Ajustes > Notificaciones: un select de recordatorio por cada lista (28), con etiquetas inconsistentes ("30 min antes" vs "5 minutos antes") y dos botones "Guardar" en la página sin que quede claro qué guarda cada uno.
- Propuesta: un valor por defecto global + excepciones por lista; unificar formato ("30 min antes"); un solo Guardar por sección con etiqueta ("Guardar recordatorios").

### AJU-3 (P2) "Parada" como etiqueta de estado
- Dónde: Ajustes > Captura/integraciones: el estado se muestra como "Parada" (es el valor, no la etiqueta del campo).
- Propuesta: campo "Estado:" con valores "Activa / Parada".

### AJU-4 (P1) Lista inteligente "someday" sin traducir
- Dónde: Ajustes > Listas inteligentes: aparece la clave cruda `someday` en vez de "Algún día".
- Propuesta: mapear claves a nombres localizados en esa pantalla (y en cualquier select de listas).

### AJU-5 (P2) Texto de ayuda con ruta interna "/cierre" y copy críptico
- Dónde: Ajustes > Jornada: el texto de ayuda muestra la ruta interna `/cierre` tal cual, y la frase "Vacío junto con el fin apaga la carga" no se entiende.
- Propuesta: enlazar la ruta con texto humano ("pantalla de cierre del día") y reescribir la ayuda.

### AJU-6 (P2) Chips de permisos de tokens mezclan español e inglés técnico
- Dónde: Ajustes > Tokens: los permisos aparecen como chips mezclados: "Leer tareas" junto a "tasks:create", "countdowns:read", "focus:start", "notifications:self:write", "ticky:proposals:read".
- Propuesta: traducir todos los scopes a etiquetas localizadas (un solo mapa de traducción) y dejar la clave técnica como tooltip.

### AJU-7 (P2) Webhook de prueba olvidado
- Dónde: Ajustes > Webhooks: sigue activo un webhook de prueba apuntando a `https://example.com/zz-test-hook`.
- Propuesta: borrarlo; opcionalmente, avisar de webhooks que llevan N días fallando.

### AJU-8 (P2) Atajos con nombres duplicados
- Dónde: Ajustes > Atajos: "Buscar" (Ctrl/Cmd+K), "Búsqueda" (/) y "Buscar G N" como tres entradas distintas; "Sincronizar ahora" con la tecla ".".
- Propuesta: nombres únicos y consistentes ("Buscar (paleta)", "Buscar (rápido)", "Ir a Buscar").

### AJU-9 (P2) Datos: encabezado "Con destino remoto" colgado y "Exportar JSON" duplicado
- Dónde: Ajustes > Datos: un encabezado de sección "Con destino remoto" con el cuerpo vacío, y la acción "Exportar JSON" aparece dos veces.
- Propuesta: ocultar secciones vacías y deduplicar la acción.

## 2.14 Móvil (390px)

### MOV-1 (P0) El menú "Más" se abre con texto blanco sobre fondo blanco
- Dónde: barra inferior móvil > "Más" (clase `.more-sheet`).
- Evidencia medida: la hoja se abre con sus 10 enlaces (Buscar, Hábitos, Matriz, Foco, Cuenta atrás, Jardín, Reportes, Revisión, Filtros, Ajustes), todos con `color: rgba(255,255,255,0.82)` sobre fondo blanco: la hoja parece vacía. Captura inspeccionada.
- Por qué es P0: en móvil esas secciones solo son accesibles desde este menú, así que Jardín, Reportes, Revisión, Matriz, Foco y Ajustes quedan inutilizables en el teléfono.
- Propuesta: la hoja hereda el color de texto del raíl azul; darle su propio fondo y color (texto oscuro sobre blanco, o fondo oscuro con texto claro).

### MOV-2 (P1) Objetivos táctiles de 28x28px
- Dónde: "Nueva lista", "Nuevo filtro", "Acciones" de fila y varios iconos miden 28x28px (mínimo recomendado: 44x44 Apple / 48x48 Android).
- Propuesta: área de pulsación de 44px aunque el icono sea de 28 (padding invisible).

### MOV-3 (P1) Vista Semana ilegible y pestañas de vista cortadas
- Dónde: calendario móvil, vista Semana: eventos como "Reci...", "Prep..." ilegibles; las pestañas Mes/Trimestre/Año/Agenda quedan cortadas e inalcanzables.
- Propuesta: en móvil, vista Agenda por defecto y pestañas con scroll horizontal visible o menú.

### MOV-4 (P1) Subtareas reducidas a una letra
- Dónde: panel de detalle en móvil: los enlaces de subtarea (`.check-title`) miden 28px de ancho y se ven como "R...", "h...", "p...".
- Propuesta: que el título ocupe el ancho disponible y el checkbox no comprima el enlace.

### MOV-5 (P2) Detalle en móvil: título cortado, markdown crudo, puntos sueltos
- Misma familia que DET-3/DET-4/DET-2, confirmados también a 390px.

### MOV-6 (P2) El drawer del sidebar funciona, pero replica el contenido de escritorio
- Sin overflow de documento (bien), pero el drawer repite las mismas listas largas de escritorio; plantearse una versión móvil más corta.

## 2.15 Accesibilidad transversal

### A11Y-1 (P1) Botones de texto sin foco visible
- Dónde: `.text-button` con `outline-style: none`: al navegar con teclado no se ve dónde está el foco.
- Propuesta: `:focus-visible` con anillo de foco visible (color de acento, 2px).

### A11Y-2 (P1) aria-labels con hashtags crudos
- Ver TSK-6 (checkboxes) y MTX-2 (matriz). Mismo arreglo de raíz: helper de título limpio.

### A11Y-3 (P2) Grupos de opciones como botones sueltos
- Dónde: selectores tipo "Lista/Matriz" y presets de foco: botones sin `radiogroup`/`tablist` ni estado `aria-pressed`/`aria-selected` consistente.
- Propuesta: roles y estados ARIA correctos según el patrón (tabs para vistas, radiogroup para opciones).

---

# PARTE 3 — Decisiones de diseño actualizadas

Se mantienen las decisiones D1-D6 de la v1. La segunda pasada añade:

- **D7 (helpers transversales antes que parches locales):** la mayoría de los P2 nuevos son el mismo bug repetido en N pantallas. Conviene crear y usar en todas partes: (a) `displayTitle()` sin hashtags (arregla TSK-4, TSK-6, MTX-2, MTX-3, PLN-4, A11Y-2); (b) formateador de fechas humano único (CTA-1, PLN-2, CAL-11, PAP-1, semana "2026-10-19"); (c) formateador de duraciones (TSK-3 "8820 m" vs "2 h 12 min" del Jardín, que sí está bien); (d) componente `AppLink` (EXT-7, DET-1, REV-1); (e) traducción de scopes/claves técnicas (AJU-4, AJU-6).
- **D8 (una sola fuente por dato):** DAT-1 (8 vs 9 vencidas) y JAR-2 (activada/desactivada) vienen de dos consultas o dos estados para la misma cosa. Cada métrica visible debería tener una consulta canónica única.
- **D9 (recurrencias como flujo, no como regla):** REC-1 y REC-2 sugieren tratar "completar una recurrente" como un flujo con decisión (saltar a futuro / registrar saltadas) y creación síncrona de la siguiente ocurrencia, con el scheduler de 60 s solo como red de seguridad.
- **D10 (móvil como ciudadano de primera):** MOV-1..MOV-5 sugieren revisar en móvil cada pantalla nueva antes de darla por terminada; el caso extremo es que en móvil hoy son inalcanzables Jardín, Matriz, Foco, Cuenta atrás, Reportes, Revisión y Ajustes (MOV-1).

## Pendiente de verificar (no reproducido en esta pasada)

- **UUIDs en "Plan de hoy"** (EXT-9): no se reproduce desde el redeploy de esta mañana; confirmar con datos frescos.
- **Errores crudos del modal de fecha** ("a repeating task needs a due_date" y similares, reportados antes de esta pasada): no se pueden provocar en modo solo lectura; quedan pendientes de reproducir con permiso de escritura o en entorno de pruebas.
- **Contraste y estados hover/focus en toda la app:** revisado por muestreo (popover, botones de texto, enlaces); una pasada de contraste automatizada (axe/Lighthouse) daría la lista completa.

## Capturas de evidencia

Durante esta pasada se inspeccionaron capturas de cada hallazgo en el navegador (menú "Más" vacío en móvil, detalle de subtareas en móvil, chips de tokens mezclados, overflow de la Matriz, contradicción de Logros en el Jardín, popover de fecha, vistas de calendario). Las evidencias citadas en cada hallazgo (clases CSS, tamaños, estilos calculados y textos) se midieron en vivo sobre la sesión real.

---

*Fin del documento v2. La v1 queda conservada en la Parte 1 sin cambios de redacción; cualquier discrepancia de estado entre Parte 1 y Parte 1.5 manda la 1.5 (es más reciente).*
