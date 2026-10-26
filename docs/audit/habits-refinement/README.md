# Hábitos — refinamiento local

Trabajo en `codex/local-tests-refinement`. Sin PR remota, despliegue ni cambios en hábitos reales. Referencia: especificación histórica §9.13, RF-1301 (configuración), RF-1302 (contador y notas), RF-1303 (rachas/mapas), RF-1304 (entidad independiente), RF-1305 (API/eventos).

## Cortes revisables

1. **Formulario**: `HabitEditor`, copia y foco de `Popover`. Modal compartido, botones compartidos, selector de fecha compartido. Nombre obligatorio, frecuencia, cantidad/unidad, recordatorio opcional y opciones avanzadas separadas para caber en 375×667. Enter guarda; Esc cierra el panel superior.
2. **Registro**: `HabitCard` y `HabitsPage`. Una columna, marcado circular de 48×48, cantidad con −/+, tira semanal corregible, gestión de pausa/archivo separada. Las notas siguen en el detalle.
3. **Presentación y constancia**: estilos, `HabitConstancy`, `YearHeatmap` y detalle. Fondos separados, tokens y componentes existentes. Todos/hábito, color por cumplimiento programado, días sin programación neutros, una leyenda. La última indicación de Pablo sustituye la ventana de 12/26 semanas con scroll: **el año completo se adapta al ancho, sin scroll horizontal**, también en móvil. La tabla anual existe solo para lectores de pantalla. Navegación del mapa con flechas y Enter.
4. **Modelo compatible**: DTO, dominio, servicio y SDK; disponibilidad en Hoy/planificación y recordatorios del scheduler. No hay servicios de IA: solo comentarios de integración futura con Ticky.

Los parches de esta carpeta comparan con la copia de los archivos al comenzar Hábitos, no con HEAD: separan los cambios de Hábitos de los refinamientos previos. Los archivos generados también reflejan los endpoints de planificación que ya existen en esta rama. Son cortes de revisión complementarios, no cuatro implementaciones desplegables por separado.

## Datos y reversibilidad

El modelo ya admitía días concretos y cantidad diaria. No se necesita migración SQL para ellos. Se añaden `unit`, `start_date` y `paused` opcionales a la API y al JSON existente de objetivo; los registros antiguos responden con `null`, `null` y `false`. No hay backfill ni modificación masiva.

El historial de disponibilidad conserva días anteriores, contadores y notas al cambiar configuración, pausar y reanudar. Pausar cancela recordatorios pendientes; reanudar permite programarlos otra vez. La entrega comprueba que el hábito sigue activo. Se reutilizan los eventos versionados existentes.

Rollback: el lector anterior ignora las claves adicionales y conserva contadores y notas. Antes de volver a una versión sin pausa hay que resolver explícitamente los hábitos pausados, porque esa versión no interpreta la pausa. No eliminar logs ni reescribir hábitos existentes para revertir estilos.

## Validación

- Lint y typecheck del monorepo correctos (warning previo de console en `wt-d-allday.e2e-spec.ts`).
- Unitarios: dominio 344, SDK 11, API 282, web 256; dominio 90,04 % de cobertura.
- Integración de Hábitos: 5 pruebas correctas sobre **ttd_wt_f**, nunca sobre ttd_r80_r105. Incluye compatibilidad, propietario, notas, fecha de inicio, pausa y reanudación de recordatorios.
- Navegador: 32 pruebas de diseño y comportamiento, 4 combinaciones de viewport/tema. Valida geometría circular, ausencia de desbordamiento, formulario sin scroll, validación del nombre, creación básica, cantidad, marcado/desmarcado, corrección de días pasados, gestión, mapa, accesibilidad y Esc anidado.
- Regresión: 11 pruebas de historial/notas/Hoy, con pausa y fecha futura excluidas de Hoy.
- Regresión de YearHeatmap en Estadísticas: 8 pruebas correctas en foco/hábitos, móvil/escritorio y claro/oscuro.
- OpenAPI, catálogo MCP y SDK regenerados. API recompilada; reinicio limitado al contenedor de la app local.

