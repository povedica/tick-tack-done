# Definition of Ready (DoR)

Una issue pasa de **Ideas** a **Listo para hacer** solo si cumple todo.
Si un punto falla, se queda en Ideas.

- [ ] La spec completa vive en GitHub: cuerpo de la issue o documento del
      repo enlazado. No depende de ficheros fuera del repositorio.
- [ ] Un solo agente puede terminarla en **una PR**, del tamaño de su
      contexto. Mejor una PR algo más grande que una cadena en serie.
- [ ] Es paralelizable, o su bloqueo está declarado con *blocked by*
      nativo de GitHub (y entonces no está lista hasta que se fusione).
- [ ] Tiene **Zona** (api, web, domain, sdk, prisma-migrations, infra,
      android, docs).
- [ ] Tiene criterios de aceptación verificables en el cuerpo.
- [ ] Si toca UI, el mockup está aprobado por Pablo (enlazado en la issue).
- [ ] Si es funcionalidad nueva, incluye paridad MCP/API, o declara
      explícitamente que no aplica y por qué.
- [ ] No espera decisión de producto, o la decisión figura como «Decidida»
      en `docs/backlog/DECISIONES.md`.

Quién la marca: quien escribe la spec. Pablo puede devolverla a Ideas.
Si una entrega demuestra que falta o sobra un punto, se propone el cambio
en ese momento; con el sí de Pablo se edita aquí y la siguiente issue ya
lo aplica.
