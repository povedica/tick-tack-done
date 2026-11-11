# Comentario de decisión

```markdown
<!-- ttd-decision -->
## Decisión

- **Agente:** `<ejecutor>-<rol>-N`
- **Fase:** Ideas | Listo para hacer | En curso | Pausada | Retomada | En revisión | Hecho
- **Decisión:** …
- **Motivo:** …
- **Alternativas descartadas:** … <!-- opcional; «ninguna» si no aplica -->
- **Impacto / siguiente paso:** …
- **Enlaces:** PR #N, commit `sha`, `DECISIONES.md` si aplica
```

- Publica un comentario por avance relevante en la issue, con el marcador exacto.
- Al reclamar basta quién la toma, rama y qué hará.
- Comenta decisiones de diseño o alcance, cambios de plan y respuestas a revisión de Pablo.
- Transcribe también lo decidido por Pablo en el chat, con fecha y decisión.
- Pausa: Fase «Pausada»; Motivo e Impacto deben incluir motivo detallado,
  nombre de rama, último commit y condición para retomar. Sin comentario no hay pausa.
- Retomar (pausada, en revisión o abandonada): Fase «Retomada», quién retoma,
  commit/estado de partida, qué falta y plan; vuelve a «En curso» en Project 2
  y actualiza Agente si cambia.
- En revisión: resume qué está hecho, qué debe mirar Pablo y enlaza la PR.
- Cierre (fusionada, descartada o «not planned»): registra resultado y motivo.
- Sé breve, sin logs ni código largo; no edites comentarios salvo errores de hecho.
- No sustituye a `DECISIONES.md`: solo Pablo decide producto; enlaza la fila `DEC-NNN`.
- Si el token no permite comentar, deja el texto en la PR y explica la limitación.
