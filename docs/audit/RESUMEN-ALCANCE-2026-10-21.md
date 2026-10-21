# Alcance y estado al guardar los avances del 21/10/2026

Rama `codex/ttd-audit-remaining`, PR #73, abierta en borrador. Este corte guarda
los avances de calendario y alta; no cierra 75–79 ni autoriza merge o despliegue.
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

| Punto | Estado actual | Qué falta |
| --- | --- | --- |
| 75.1 Filtros/fuentes | Adaptado al panel flotante solicitado después | Revisión final de paridad funcional; no afirmar implementado el sidebar original, sustituido por decisión del usuario |
| 75.2 Panel fijo sólo en Tareas | Implementado el 22/10 | Sólo tasks mantiene columna; otras secciones abren detalle centrado y móvil conserva hoja |
| 75.3 Plegado en cabecera | Implementado el 22/10 | Compartido Calendario/Hoy/Tareas, rail sin duplicado, ARIA/atajo y drawer móvil probados |
| 75.4 Tarjetas/horas | Muy avanzado | Revisar consistencia final por vista; por decisión posterior no se repite hora dentro de tarjetas con franja horaria |
| 75.5 Mover/redimensionar | Implementado el 22/10 | Ratón/táctil/teclado, duración, todo el día, Deshacer, rollback/Reintentar y DST probados con API simulada; validación real pendiente |
| 75.6 TaskPeek/evento anclado | Parcial | TaskPeek junto a tarjeta y evento externo anclado; el detalle actual no acredita ese patrón |
| 75.7 Hoy circular | Implementado y probado | Validación real final; no confundir con navegador de periodo compartido |
| 75.8 Cabecera | Adaptada y probada según feedback | Cierre visual/funcional final de escritorio; no restaurar «⋯» ni la antigua navegación dentro del selector móvil |
| 75.9 Paneles secundarios | Columna derecha retirada fuera de Tareas el 22/10 | Repaso visual de desktop; drawer móvil ya corregido |
| 75.10 Todo el día | Adaptado y probado | Revisión final global; el límite de dos y DaySheet sustituyen la expansión de franja del diseño inicial |
| 75.11 Navegador compartido | Excluido por el usuario (22/10) | No implementar. Calendario conserva su selector actual; no compartir el selector del Reporte semanal |
| 76 Composer único | Implementado; pendiente validación móvil real | Alta global (+/N), URL compartida y calendario usan la misma tarjeta y botonera. Borrador protegido, descarte, atajos y adaptación a visualViewport comprobados con API simulada; confirmar teclado en dispositivo real |
| 77 Avatar/progreso | Implementado, validado con API simulada | Recorrido con sesión/datos reales y cierre de aceptación |
| 78 Foco/Pomodoro | Pendiente de rediseño completo | Pomo/Cronómetro, pausa/continuar, progreso, presets por sesión, Resumen/Registro, distribución móvil/escritorio y endpoints indicados en la spec |
| 79 Tokens/MCP | Pendiente de rediseño y nuevas APIs | Aplicaciones OAuth por cliente, revocación conjunta, caducidad de PAT, actividad por aplicación, filas plegables, permisos resumidos/sensibles e instrucciones por cliente |

## Otros pendientes registrados

- Hoy: cabecera limpia y vistas en menú; Kanban debe funcionar realmente.
- Plan del día móvil: ocultar resumen de capacidad y alinear título/Planificar.
- Año: investigar lentitud observada; no hay diagnóstico demostrado.
- Desktop al 200 % de zoom: fallo de Agenda resuelto el 22/10 al retirar la
  columna derecha; la prueba de composición a 1440 px pasa.
- Consolidar los overrides CSS de calendario sin cambiar lo validado.
- AUD-34: investigar incidencias de login; quedó aplazado.
- AUD-47: configuración/validación manual de Google Cloud y OAuth.
- AUD-59: sincronización de preferencias entre dispositivos en servidor.
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
Después quedan la validación móvil real del composer (76), Hoy/Plan del día, Foco (78),
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
