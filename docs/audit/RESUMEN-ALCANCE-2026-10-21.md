# Alcance y estado al guardar los avances del 21/10/2026

Rama `codex/ttd-audit-remaining`, PR #73, abierta en borrador. Este corte guarda
los avances de calendario y alta; no cerraba 75–79. La autorización posterior
del 22/10 para merge y despliegue prevalece; ver la continuación al final.
Fuentes: `ESTADO.md`, `ttd-codex-r75.md`, decisiones posteriores del usuario y
código actual. Las decisiones posteriores prevalecen sobre los diseños iniciales.

## Lo ya realizado

- Auditoría 01–73: el registro histórico contiene correcciones de tareas/fechas,
  detalle, navegación, listas, vistas, temas, idioma, robustez, MCP, integraciones
  y actividad. La mayor parte está integrada mediante #71 y PR previas; no se ha
  repetido aquí una auditoría completa de cada criterio histórico.
- 74: alta contextual desde el calendario, selección de rangos, fecha/hora en
  zona de cuenta, conservación del borrador y pruebas de creación.
- 75.7: TodayMark compartido, hoy circular relleno y actualización de fecha de
  cuenta al cruzar medianoche. Ya estaba commiteado antes de este corte.
- 77: racha/puntuación en avatar, retiradas del rail/sidebar/barra móvil; progreso
  compacto, navegación Listas/Más reparada, drawers más anchos y fondo atenuado.
  Ya estaba commiteado; comprobación con datos reales sigue pendiente.
- Calendario actual: filtros y selector consistentes, sin «⋯»; filtros compactos
  con listas/filtros/etiquetas/fuentes y estado en URL/persistencia existente.
  Fondo móvil oscuro/desenfocado y cierre con devolución de foco.
- Semana móvil: minicalendario y siete celdas en dos columnas, tarjetas compactas,
  scroll interior y gestos; cinco días laborales aprovechan tres filas completas.
- Día: franja semanal fija, selección/gestos de siete días, horario independiente,
  línea actual roja actualizada por minuto y cálculos en zona de cuenta.
- Mes/Año: gestos verticales, días ajenos al mes atenuados y Año dentro del viewport.
  Trimestre/Dos semanas quedan sólo en escritorio, con normalización de enlaces móviles.
- Todo el día: dos elementos mixtos y +N lateral; agenda completa en DaySheet de
  92dvh, con scroll interno y cierre. Es la decisión posterior del usuario.
- Agenda: tres meses iniciales, hoy como posición inicial, ampliación manual por
  meses naturales y soporte de meses vacíos. Controles con mes/año y chevrons.
- Alta móvil desde calendario: modal de 69dvh con margen y fondo oscuro/desenfocado,
  acciones sin bordes/fondos grises, etiqueta junto a Bandeja e icono de envío azul.
- Fecha del alta: sin elipsis, rango inicio–fin, fin con fecha cuando cruza de día,
  30 minutos por defecto al elegir hora e indicadores de repetición/recordatorio.
- Huecos: alta en todas las vistas con fecha del día; en vistas horarias conserva
  franja pulsada y duración inicial. Los gestos no disparan alta accidental.
- Descripción del alta: / al inicio de línea abre menú Markdown con encabezado,
  viñetas, checklist, cita y código. Teclado, Escape, cursor y conservación de texto.
- Detalle móvil: retirada la flecha de volver duplicada; se conserva la X compartida.

## Estado de 75–79 y trabajo restante

