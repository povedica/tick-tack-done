# Plan por fases (espejo de la sección 19 de la spec)

Usa este plan para acotar cada tarea de Cursor: cita la fase y los RF-xx.

## MVP / fase 1 (4-6 semanas de agente)

Estado al tag `phase-1.2`: puntos 1 y 2 cerrados en la rama `feat/core-tasks`. El siguiente corte es el punto 3.

1. **Base**: monorepo, CI, Docker Compose, modelo de datos completo (sección 5), migraciones, seed.
2. **Tareas núcleo**: CRUD + checklist + subtareas (RF-201–210), listas/carpetas/secciones
   (RF-301–306), etiquetas (RF-401–403), prioridades (RF-501–503).
3. **Tiempo**: fechas y zonas (RF-601–605), recurrencias (RF-701–706), recordatorios push+email
   con scheduler fiable (RF-801–808).
4. **Captura**: quick add con NLP ES/EN (RF-101–107), email-to-task (RF-105), share target (RF-106).
5. **Hábitos** con recordatorios y estadísticas (RF-1301–1305).
6. **Smart lists + filtros** con evaluación en backend (RF-901–904); vista lista (RF-1001);
   búsqueda + paleta (RF-1501–1502).
7. **Acceso de agentes**: API v1 completa de esos recursos + PAT con scopes (RF-2002) +
   servidor MCP (RF-2001). Criterio de aceptación 4.
8. **Offline básico**: cola de mutaciones con Idempotency-Key (RF-13010; criterio 5).
9. **Export JSON** versionado (RF-1703/1705) + backup diario con restauración probada (RF-1704).

## V1

Kanban/Timeline/Eisenhower (RF-1002–1004) · calendario completo + iCal + Google Calendar lectura
(RF-1101–1105) · bot de Telegram (RF-2003) · Google Drive (RF-2005) · notas (RF-1401–1403) ·
dashboard KPIs (RF-2101–2105) · reporte semanal (RF-2201–2204) · revisiones asistidas
(RF-2301–2303) · webhooks + automatizaciones (sección 11) · sync en tiempo real (RF-13013) ·
capa `/open/v1` (10.4) · import CSV · 2FA.

## V2

Colaboración (RF-1801–1805) · Pomodoro/Focus (RF-1201–1206) · plugins (sección 12) ·
widgets nativos/apps móviles · logros (RF-1602) · WIP limits · Google Calendar two-way.
