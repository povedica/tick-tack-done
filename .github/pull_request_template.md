## Qué cambia

<!-- Una o dos frases. Una issue, una PR. -->

## Issue

<!-- Obligatorio (lo comprueba backlog-sync). Usa «Closes #N» si la PR termina la issue
     y «Refs #N» si solo avanza. Para PR de dependencias o CI sin issue: etiqueta sin-backlog. -->

Closes #

## Backlog

- [ ] La issue cumplía la DoR (`docs/backlog/DOR.md`) cuando la reclamé.
- [ ] Agente (`<ejecutor>-<rol>-N`): <!-- p. ej. codex-frontend-1 -->
- [ ] Rama y Zona rellenadas; ninguna otra tarjeta en curso, pausada o en
      revisión comparte mi Zona (y nada más en prisma-migrations).
- [ ] Pregunté por las tarjetas pausadas antes de coger esta.
- [ ] Cambia una decisión: he actualizado `docs/backlog/DECISIONES.md`.

## Definition of Done

- [ ] Cumplo `docs/backlog/DOD.md`.

## Mejora (opcional, no bloquea)

<!-- Si esta entrega deja algo obvio para la DoR o la DoD, escríbelo aquí. Si no, borra la sección. -->

## Pruebas

- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde.
- [ ] Integración o e2e si toca la API o la UI (indica cuáles).
- [ ] CHANGELOG actualizado (o etiqueta skip-changelog si no aplica).

## Verificación en producción (después del despliegue, opcional)

- [ ] /api/v1/health publica un commit que contiene esta PR.
- [ ] Prueba hecha en producción: <!-- qué se probó y con qué cuenta -->
