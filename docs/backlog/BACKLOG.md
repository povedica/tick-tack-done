# Backlog de ttd

<!-- backlog:inicio — bloque generado por scripts/backlog/generar-backlog.sh desde el Project «ttd · backlog». No editar a mano: cambia el Project y regenera. -->

_Semilla del 29/10/2026 (hora de Madrid), antes de crear las issues. Tras la carga, la columna # enlaza a la issue._

| ID | # | Título | Estado | Prioridad | Área | Tipo | Referencia | Siguiente paso |
|---|---|---|---|---|---|---|---|---|
| BKL-019 | — | Hábitos: ajustes tras la revisión r2 | Idea | P2 | hábitos | bug | revision-2026-10-27.md §2 | Escribir el prompt de ajuste. |
| BKL-022 | — | Bugs del dogfooding TTD-AUD-136..144 | Idea | P2 | MCP/API | bug | lista de desarrollo en ttd | Triar: abrir una issue por bug confirmado y cerrar los ya resueltos. |
| BKL-014 | — | App nativa: TWA para Play y Capacitor para iOS | Idea | P3 | nativo/PWA | feature | perf-vista-anual/PWA-PUSH.md | Decidir tiendas tras BKL-013. |
| BKL-021 | — | Plan del día: mejoras P2 y P3 | Idea | P3 | plan del día | feature | plan-del-dia-mejoras.md §8 | Revisar la lista contra el código actual. |
| BKL-009 | — | Compartir listas por MCP + scope tasks:create + Playwright en CI | Decidir | P2 | MCP/API | feature | paquete-compartir-listas-scope/SPEC.md | Tomar D-1…D-6 del paquete y lanzar las 3 PRs. |
| BKL-010 | — | Complemento de correo para Outlook y Gmail | Decidir | P2 | correo | feature | complemento-correo/SPEC.md · complemento-correo/NOTAS.md | Decidir D-1, D-2, D-4 y D-8 y comprobar si la cuenta de trabajo permite add-ins personalizados; luego PRs W-a…W-g. |
| BKL-012 | — | Arquitectura del calendario: fases F4–F10 | Decidir | P2 | calendario | decisión | arquitectura-calendario/ARQUITECTURA.md · PROMPT-fases.md | Revisión del techlead y respuesta a §8 (preguntas 1–5 son las que bloquean). |
| BKL-013 | — | Avisos push en producción (claves VAPID) | Decidir | P2 | nativo/PWA | deuda | perf-vista-anual/PWA-PUSH.md | Generar las claves VAPID y añadirlas a la configuración de producción; probar un recordatorio. |
| BKL-016 | — | Harness SDLC de especialistas | Decidir | P2 | repo | deuda | repo-publico/HARNESS.md | Aprobar la Ola 1 (incluye este backlog: skill `backlog-github-projects` y plantillas). |
| BKL-017 | — | Versionado SemVer, CHANGELOG con versiones y tags | Decidir | P2 | repo | deuda | repo-publico/VERSIONADO.md · CHANGELOG.propuesto.md · TAGS.sh | Aprobar el esquema; los tags van después de BKL-018. |
| BKL-018 | — | Reescritura del historial y protección de main | Decidir | P2 | repo | decisión | repo-publico/PLAN-LIMPIEZA.md · repo-publico/AUDITORIA.md | Elegir opción y ventana sin agentes; cerrar o fusionar antes las PRs abiertas. |
| BKL-023 | — | Google OAuth en producción (TTD-AUD-47) | Decidir | P2 | infra | deuda | addendum-google-mcp.md | Hacerlo en Google Cloud Console y probar con una cuenta que no sea tester. |
| BKL-015 | — | «Mi semana»: revisión semanal de una hora | Decidir | P3 | plan del día | feature | revision-semanal/IDEAS.md | Responder las 6 preguntas y pedir bocetos. |
| BKL-020 | — | Plan del día: desviaciones respecto al boceto | Decidir | P3 | plan del día | decisión | revision-2026-10-27.md §3 | Decidir y, si procede, prompt corto. |
| BKL-024 | — | Dependabot: 6 PRs abiertas | Decidir | P3 | infra | deuda | PRs #39–#43 y #79 | Fusionar las menores y probar las mayores en una rama. |
| BKL-002 | — | Filtros: pulido del modal de edición | Spec lista | P1 | filtros | feature | filtros/PROMPT-pulido-modal.md · PR #96 | Pasar el prompt al agente: 4 ramas hijas de `feat/filters-f1-api`. |
| BKL-008 | — | Menú «⋯» del tablero de proyectos sin fondo | Spec lista | P1 | proyectos | bug | perf-vista-anual/KANBAN-fix.md | Pasar el fix al agente (cambio pequeño, solo web). |
| BKL-003 | — | Filtros F2–F5: revisar cobertura de la spec | Spec lista | P2 | filtros | feature | filtros/SPEC.md · filtros/PROMPT.md | Revisar la #96 contra la spec y abrir las PRs restantes. |
| BKL-011 | — | Rendimiento F2–F4: endpoint del año, presupuestos en CI y coste por petición | Spec lista | P2 | calendario | deuda | perf-vista-anual/SPEC.md §4–6 | Esperar el resultado de F1 (BKL-004) y la revisión del techlead. |
| BKL-001 | — | Filtros F1: API, lista, editor modal y vista | En Codex/PR | P1 | filtros | feature | PR #96 · filtros/SPEC.md | Aplicar el pulido del modal (BKL-002) sobre esta rama, revisar y fusionar. |
| BKL-004 | — | Rendimiento F1: instrumentación y línea base | En Codex/PR | P1 | calendario | deuda | PR #95 · perf-vista-anual/SPEC.md §3 | Revisar y fusionar; publicar la línea base. |
| BKL-005 | — | Rendimiento F0: hotfix de la vista anual | Fusionado | P1 | calendario | bug | PR #92 · perf-vista-anual/INFORME.md | Desplegar y medir en un móvil real (objetivo: año visible ≤ 1,2 s). |
| BKL-006 | — | Restablecer la contraseña desde el login (+ reCAPTCHA v3) | Fusionado | P1 | infra | feature | PR #93 · reset-password/SPEC.md | Desplegar con las variables de reCAPTCHA y de envío de correo; probar el flujo completo con una cuenta de prueba. |
| BKL-007 | — | Limpieza del árbol del repo | Fusionado | P3 | repo | deuda | PR #94 · repo-publico/PLAN-LIMPIEZA.md | Consolidar las configs de Playwright (QA) y seguir con BKL-018. |

<!-- backlog:fin -->

Reglas: `docs/backlog/PROTOCOLO-BACKLOG.md`. Decisiones: `docs/backlog/DECISIONES.md`.
