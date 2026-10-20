# Cierre de hallazgos de auditoría UI/UX v2

Fuente: `docs/spec/done/auditoria-ui-ux-tick-tack-done-v2-2026-10-20-15e9c200.md`.
Base: `a7e4d31`, posterior al merge `ef89694` de la PR #51.

## Alcance

Verificar cada ID y corregir los incumplimientos restantes en esta PR.
Priorizar coherencia de vencidas, recurrencias, integridad del editor y navegación móvil.
Requisitos relacionados: RF-702, RF-704, RF-706, RF-1102, RF-2101,
RF-2102 y RF-2012 de la spec específica de recurrencia MCP.
Se conserva el contrato REST/MCP por defecto; la PWA solicita avance futuro
y materialización inmediata.

## Pendientes confirmados al iniciar

- DAT-1: el raíl cuenta mediante `listTasks(overdue: true)` mientras Jardín y
  Revisión consumen el helper SQL canónico; falta unificar el consumidor.
- SEM-3: `HourGrid` sigue pintando un evento de varios días por cada columna,
  sin una barra continua.
- DET-5: limpieza solo al guardar; falta verificar lectura, idempotencia y
  preservación de contenido legítimo.
- Resto de IDs: revisión en curso; no se consideran cerrados por existir un
  comentario con el ID en el código.

## Validación

Producción abre `/login` en la sesión de navegador disponible. Las verificaciones
autenticadas y los datos reales requieren una sesión disponible. Se verificará
localmente con datos de prueba lo que permita el entorno.
