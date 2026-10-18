# Plan por fases (espejo de la sección 19 de la spec)

Usa este plan para acotar cada tarea de Cursor: cita la fase y los RF-xx.

## MVP / fase 1 (4-6 semanas de agente)

Estado en `main` (18 oct 2026): la fase 1 está cerrada en la PR #11, tag `phase-1`. La web de la spec de UI entró antes, en la PR #10. No está desplegada: falta `BACKUP_REMOTE` y el acceso al servidor. La PR #9 se cerró sin merge y no se resucita. V1 y V2 están en `feat/v1-v2`, sin merge.

1. **Base**: monorepo, CI, Docker Compose, modelo de datos completo (sección 5), migraciones, seed.
2. **Tareas núcleo**: CRUD + checklist + subtareas (RF-201–210), listas/carpetas/secciones
   (RF-301–306), etiquetas (RF-401–403), prioridades (RF-501–503).
3. **Tiempo**: fechas y zonas (RF-601–605), recurrencias (RF-701–706), recordatorios push+email
   con scheduler fiable (RF-801–808).
4. **Captura**: quick add con NLP ES/EN (RF-101–107), email-to-task (RF-105), share target (RF-106).
5. **Hábitos** con recordatorios y estadísticas (RF-1301–1305). Hecho y mergeado (PR #4, tag `phase-1.5`).
6. **Smart lists + filtros** con evaluación en backend (RF-901–904); vista lista (RF-1001);
   búsqueda + paleta (RF-1501–1502). Hecho y mergeado (PR #7, tag `phase-1.6`).
7. **Acceso de agentes**: API v1 completa de esos recursos + PAT con scopes (RF-2002) +
   servidor MCP (RF-2001). Criterio de aceptación 4. Hecho y mergeado (PR #8, tag `phase-1.7`).
   Incluye el límite de 1000 peticiones / 15 min por token.
8. **Offline básico**: cola de mutaciones con Idempotency-Key (RF-13010; criterio 5). Hecho y en la PR #11, con delta sync (RF-13011), last-write-wins (RF-13012) y tombstones a 90 días (RF-13014).
9. **Export JSON** versionado (RF-1703/1705) + backup diario con restauración probada (RF-1704). Hecho y en la PR #11. El destino remoto sigue siendo `BACKUP_REMOTE`; sin ese valor el archivo no sale de la máquina.

## V1

Hecho en `feat/v1-v2` (18 oct 2026), tag `phase-v1`. Telegram, Google Calendar en lectura y Google Drive quedan desplegables a falta del secreto. RF-1701 no entra.

Kanban/Timeline/Eisenhower (RF-1002–1004) · calendario completo + iCal + Google Calendar lectura
(RF-1101–1105) · bot de Telegram (RF-2003) · Google Drive (RF-2005) · notas (RF-1401–1403) ·
dashboard KPIs (RF-2101–2105) · reporte semanal (RF-2201–2204) · revisiones asistidas
(RF-2301–2303) · webhooks + automatizaciones (sección 11) · sync en tiempo real (RF-13013) ·
capa `/open/v1` (10.4) · import CSV · 2FA.

## V2

Hecho en el mismo corte, tag `phase-v2`. La escritura de Google Calendar no llama a Google sin `GOOGLE_REFRESH_TOKEN`. Apps nativas y widgets de iOS/Android no entran.

Colaboración (RF-1801–1805) · Pomodoro/Focus (RF-1201–1206) · plugins (sección 12) ·
widgets nativos/apps móviles · logros (RF-1602) · WIP limits · Google Calendar two-way.
