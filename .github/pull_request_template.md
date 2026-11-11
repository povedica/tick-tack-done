## Qué cambia

<!-- Una o dos frases. Una feature, una PR. -->

## Issue

<!-- Obligatorio (lo comprueba backlog-sync). Usa «Closes #N» si la PR termina la issue
     y «Refs #N» si solo avanza. Para PR de dependencias o CI sin issue: etiqueta sin-backlog. -->

Refs #

## Backlog

- [ ] La issue está en el Project «ttd · backlog» con Estado «En Codex/PR» (máximo 3 a la vez).
- [ ] Cambia una decisión: he actualizado `docs/backlog/DECISIONES.md`.
- [ ] No he editado a mano el bloque generado de `docs/backlog/BACKLOG.md`.

## Pruebas

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde.
- [ ] Integración o e2e si toca la API o la UI (indica cuáles).
- [ ] CHANGELOG actualizado (o etiqueta skip-changelog si no aplica).

## Verificación en producción (después del despliegue)

- [ ] /api/v1/health publica un commit que contiene esta PR.
- [ ] Prueba hecha en producción: <!-- qué se probó y con qué cuenta de prueba -->
- [ ] **verificado en producción** → issue a «Desplegado» con etiqueta verificado-prod.
