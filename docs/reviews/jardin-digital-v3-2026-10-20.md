# Jardín digital v3 — implementación y verificación

Alcance: dashboard visual v3 facilitado el 20 de octubre de 2026. Sustituye la representación v2 pendiente. Implementa RF-2101–2104; reutiliza RF-1301/1303 para hábitos, RF-1204 para foco y el estado actual de la puntuación, sin modificar su algoritmo ni el chip global.

## Representación

- Cinco tarjetas de cifras: puntuación, racha de uso, completadas hoy/7 días, vencidas/activas y próximas 7 días.
- Cuatro tarjetas de actividad: hábitos hoy con progreso y nombres pendientes, foco, total de cuentas atrás activas y la más próxima, agenda sincronizada de hasta tres eventos.
- Mapa: cinco listas por pendientes, barras con vencidas incluidas; cinco etiquetas con tamaño proporcional al recuento único de tareas activas.
- Listas y etiquetas abren un modal común a «Ver todas» y pulsar un elemento. Selección visible, Escape, cierre exterior, X, ciclo de foco y retorno al disparador. Hoja adaptada al móvil.
- Personalizar guarda la visibilidad de todas las tarjetas. Orden canónico v3; los layouts anteriores se convierten sin duplicar proyectos/completadas. Un layout vacío sigue vacío.
- Textos ES/EN en mensajes del Jardín. La información principal está visible; solo la metodología es plegable.

## Datos y límites comprobados

- Total activo calculado en el backend, sin sumar etiquetas (multietiqueta).
- Hábitos diarios respetan días programados y objetivos; los semanales no se convierten en obligaciones diarias. No se felicita 0/0 ni datos incompletos.
- El modelo no tiene objetivo de foco: solo tiempo y sesión activa. La UI soporta progreso si la API incorpora un objetivo positivo.
- Sin fecha de revisión de proyectos: no se muestran «días sin revisar». Se reutiliza la señal existente de proyectos abiertos sin pendientes o sin cambios en tareas durante 30 días.
- Sin historial de asignaciones de etiquetas: no se afirma «nunca usada». Una tarea actualmente vinculada y creada/completada en 90 días prueba actividad; sin esa evidencia, el uso reciente es desconocido. Los chips punteados solo se muestran con un estado de inactividad conocido; no se fabrica ese estado por cero vínculos actuales.
- Cuentas atrás consume el listado completo de no archivadas sin el anterior horizonte de 365 días. El número principal incluye todas las activas.
- Calendarios reutiliza eventos sincronizados visibles, excluye cancelados y deduplica UID compartido y fecha de ocurrencia antes de contar y limitar la muestra. Sin sincronización nueva.
- Se distinguen carga, error, desconocido, desactivado y cero. Los errores de permisos se presentan como no disponible/desactivado.

## Verificación

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: correctos.
- `pnpm test:integration`: 101 pruebas correctas.
- Playwright v3: seis pruebas correctas, incluidos tamaños 1440 y 390 px, modales, foco, retorno, cierre exterior, estados, motivación y personalización.
- Verificación visual adicional con los datos reales de `http://localhost:5173/dashboard`, escritorio y móvil de 390 px. Sin desbordamiento horizontal; top 5 y señal agregada visibles.
- OpenAPI y tipos SDK regenerados; no se cambia esquema Prisma ni catálogo de eventos.
