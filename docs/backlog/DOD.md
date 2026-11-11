# Definition of Done (DoD)

Una issue pasa de **En revisión** a **Hecho** solo si cumple todo.
Fusionar no basta si falta un punto.

- [ ] CI en verde: `pnpm lint`, `pnpm typecheck`, `pnpm test`, y
      integración o e2e si toca API o UI.
- [ ] Los tests cubren los criterios de aceptación (o la PR explica por
      qué uno no aplica).
- [ ] Documentación y harness al día si cambian (AGENTS.md, protocolo,
      skill, CHANGELOG o `skip-changelog`).
- [ ] PR fusionada en `main`; la issue se cierra con «Closes #N».
- [ ] Tablero correcto: columna Hecho, Agente y Rama rellenados, Zona
      correcta.
- [ ] Si se aplicó una decisión, `DECISIONES.md` actualizado en la misma PR.

Opcional, nunca bloquea: si la entrega dejó un aprendizaje o una mejora
obvia para la DoR o la DoD, anótala en `APRENDIZAJES.md` y propón el
cambio a Pablo. Un fix o un chore sin nada que aprender se cierra sin más.

La verificación en producción (`/api/v1/health`, etiqueta `verificado-prod`)
es bienvenida y no es una columna.
