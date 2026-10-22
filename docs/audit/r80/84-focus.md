# TTD-AUD-84 — Foco por MCP

Reproducción previa: una sesión terminada de 28 s mostraba 3628 s una hora después (completada y abandonada). Seis regresiones unitarias MCP fallaban porque faltaban argumentos/herramientas; el recorrido HTTP de ciclo de vida también fallaba.

- elapsed_seconds se congela en endedAt y descuenta pausas.
- start_focus admite task_id, pomodoro/stopwatch y minutos; usa la API pública existente. Iniciar con otra sesión activa devuelve 409 focus_already_running y session_id, sin crear otra fila.
- pause_focus, resume_focus, finish_focus (anotación opcional en actividad), abort_focus y get_focus_state pasan por los mismos guards, validación y pertenencia que REST. GET /focus/state documenta sesión, ajustes y totales del día con el mismo scope de start_focus.
- Dependencia adelantada: 85.1 conserva status y cuerpo estructurado al reentrar por HTTP; sin ella el conflicto de Foco se degradaba a 400.
- La web consultaba cada 15 s; ahora se actualiza cada segundo mientras está visible. No hay un segundo composer ni cambios de diseño en Foco.

Validación local: 2 unitarias de serialización, 6 unitarias de herramientas, ciclo de vida MCP sobre PostgreSQL con HTTP real y regresión de la pasarela. Playwright con API real aislada (cuenta r80 sintética), 1280×800/390×844 y claro/oscuro: iniciar por MCP → aparece tarea seleccionada y control Pausar; pausar → Continuar; reanudar → Pausar; cada transición comprobada con timeout de 2000 ms. Sin datos de producción. Evidencias 84_foco-mcp_{antes|despues}_{desktop|mobile}_{light|dark}.png.

El script r80-local-fixture solo permite la base ttd_r80. El recorrido live requiere R80_LIVE_API y se ejecuta con un worker para que los cuatro proyectos no compartan una sesión simultáneamente. La credencial efímera se revoca al terminar; nunca se escribe en evidencias.
