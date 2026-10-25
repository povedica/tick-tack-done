# Historial de cambios

## Sin publicar — ajustes visuales PR77

- Listas en móvil: selector de vista dentro del menú de acciones, con Matriz,
  Kanban y Timeline según la vista. Cabecera y menú con texto más compacto;
  desplegable flotante con altura ajustada a la pantalla para evitar recortes
  en listas vacías como Mañana (RF-1001/1002/1003/1004).
- Ajustes: controles de una línea más compactos, con espacio vertical en las filas
  de Foco y áreas táctiles conservadas. Sombra suave en el panel y la navegación
  de Ajustes en ambos temas, sin cambios de comportamiento (RF-1201/1203/1205).
- Flechas de los selectores de Ajustes con margen derecho y espacio reservado
  para que no se solapen con el texto; colores adaptados al tema.

## Staging — Telegram por usuario y Resend (23 de octubre de 2026)

- RF-2003: configuración cifrada de un bot exclusivo por usuario en Ajustes →
  Integraciones, webhook propio y aislamiento de chats, respuestas, adjuntos y
  avisos. Se conservan QR, perfil, bloqueo y preferencias; las credenciales
  globales de Telegram dejan de utilizarse.
- Evento versionado `telegram.bot_configured@v1`: datos saneados con usuario del
  bot y estado del webhook, sin tokens ni secretos.
- RF-802/RF-808: correo transaccional por Resend con `RESEND_API_KEY` y
  `EMAIL_FROM`; recordatorios con idempotencia y reintentos que conservan los
  canales ya enviados. SMTP se mantiene para desarrollo local.
- Se conservan las migraciones y mejoras ya presentes en staging. La selección
  explícita de configuración usa `RUNTIME_ENV_FILE`; el despliegue conserva las
  claves y los datos existentes y actualiza solo las credenciales de integración.

## Sin publicar — PR75

- Staging aislado con Compose, PostgreSQL/Redis, redes y secretos propios; configuración y retirada a página estática preparadas. Activación pública y aceptación externa pendientes.
- Política de navegador corregida para las subidas directas a Drive, Google Picker y sus ventanas OAuth; prueba de regresión sobre las cuatro configuraciones.

- Mayor fiabilidad OAuth y contratos MCP, recurrencias, paginación y sesiones de Foco.
- Regresión con dos procesos API compilados: el refresh concurrente, el access anterior y la autenticación MCP sobreviven al reinicio con PostgreSQL/Redis locales reales; staging sigue pendiente.
- Calendario, captura contextual, fuentes de planificación, estadísticas y accesibilidad móvil.
- Adjuntos exclusivamente en Google Drive con metadatos en tick-tack-done; enlaces en tareas.
- Ajustes de Pomodoro, sonidos locales, matriz de notificaciones y vinculación guiada de Telegram.
- Acerca de con versiones y diagnóstico sin datos de cuenta.
- Tarjetas con permisos y activación independientes para Google Calendar y Google Drive sobre una conexión Google y avisos sobre tratamiento de datos.

Por petición de Pablo, se retira `docs/` del árbol. Las evidencias históricas siguen enlazadas en la PR; las nuevas ejecuciones generan artefactos ignorados por Git en `test-artifacts/`.

Implementación y pruebas locales: [estado](https://github.com/povedica/tick-tack-done/blob/340f34be17477ecab681ddc3dbfd790c9346a0ba/docs/audit/ESTADO.md). Las verificaciones externas pendientes se detallan en la PR; estos cambios no se han desplegado. [Contrato MCP](https://github.com/povedica/tick-tack-done/blob/340f34be17477ecab681ddc3dbfd790c9346a0ba/docs/mcp/CHANGELOG.md).