| Punto                          | Estado actual                                                | Qué falta                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 75.1 Filtros/fuentes           | Adaptado al panel flotante solicitado después                | Revisión final de paridad funcional; no afirmar implementado el sidebar original, sustituido por decisión del usuario                                                                                                    |
| 75.2 Panel fijo sólo en Tareas | Implementado el 22/10                                        | Sólo tasks mantiene columna; otras secciones abren detalle centrado y móvil conserva hoja                                                                                                                                |
| 75.3 Plegado en cabecera       | Implementado el 22/10                                        | Compartido Calendario/Hoy/Tareas, rail sin duplicado, ARIA/atajo y drawer móvil probados                                                                                                                                 |
| 75.4 Tarjetas/horas            | Muy avanzado                                                 | Revisar consistencia final por vista; por decisión posterior no se repite hora dentro de tarjetas con franja horaria                                                                                                     |
| 75.5 Mover/redimensionar       | Implementado el 22/10                                        | Ratón/táctil/teclado, duración, todo el día, Deshacer, rollback/Reintentar y DST probados con API simulada; validación real pendiente                                                                                    |
| 75.6 TaskPeek/evento anclado   | Parcial                                                      | TaskPeek junto a tarjeta y evento externo anclado; el detalle actual no acredita ese patrón                                                                                                                              |
| 75.7 Hoy circular              | Implementado y probado                                       | Validación real final; no confundir con navegador de periodo compartido                                                                                                                                                  |
| 75.8 Cabecera                  | Adaptada y probada según feedback                            | Cierre visual/funcional final de escritorio; no restaurar «⋯» ni la antigua navegación dentro del selector móvil                                                                                                         |
| 75.9 Paneles secundarios       | Columna derecha retirada fuera de Tareas el 22/10            | Repaso visual de desktop; drawer móvil ya corregido                                                                                                                                                                      |
| 75.10 Todo el día              | Adaptado y probado                                           | Revisión final global; el límite de dos y DaySheet sustituyen la expansión de franja del diseño inicial                                                                                                                  |
| 75.11 Navegador compartido     | Excluido por el usuario (22/10)                              | No implementar. Calendario conserva su selector actual; no compartir el selector del Reporte semanal                                                                                                                     |
| 76 Composer único              | Implementado; pendiente validación móvil real                | Alta global (+/N), URL compartida y calendario usan la misma tarjeta y botonera. Borrador protegido, descarte, atajos y adaptación a visualViewport comprobados con API simulada; confirmar teclado en dispositivo real  |
| 77 Avatar/progreso             | Implementado, validado con API simulada                      | Recorrido con sesión/datos reales y cierre de aceptación                                                                                                                                                                 |
| 78 Foco/Pomodoro               | Implementado en esta continuación; validación final en curso | Cronómetro/pausas persistentes, presets por sesión, resumen local, registro paginado y UI responsive. Falta acreditar el código nuevo desplegado y dispositivo físico                                                    |
| 79 Tokens/MCP                  | Implementado en esta continuación; validación final en curso | APIs de aplicaciones y revocación conjunta, PAT con caducidad, actividad/recuento de renovaciones, UI plegable e instrucciones por cliente. Transporte MCP hacia API pública. Falta validación desplegada de este código |

## Otros pendientes registrados

- Hoy (22/10): alta más ligera, bombilla retirada y Lista/Matriz/Kanban visibles por iconos; Kanban con Hábitos al final. Compartido con Mañana y páginas equivalentes, probado con API simulada; pendiente revisión real del usuario. Sustituye la indicación anterior de vistas en menú.
- Plan del día móvil: capacidad oculta y cabecera alineada en la continuación del 22/10.
- Año: investigar lentitud observada; no hay diagnóstico demostrado.
- Desktop al 200 % de zoom: fallo de Agenda resuelto el 22/10 al retirar la
  columna derecha; la prueba de composición a 1440 px pasa.
- Consolidar los overrides CSS de calendario sin cambiar lo validado.
- AUD-34: corregida carrera de logout/respuesta de sesión y verificado login real; ver continuación.
- AUD-47: configuración/validación manual de Google Cloud y OAuth.
- AUD-59: sincronización en servidor implementada y probada entre contextos de navegador; pendiente despliegue.
- Validación real tras despliegue de actividad sin anidación, MCP con fechas de
  día completo, errores de argumentos desconocidos y escenarios de cuenta/permisos.
- Revisión global de los criterios históricos: el registro histórico no equivale
  a una nueva verificación de toda la especificación única.
- Ticky F1–F10 queda fuera del corte, conforme a las instrucciones previas.

## Decisión final del usuario y siguiente revisión

El usuario da por terminados los ajustes móviles de calendario y no quiere más
funcionalidad salvo instrucciones definidas que se hayan omitido. Queda repasar
las vistas de escritorio. Los puntos 75 pendientes de la tabla son instrucciones
anteriores detectadas, no propuestas nuevas ni una autorización para añadirlas
automáticamente en este cierre. Contrastar su vigencia durante ese repaso.
Después quedan la validación móvil real del composer (76), revisión real de Hoy y Plan del día, Foco (78),
Tokens/MCP (79) y validación con datos reales. No se declara cumplimiento global.

## Validación de este cierre

- Lint general correcto al repetir solo: primer intento simultáneo con tests y
  typecheck terminó en 137 sin diagnóstico de código.
- Typecheck general correcto; 598 unitarios correctos (dominio 299, web 171,
  API 117, SDK 11).
- OpenAPI regenerado sin diff. Sin cambios de API/modelo; no se repite integración.
- Playwright: pase de 66 con 64 correctos y dos fallos; se corrige la expectativa
  de eventos de Agenda tras ampliar su rango y se repiten ambos casos. Resultado
  acumulado: 65 correctos y un fallo real desktop al 200 % descrito arriba.
