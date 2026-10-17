# Arquitectura

Resumen operativo de la sección 4 de la spec. En caso de duda, la spec manda.

```
PWA (React) / Telegram / agentes MCP ──HTTPS──▶ Caddy ──▶ API NestJS (+MCP) ──▶ PostgreSQL
                                                    │
                                                    ├─▶ Redis/BullMQ: bus de eventos, webhooks,
                                                    │   automatizaciones, scheduler (recurrencias
                                                    │   y recordatorios, RF-808)
                                                    └─▶ volumen local de adjuntos (S3 opcional)
```

Reglas duras: módulos aislados por eventos; scheduler único materializador; integraciones
externas solo vía API/eventos; dominio puro en `packages/domain`.
