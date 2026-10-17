# Plantilla: revisión antes de PR

```
Revisa los cambios actuales como si fueras el reviewer. Comprueba y reporta:

1. Spec: ¿los RF-xx citados quedan cubiertos? ¿algo fuera de scope?
2. Arquitectura: ¿algún módulo importando a otro? ¿eventos publicados vía outbox?
   ¿lógica de negocio fuera de packages/domain?
3. API: OpenAPI sin diff, scopes declarados, códigos de error estables, cursor + idempotencia.
4. Seguridad: sin secretos, validación en bordes, auditoría por token si aplica.
5. Tests: citan RF, cubren casos límite de la spec; cobertura de domain >80%.
6. Convenciones: español en docs/UI, inglés en código, conventional commits.
7. `pnpm lint && pnpm typecheck && pnpm test` en verde.
```
