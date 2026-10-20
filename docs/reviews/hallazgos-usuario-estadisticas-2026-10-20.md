# Hallazgos UI/UX — página Estadísticas (tick-tack-done)

**Fecha:** 2026-10-20
**Fuente:** revisión visual de 9 capturas de la página Estadísticas (periodos Hoy, Semana, Mes, Año; secciones Resumen, Tareas, Foco, Hábitos).
**Instrucciones para el agente (Codex):** añade cada hallazgo como un item de tu lista de tareas pendientes. Cada item indica dónde ocurre, qué se observa, qué se espera, su severidad y un criterio de aceptación verificable. Respeta las severidades al ordenar el trabajo (P0 primero).

Severidades: **P0** = bug funcional o dato incorrecto. **P1** = problema serio de usabilidad o legibilidad del dato. **P2** = inconsistencia o caso límite mal resuelto. **P3** = detalle menor de texto/estilo.

---

## F-01 · Filtros de Lista y Etiqueta piden pegar un UUID

- **Dónde:** barra de filtros de Estadísticas, campos "Lista (id)" y "Etiqueta (id)".
- **Observado:** son cajas de texto libres donde el usuario debe escribir o pegar el identificador interno (UUID) de la lista o etiqueta.
- **Esperado:** desplegables (select/autocompletado) que muestren los nombres de las listas y etiquetas del usuario y envíen el id correspondiente.
- **Severidad:** P1
- **Criterio de aceptación:** el usuario puede filtrar eligiendo por nombre sin conocer ni copiar ningún id; el filtro aplicado se muestra con el nombre, no con el UUID.

## F-02 · Gráficas vacías: solo aparece "Ver como tabla"

- **Dónde:** gráficas "Tendencia" y "Tasa de completitud" en las secciones Resumen, Tareas y Foco, en varios periodos.
- **Observado:** las gráficas no se dibujan; solo se ve el control "Ver como tabla". Ocurre incluso con datos existentes (hay tareas completadas en Semana y Año).
- **Esperado:** las gráficas se renderizan con los datos del periodo; si el periodo no tiene datos, se muestra un estado vacío explícito ("Sin datos en este periodo"), no un área en blanco.
- **Severidad:** P0
- **Criterio de aceptación:** con datos en el periodo, la gráfica dibuja puntos/barras; sin datos, aparece el estado vacío. Verificar en Resumen, Tareas y Foco, en los 4 periodos.

## F-03 · Puntualidad: "Tarde 100 %" sin datos y media distorsionada por outliers

- **Dónde:** tarjeta de Puntualidad.
- **Observado (a):** en "Hoy", con 0 tareas completadas, muestra "Tarde 100 %" con barra roja.
- **Esperado (a):** sin completadas en el periodo, estado vacío o "—" en vez de un porcentaje alarmante.
- **Observado (b):** en "Semana", con 1 sola tarea, "retraso medio 213,8 días": una sola tarea antigua distorsiona toda la métrica.
- **Esperado (b):** usar mediana o excluir/limitar outliers (p. ej. retraso máximo contado = 30 días), y mostrar la n junto a la métrica ("sobre 1 tarea").
- **Severidad:** P1
- **Criterio de aceptación:** con 0 completadas no se muestra porcentaje; con 1 tarea la métrica indica la n y un outlier de 200+ días no infla la media más allá del límite definido.

## F-04 · Foco: línea temporal vacía y "hora más enfocada" con datos ridículos

- **Dónde:** sección Foco.
- **Observado (a):** la Línea temporal está vacía incluso en el periodo Año, donde debería haber histórico; además solo etiqueta "20 oct".
- **Esperado (a):** la línea temporal cubre todo el periodo seleccionado y dibuja las sesiones de foco registradas; si no hay, estado vacío.
- **Observado (b):** "Hora más enfocada: 0-1 h" basado en 0,2 min de foco: ruido presentado como insight.
- **Esperado (b):** ocultar la métrica por debajo de un umbral razonable (p. ej. < 25 min de foco en el periodo) mostrando "—" o "Sin datos suficientes".
- **Severidad:** P2 (P1 si se confirma que hay sesiones de foco que la línea temporal no dibuja).
- **Criterio de aceptación:** en Año la línea temporal muestra todas las sesiones del año; la hora más enfocada solo aparece con datos suficientes.

## F-05 · Año: cifras incoherentes y celda coloreada en el futuro

- **Dónde:** periodo Año.
- **Observado (a):** "195 de 257 (75,9 %)" de completitud junto a 1 pomodoro y 25 % de sesiones: las cifras entre tarjetas no cuadran a simple vista.
- **Esperado (a):** revisar que cada métrica agregue sobre el mismo conjunto y periodo; las cifras visibles en la misma pantalla deben ser coherentes entre sí.
- **Observado (b):** la rejilla anual tiene una celda coloreada en noviembre, un mes futuro (hoy es 2026-10-20). Huele a bug de fechas o de zona horaria.
- **Esperado (b):** ninguna celda futura muestra actividad; las fechas se calculan en la zona horaria del usuario de forma consistente.
- **Severidad:** P0 (la celda futura indica un bug de datos/fechas).
- **Criterio de aceptación:** imposible que una fecha futura tenga actividad; auditando el dato detrás de esa celda se corrige su origen (fecha guardada en UTC vs local, año erróneo, etc.).