La agrupación opcional por mañana/tarde/noche queda fuera de este corte para mantener una única lista sencilla.

## Capturas

Archivos locales en `test-artifacts/audit/evidencias/habits/`, todos con datos simulados. `before_*` corresponde a la implementación anterior y `after_*` a esta revisión.

| Escenario                      | Móvil                                                                              | Escritorio                                         |
| ------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| Antes, 1 hábito                | `before_list_1_habits-375-light.png`                                               | `before_list_1_habits-1280-light.png`              |
| Antes, 3 hábitos               | `before_list_3_habits-375-light.png`                                               | `before_list_3_habits-1280-light.png`              |
| Antes, 8 hábitos               | `before_list_8_habits-375-light.png`                                               | `before_list_8_habits-1280-light.png`              |
| Después, 0/1/3/8               | `after_list_{n}_habits-375-{light,dark}.png`                                       | `after_list_{n}_habits-1280-{light,dark}.png`      |
| Constancia, 1/3/8              | `after_constancy_{n}_habits-375-{light,dark}.png`                                  | `after_constancy_{n}_habits-1280-{light,dark}.png` |
| Formulario                     | `after_form_habits-375-light.png`                                                  | `after_form_habits-1280-light.png`                 |
| Cantidad / Más                 | `after_form_quantity_habits-375-light.png`, `after_form_more_habits-375-light.png` | mismos sufijos `1280-light`                        |
| Marcado / pendiente / cantidad | `after_marked_`, `after_unmarked_`, `after_quantity_` + sufijo de viewport/tema    | iguales                                            |

En listas largas se captura la parte superior y Constancia por separado, respetando el scroll vertical normal de la pantalla.

## Segunda revisión de UI — 26 de octubre

- Constancia usa un selector nativo «Todos los hábitos / hábito», en lugar de tantos botones como hábitos. El mapa anual completo conserva su geometría sin scroll.
- Racha y días cumplidos pasan a dos métricas claras, con 🔥 y 🌱 decorativos; ninguna elección de emoji añadida al formulario.
- Marcado con check y texto «Completar / Marcar hoy / Hecho». Cantidades con «Hoy», «Restar» y «Añadir», conservando los nombres accesibles.
- La semana tiene rango de fechas, días numerados, flechas y acceso a Hoy. Reutiliza PeriodNavigator del calendario mediante una etiqueta opcional, sin cambiar el comportamiento de sus otros consumidores.
- «Editar hábitos» abre un panel con texto corto y acciones de edición, pausa y archivo; la lista activa sigue detrás del panel.
- «Ver mes» muestra un calendario de cumplimiento de solo lectura: modal en móvil e integrado debajo de la semana en escritorio. Navega entre meses y años usando la misma API de estadísticas. Los registros y notas se siguen corrigiendo desde el detalle.
- Cambios solo web. No se reinició la API ni se modificaron datos reales durante esta segunda revisión.
- Pruebas: 36 escenarios de diseño/interacción en móvil/escritorio y claro/oscuro, 4 regresiones de historial, lint, typecheck y unitarios web.
- Capturas adicionales: `refined_month_habits-375-light.png`, `refined_month_habits-375-dark.png`, `refined_month_habits-1280-light.png`, `refined_month_habits-1280-dark.png` en la misma carpeta de evidencias.

## R2 — integración visual con ttd

Continúa en `codex/local-tests-refinement`, conservando los cambios locales anteriores. Alcance exclusivo web: RF-1301 (editor), RF-1302 (registro/cantidad), RF-1303 (presentación de estadísticas). No cambia el modelo, API, programación ni cálculo de rachas.

