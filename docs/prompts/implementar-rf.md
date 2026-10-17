# Plantilla: implementar un RF

```
Implementa <RF-XXX> de la especificación (docs/spec/ticktick-clone-spec-v1.1.md, sección <X.Y>).

Alcance: <qué entra y qué NO entra>.
Fase: <MVP/V1/V2>.

Antes de escribir código:
1. Lee AGENTS.md y las reglas aplicables en .cursor/rules (arquitectura, módulo tocado, testing).
2. Lee la sección de la spec y el modelo de datos afectado (sección 5).
3. Dime el plan: archivos que crearás/tocarás y eventos de dominio que publicarás.

Requisitos de entrega:
- Lógica de negocio pura en packages/domain si aplica (sin dependencias de framework).
- Endpoints con OpenAPI completo y scopes declarados; OpenAPI regenerado sin diff.
- Tests que citan el RF en su nombre; casos límite de la spec.
- pnpm lint, typecheck y test en verde.
- Docs en español, código en inglés.
```