## F-06 · Resumen: "Nivel 10 · experto" incoherente con "Mejor momento" 0/0/0

- **Dónde:** tarjeta de Resumen general.
- **Observado:** "Nivel 10 · experto, 843 puntos" con barra casi llena, mientras "Mejor momento" muestra 0/0/0. Si hay 843 puntos acumulados, los contadores de mejor momento no deberían estar a cero.
- **Esperado:** las métricas de gamificación derivan del mismo histórico; si una está a cero y otra acumulada, una de las dos está mal calculada o lee de otra fuente.
- **Severidad:** P2
- **Criterio de aceptación:** con puntos acumulados > 0, "Mejor momento" refleja el mejor día/semana/racha real del histórico.

## F-07 · Hábitos: estado vacío mal maquetado

- **Dónde:** sección Hábitos.
- **Observado:** el texto "Aún no hay hábitos activos" se rompe en una columna estrecha; el título de la tabla se solapa con el borde; "Hábitos al 0 %" se muestra sin existir hábitos.
- **Esperado:** el estado vacío ocupa el ancho completo con maquetación limpia; sin hábitos, el porcentaje muestra "—" en lugar de 0 %.
- **Severidad:** P2
- **Criterio de aceptación:** sin hábitos activos, la sección muestra un estado vacío legible y sin solapes, y ningún porcentaje calculado sobre 0 elementos.

## F-08 · Detalles menores de texto y estilo

- **Dónde:** varios.
- **Observado:**
  1. Plural incorrecto: "1 completadas".
  2. Botones Completadas/Creadas sin estilo (parecen texto plano, no un selector).
  3. En "Hoy", la primera tarjeta aparece cortada por el borde superior.
- **Esperado:** plural condicional ("1 completada"), los selectores de métrica con estilo de botón/toggle consistente con el resto de la app, y sin recortes de layout en la primera tarjeta.
- **Severidad:** P3
- **Criterio de aceptación:** singular correcto con n=1; los botones tienen affordance visual clara; ninguna tarjeta queda recortada en ningún periodo.

## F-09 · "Completadas 0, -100 %" en rojo sin contexto

- **Dónde:** tarjeta de Resumen del periodo Hoy.
- **Observado:** "Completadas 0, -100 %" en rojo: compara con el día anterior sin dar contexto (el -100 % de 0 sobre pocas tareas no aporta información útil).
- **Esperado:** mostrar la comparación en neutro y con el referente explícito, p. ej. "ayer: 3", y reservar el color para cambios significativos (n mínima).
- **Severidad:** P2
- **Criterio de aceptación:** la variación incluye el valor del periodo anterior; sin datos suficientes no se muestra porcentaje en rojo.

## F-10 · "Hábitos cumplidos 0 %" con "0/0 días" debería ser "—"

- **Dónde:** tarjeta de Hábitos en Resumen.
- **Observado:** "Hábitos cumplidos 0 %" junto a "0/0 días": un 0 % calculado sobre nada transmite un fracaso inexistente. La tarjeta de Tasa de completitud ya resuelve este caso con "—".
- **Esperado:** mismo criterio que Tasa de completitud: sin base de cálculo, mostrar "—".
- **Severidad:** P2
- **Criterio de aceptación:** con 0/0 días la tarjeta muestra "—" y no un 0 %.

## F-11 · La tarjeta de nivel no explica el progreso

- **Dónde:** tarjeta de gamificación (Nivel/puntos).
- **Observado:** "Nivel 10 · 843 puntos" con la barra casi llena, sin indicar cuánto falta para el siguiente nivel ni cómo se ganan puntos.
- **Esperado:** la tarjeta indica el umbral ("843/1000 puntos para nivel 11") o un tooltip/ayuda que explique el sistema de niveles.
- **Severidad:** P3
- **Criterio de aceptación:** el usuario puede ver cuántos puntos le faltan para el siguiente nivel sin salir de la tarjeta.

---

## Notas para el agente

- Relacionados: F-03, F-09 y F-10 comparten la misma regla de negocio ("no mostrar métricas calculadas sobre conjuntos vacíos o con n insuficiente"); conviene resolverlos con un único patrón de estado vacío reutilizable.
- F-02 y F-05b pueden tener la misma raíz si las gráficas y la rejilla leen fechas del mismo módulo: comprobar la gestión de zona horaria al agregar por día.
- Tras los cambios, verificar con un usuario con datos reales (tareas completadas en varios días, al menos una tarea con mucho retraso, hábitos y pomodoros) y con un usuario vacío, en los 4 periodos.