- Las expectativas antiguas de ocho vistas móviles y cabecera de Agenda con h1
  se actualizan según las decisiones del usuario. Capturas exclusivamente en /tmp.
- Las pruebas usan API simulada; no acreditan sesión real ni despliegue.

Actualización 22/10: el fallo de zoom pendiente del cierre anterior queda resuelto
y verificado en navegador. Ver el corte 75.2/75.9 en ESTADO.md.

### Kanban: interacción de tarjetas (22 oct 2026)

RF-304 y RF-1002: clic en toda la tarjeta, incluidos sus márgenes, abre el detalle;
checkbox, enlaces y acciones conservan su comportamiento. Hover azul suave sólo
en la tarjeta señalada. Arrastre entre columnas con indicación de destino:
secciones actualizan column_id; Hoy actualiza prioridad, lista, etiqueta principal
o fecha según la agrupación. Fechas conservan hora y duración. Reutiliza endpoints
públicos existentes, incluido moveTask para cambios de lista.

Validación: lint y typecheck generales, 606 unitarios y OpenAPI sin diff.
Pruebas Playwright de clic en padding, hover aislado y arrastre nativo entre
prioridades y secciones con persistencia simulada en API.

## Continuación del 22/10: 78, 79 y pendientes transversales

Implementación y evidencia detalladas al final de ESTADO.md. Los encabezados
originales de los puntos trabajados son TTD-AUD-78 «Foco/Pomodoro: pantalla tipo
TickTick (…) y sin panel de detalle» y TTD-AUD-79 «Tokens y MCP: lo que pidió la
propuesta y no llegó en #71/#73». Las fases 4/5 históricas y los pendientes 76/77
se contrastan por contenido; no se vuelven a considerar pendientes las correcciones
que ya existen en código.

- Foco: cronómetro, pausa/continuación persistentes, presets por sesión, tareas,
  totales por zona de cuenta, registro paginado, diseño escritorio/móvil y ajustes.
  Registro manual y wake lock eran opcionales; no se muestra un alta manual vacía.
- Tokens: caducidad, aplicaciones OAuth, actividad y revocación conjunta; motivos,
  renovaciones agregadas y permisos sensibles. La sesión de navegador sigue siendo
  obligatoria para administrar credenciales, conforme a S-15/S-16.
- MCP: descubrimiento del contrato de OpenAPI y transporte hacia las operaciones
  públicas restantes, incluidos adjuntos, manteniendo autenticación/propietario/
  scopes/restricciones de listas. Parser compartido usado sin reimplementarlo.
- AUD-59: preferencias de Hoy y vistas de tareas en servidor; nueva migración
  aislada por propietario, caché local y recarga desde otro contexto de navegador.
- AUD-34: login real correcto en producción actual; no se reproducen errores JS.
  Dos 401 de arranque sin sesión son esperados. No demuestra todas las cuentas.
- Google: flujo del propietario conectado y nueve calendarios leídos realmente
  en producción `36f9209`; mejoras nuevas de scopes, reconexión y páginas públicas
  aún por validar desplegadas. La configuración/publicación de Google Cloud sigue
  externa: no testers y duración mayor a siete días no acreditados.
- Plan del día móvil: retirada capacidad y alineación de cabecera vigente.
- 76/77: regresiones actuales de composer, borrador, viewport y avatar; se mantiene
  pendiente el teclado virtual físico de 76 y la aceptación con el código desplegado.
- Calendario desktop: se conserva el patrón compartido de detalle flotante y el
  look aprobado; no se añade automáticamente el TaskPeek histórico como otro
  componente ni se reabre calendario móvil. Año: sin regresión funcional reproducida
  en los recorridos de esta continuación; no hay medición con dispositivo real.

El último permiso del usuario autoriza merge y producción. El acceso específico al VPS, recuperado del historial, responde;
backup y despliegue en preparación. No se declara un despliegue nuevo todavía. 75.11 y Ticky F1–F10 permanecen excluidos. No se ha modificado `localuser` ni
se incorporan los cambios de especificación aportados por el usuario.

### Evidencia consolidada del código

Integración completa: 131 correctas y 2 omitidas de Ticky. Capturas ficticias
en `/tmp/ttd-focus-*.png` y `/tmp/ttd-tokens-*.png`, con separación explícita de la
lectura real de Google en producción antigua. Corregidas además las carreras
de logout e inicialización de Estadísticas y la alineación de Agenda.

Commits: `0dbc0d0`, `a2674d3`, `5e14ac0`, `1132595`, `5d7d96f`; PR #73.
Playwright completo: **262 correctas y 2 omitidas**, API simulada. CodeQL correcto.
CI final y despliegue se registran al terminar; no convertir este inventario
en una declaración de aceptación con datos reales.
