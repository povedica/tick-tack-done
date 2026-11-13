Closes #

- Agente (`<ejecutor>-<rol>-N`):
- Rama:

## Qué cambia

<!-- Una o dos frases. Una issue, una PR. -->

## Backlog

- [ ] La issue cumplía la DoR (`docs/backlog/DOR.md`) cuando la reclamé.
- [ ] Esta PR empieza por `Closes #N` y `#N` está abierta. Si ajusta una
      issue ya cerrada, cierra una issue `ajuste` nueva y no reabre la original.
- [ ] Agente y Rama de arriba están rellenados. Agente es `<ejecutor>-<rol>-N`.
- [ ] Zona rellenada; ninguna otra tarjeta en curso, pausada o en revisión
      comparte mi Zona (y nada más en prisma-migrations).
- [ ] Pregunté por las tarjetas pausadas antes de coger esta.
- [ ] Cambia una decisión: he actualizado `docs/backlog/DECISIONES.md`.
- [ ] He dejado en la issue los comentarios de decisión (plantilla
      `docs/backlog/plantillas/comentario-decision.md`). El de En revisión resume el estado.

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
