# Planifica tu día: versión simplificada (boceto)

El objetivo es planificar bien el día con poca información y sin estrés. Datos inventados. Ruta del boceto: `/plan/mock?simple=d1|d2|d3|m1..m4` en `/tmp/ttd-render`.

## Archivos

- `01_escritorio.png`: la pantalla principal. Representa casi todo el flujo.
- `02_escritorio-extra.png`: arrastre a la agenda de mañana. Enseña el carrusel de días y el arrastre.
- `02b_escritorio-resumen.png`: resumen final.
- `03_movil.png`: 4 pantallas de móvil (tarjeta, «Otro día», deshacer/volver y resumen).
- `raw/`: capturas sin pie.

## Decisiones

1. **Acciones mínimas.** Tres principales: Hoy (H), Mañana (M) y Otro día (O). Dos de cierre, más discretas: Hecha (C) y No lo haré (N). «Algún día» y «Eliminar» van en el menú «…».
2. **No hay acción «Bloque horario».** La hora se resuelve con la duración y una hora opcional («Sin hora ▾»), o arrastrando la tarea a la agenda.
3. **Tiempo.** Una fila de chips pequeños (15 · 30 · 45 · 1 h · Otra), con 30 min marcado por defecto. Sin texto ni amarillo. Si la tarea ya tiene duración, se marca la suya.
4. **Sidebar derecho.** Arriba, un carrusel de días (‹ Hoy · Mañana · Mié · Jue · Vie ›) que se desplaza a la derecha. Cada día lleva una barra fina de color (verde, ámbar o rojo), sin porcentajes. Debajo, la agenda del día elegido. Una sola frase de estado: «Va justo · 50 min libres».
5. **Tarea con aire.** Fecha vencida en rojo, lista, prioridad, recurrencia, etiquetas, descripción entera renderizada y adjuntos. Sin chips de estado repetidos.
6. **Cola simple.** Una lista sin secciones. Las decididas llevan ✓ y su destino. Las vencidas, un punto rojo.
7. **Atajos pegados al footer**, en gris y en una sola línea. La pista de arrastre va también ahí (⠿).
8. **Móvil.** Una tarea por pantalla, con la siguiente asomando y la anterior asomando tras decidir. Arriba: X, contador «3 / 12», «‹ Anterior» y Deshacer. Abajo, barra fija con Hecha · Hoy · Mañana · Otro día · No lo haré. Se puede volver atrás, a diferencia de TickTick.
9. **Duración en móvil.** No va en la tarjeta: solo se ve «30 min» como dato. Se elige en la hoja «Otro día» (día, hora opcional, duración) o tocando ese dato. «Hoy» decide al momento con la duración que haya.
10. **Resumen.** Hoy en orden, con hora si la tiene. «Para otros días» va agrupado. El texto deja claro que no se cambia nada hasta confirmar.

## Qué quito respecto a ttd-real

- La zona azul «Por qué te sugerimos…» y la acción marcada como sugerida.
- La zona amarilla «¿Cuánto te llevará?», su texto y el chip «Sin duración».
- Los porcentajes por día, la tarjeta de capacidad roja, «Te sobran X», la franja de día sobrecargado y las líneas de efecto o previsualización.
- Los grupos «Hacerla / Moverla / Cerrarla» con 8 botones y la doble tecla (letra o número).
- Las secciones de la cola, los días de retraso por fila y el «≈ N min».
- La pantalla de entrada con 3 pasos y fuentes: se entra directamente a la primera tarea. Las fuentes irían en «…» o en ajustes.
- Los estados de error y vacío como pantallas propias. Se mantienen en producción, pero no hace falta enseñarlos aquí.

## Qué no reduzco, y por qué

- **La agenda del día** sigue visible en escritorio. Es lo que da sensación de control y es el destino del arrastre.
- **Deshacer** sigue en la cabecera y con Ctrl+Z. Es lo que permite decidir rápido sin miedo.
- **La barra fina de color por día.** Es la única señal de carga que queda. Sin ella, «Otro día» se elige a ciegas.

## Autocrítica

- **Sin hora, sin aviso.** Con «Sin hora: 5 tareas» al pie de la agenda, alguien puede no darse cuenta de que el día va justo. La barra ámbar y «50 min libres» son la única alarma, y quizá se queda corta.
- **«Sin hora ▾»** no deja claro a simple vista que es un selector de hora.
- **La cola trunca los títulos largos.** Es aceptable, porque la tarjeta muestra el título completo.
- **Hecha y No lo haré** quedan en segunda línea a 1280 px. Lo busco a propósito, para que pesen menos, pero quedan algo lejos.
- **En móvil, 5 acciones abajo** obligan a etiquetas pequeñas (11 px). «Otro día» abre una hoja, así que hay un toque más que en TickTick.
- **Descripción larga en móvil.** Se corta con un degradado. Haría falta tocar la tarjeta para leerla entera (no se enseña).
- **Carrusel de 5 días.** A 19 rem entran 5 días. El fin de semana queda tras la flecha y en gris si no hay jornada.
