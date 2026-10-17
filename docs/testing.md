# Testing

Frameworks elegidos por defecto (el harness los fija; la spec no los fijaba):

- Vitest (unitarios en todo el monorepo, incluida la API NestJS).
- Supertest para integración de API contra Postgres/Redis reales.
- Playwright para e2e de la PWA.

Pirámide de la sección 16: cobertura >80% en `packages/domain` (recurrencias, filtros, NLP);
integración por cada recurso de la API; e2e solo de flujos críticos
(crear→recordar→completar; offline→reconectar→converge sin duplicados).

Los tests citan su RF: `it('RF-706: …')`.