- Tarjeta neutra en ambos estados, marca a la izquierda, título y racha compactos con `Flame` de lucide. Cantidades mediante `NumberStepper` compartido en `components/`, con botones `icon/sm` y nombres accesibles. Se conserva la unidad en el texto accesible y en el tooltip del contador.
- Círculos semanales de 32 px / 36 px móvil, checks visibles, hoy con anillo y días no programados punteados. Mes con acento y `--on-accent` para mantener el check blanco también en oscuro.
- Editor único: controles `.segmented`, «Más» con `aria-expanded` y contenido desplegable; cabecera y pie fijos y scroll solo en el cuerpo. Conserva los campos principales y los valores avanzados al cerrar el desplegable. Chips de días con check, input `habit-title` con exclusiones de gestores de contraseñas.
- Tipografía en `habits.css` solo mediante tokens, sin hex ni emojis. Animación de marca de 280 ms y disclosure de 180 ms, desactivadas con reduced-motion.
- Se conservan el selector nativo de Constancia y el año completo sin scroll horizontal. No se modifica `YearHeatmap`.

Pruebas: 40 escenarios de diseño en 375×667 y 1280×800, claro/oscuro; regresión de historial/notas en `habits-v2.spec.ts`; prueba de componente del disclosure, selección de días, atributos del nombre y conservación de valores al guardar. Todos usan datos simulados. Dominio: 344 pruebas / 90,04 % de cobertura; SDK: 11; API: 282; web: 256 existentes más la nueva prueba del editor. Lint y typecheck del monorepo, OpenAPI regenerado sin cambio adicional.

El contenedor local no incluye `bash`: se ejecutaron directamente los comandos pnpm equivalentes al wrapper raíz. Los unitarios de API requieren omitir `GIT_COMMIT` y `BUILD_TIME` del proceso de prueba porque HealthController espera los valores `unknown`; esto no cambia el entorno de la aplicación.

Evidencias y limitaciones de las capturas: [r2.md](r2.md). No se crean commits ni PR para evitar incorporar el trabajo local previo a cortes automáticos.

## R3 — tarjetas compactas, detalle y mapa móvil

Nueva indicación de Pablo: **sustituye la decisión anterior de encajar el año entero en móvil**. `YearHeatmap` usa en móvil meses consecutivos desplazables, cada mes con siete columnas de lunes a domingo; muestra aproximadamente 3–5 meses según el ancho. Abre en los meses recientes; el teclado y el scroll permiten acceder a los anteriores. En escritorio mantiene el año completo. Se aplica tanto a Hábitos como a Estadísticas.

- RF-1301/1302: «Hoy: 8 de 8 vasos» (o «veces» si no existe unidad), controles de cantidad ghost agrupados, selector compartido `Select` con el mismo tamaño, radio y chevron que Ajustes. No se modifican hábitos reales.
- Tarjeta de unos 125 px en 375×667: cabecera más pequeña, semana compacta con fecha dentro del círculo e icono accesible para «Ver mes». Sustituye el bloque de texto que separaba cabecera y semana.
- RF-1303: detalle con vuelta explícita a Hábitos (también en carga/error), cuatro métricas, calendario mensual compartido e interactivo, constancia y notas. El editor de un registro abre el `Popover` compartido, conserva contador/notas y confirmación de desmarcado. No hay cálculo nuevo de rachas ni cambios en API/modelo.
- Selectores nativos con presentación compartida de Ajustes; Constancia no muestra un selector redundante cuando solo existe un hábito.

Validación web: lint/typecheck, 257 unitarios; 44 escenarios de diseño/interacción entre móvil/escritorio y claro/oscuro; regresiones de historial/notas/archivo y Estadísticas. Los selectores de las pruebas apuntan al heatmap explícitamente porque el nuevo selector también contiene un SVG (chevron).

Capturas con datos simulados: `r3_after_list_{1,3,8}_habits-{375,1280}-{light,dark}.png`, `r3_after_constancy_*.png`, `r3_detail_habits-{375,1280}-{light,dark}.png` en `test-artifacts/audit/evidencias/habits/`. Las indicaciones de R3 prevalecen sobre las capturas y decisiones R2.

## R4 — cumplimiento semanal y círculos

