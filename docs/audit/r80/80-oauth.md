# TTD-AUD-80 — OAuth

- Reproducción previa: unitarias 2 fallos; integración 4 fallos (paralelo 200/400, revocación inmediata, sin evento de reuso, caída de BD = 500).
- Corrección: relectura dentro del advisory lock, replay cifrado durable durante 60 s; caducidad anterior limitada a 120 s sin ampliarla; familia revocada a 61 s; evento y log sin secretos; 503 con Retry-After: 2.
- PostgreSQL local aislado, Node 26: 4 unitarias y 6 integraciones correctas. Bajada y reaplicación de 20261022085833 verificadas con Prisma db execute.
- Pendiente externo: staging con cliente MCP real y reinicio del proceso. No se afirma verificado un despliegue; smoke-oauth.sh requiere credenciales sintéticas explícitas y no imprime secretos.
- No se ha tocado UI; capturas no aplican a este punto.