Se retiran los botones de cantidad de la tarjeta. El contador diario se sustituye por «Semana: N de M días cumplidos», relativo a la semana seleccionada: N cuenta días con objetivo cumplido (no unidades de cantidad); M cuenta días programados y, para objetivos semanales, usa `times_per_period` limitado a los días disponibles. El día actual usa el estado de `habit.today` para actualizar al marcar. La edición de cantidades permanece en el detalle. No hay cambios de API ni de registros reales (RF-1302/1303).

Los números son contenido del propio círculo, centrado mediante grid, y se sustituyen por check al cumplirlo. Bordes de círculos y tarjetas con mayor contraste a partir de tokens existentes. Se conservan los badges de calendario negros/blancos de la revisión anterior.

Validación: móvil/escritorio, claro/oscuro; objetivos semanales de 3 días y programación de 5 días; marcado/desmarcado y geometría del centro del número; regresión de historial, cantidad y notas en el detalle. Evidencias de lista: `r4_after_list_3_habits-{375,1280}-{light,dark}.png`.

## R5 — cabecera y etiquetas semanales

Se retira el check grande de la izquierda. El registro se marca/desmarca con el círculo del día de la semana (RF-1302); la cabecera conserva el enlace al detalle. Nombre a `--fs-md`, metadatos a `--fs-sm`, racha y progreso en la misma línea con separación de `--sp-4`. Progreso visible «2 / 7 días», con nombre accesible completo «Semana: 2 de 7 días cumplidos».

Etiquetas Lun/Mar/Mié/Jue/Vie/Sáb/Dom (Mon/Tue/etc. en inglés), en `--ink` para negro en claro y blanco en oscuro. Se separan del círculo con `--sp-2`; círculo de 32 px y número centrado. La tarjeta conserva su formato compacto.

Pruebas de diseño y marcado en móvil/escritorio y claro/oscuro, geometría de alineación y separación, y regresiones del detalle. Capturas: `r5_after_list_3_habits-{375,1280}-{light,dark}.png` en la carpeta de evidencias.

## R6 — acciones compactas y objetivo

Botonera compartida `HabitActions` entre gestión y detalle: Editar, Pausar/Reanudar y Eliminar, con iconos lucide y `Button ghost/sm` de 28 px. Se elimina la acción Archivar de ambas superficies. Los hábitos archivados existentes se conservan; se muestran como pausados y Reanudar los recupera sin borrar historial. Eliminar usa el endpoint existente y requiere confirmación explícita del borrado del hábito y su historial dentro del mismo panel. Cancelar no envía ninguna mutación. Sin cambios de API/modelo y sin modificaciones de datos reales (RF-1301/1302).

Modal de gestión con cabecera y filas compactas, sin introducción redundante. Tarjeta con icono `Target` y «Objetivo 1 / 7», sin la palabra Semana ni «días cumplidos». Se conserva el cálculo de cumplimiento semanal.

Validación: claro/oscuro, móvil/escritorio, botones de hasta 32 px, objetivo visible/accesible, pausa/reanudación, confirmación/cancelación de eliminación y regresiones de edición/historial/notas. Capturas del panel: `r6_manager_habits-{375,1280}-{light,dark}.png` en la carpeta de evidencias.

## R7 — calendario anual por meses

Constancia muestra el año natural actual, enero–diciembre, incluidos años bisiestos; los días futuros quedan neutros. Se sustituye la ventana móvil de los últimos 365 días. Solo se solicita la estadística del año representado.

En escritorio, el heatmap tiene una primera columna de etiquetas L/M/M/J/V/S/D y doce bloques mensuales con separación. Las celdas mantienen sus siete filas de lunes a domingo; cada mes empieza en su columna propia, sin compartir la semana con el mes anterior. Conserva el ancho disponible sin scroll horizontal. En móvil se mantiene el desplazamiento por meses y la vista inicial cercana al mes actual.

Pruebas: presencia del 1 de enero y 31 de diciembre, 365 celdas en 2026, etiquetas y huecos entre meses, ausencia de overflow en escritorio, scroll móvil y regresión de Estadísticas en ambos temas. Capturas: `r7_heatmap_habits-{375,1280}-{light,dark}.png`.
