# Protocolo del backlog de ttd

Destino en el repo: `docs/backlog/PROTOCOLO-BACKLOG.md`. Lo aplican los
agentes (Cursor, Codex, Grok Bot) y Pablo. Los comandos están en la skill
`.cursor/skills/backlog-github-projects/SKILL.md`.

## 1. Fuentes de verdad

| Pieza | Qué es | Quién la escribe |
|---|---|---|
| **Project «ttd · backlog»** | Estado vivo. Si hay discrepancia, manda el Project | Agentes con scope `project`, workflows y Pablo |
| **Issues `BKL-NNN`** | Una unidad de trabajo que un agente puede terminar en una PR | Agente o coordinador; Pablo |
| **`docs/backlog/DECISIONES.md`** | Registro de decisiones: pregunta, opciones, recomendación, estado, fecha | La PR que aplica la decisión. Solo Pablo decide |

El campo nativo de GitHub se llama `Status` y no se puede renombrar. En este
protocolo, «Estado» es ese campo con seis opciones en español. No se crea
un segundo campo para sustituirlo.

IDs estables: `BKL-NNN` para el trabajo y `DEC-NNN` para las decisiones.
No se reutilizan.

## 2. Paralelo primero

- Cada issue la coge **un** agente, en **su** worktree, y la cierra con
  **una** PR.
- Se prefiere una PR un poco más grande a una cadena de issues que deban
  hacerse en orden. Si dos trozos no pueden avanzar a la vez (tocan los
  mismos ficheros, o uno necesita el merge del otro), se juntan en una PR.
- Si un trabajo no cabe en una PR, se parte en piezas que no se ordenen
  entre sí. Las dependencias inevitables se marcan con *blocked by* de
  GitHub; el hijo no está «Listo para hacer» hasta que el padre se fusiona.
- Las épicas son seguimiento (sub-issues). No son trabajo de un agente.
- Dos agentes no pican a la vez en la misma **Zona**. La zona más delicada
  es `prisma-migrations` (una sola migración en vuelo). También chocan
  `domain` compartido y el `pnpm-lock.yaml` si dos PRs mueven dependencias.

## 3. Estados

| Estado | Entra cuando | Sale cuando |
|---|---|---|
| Ideas | Se apunta un trabajo o falta una decisión de Pablo | Cumple `DOR.md`, o se descarta |
| Listo para hacer | Cumple `DOR.md` | Un agente la reclama |
| En curso | Un agente la reclamó (Agente + Rama) y trabaja en su worktree | Abre la PR de revisión, o se pausa |
| Pausada | Hay un motivo justificado, escrito con detalle en un comentario | Pablo decide retomarla (vuelve a En curso) o descartarla |
| En revisión | Hay PR abierta lista para revisar | Cumple `DOD.md` y se fusiona, o vuelve a En curso |
| Hecho | Cumple `DOD.md`, o Pablo la descarta y se cierra | — |

- **DoR:** `docs/backlog/DOR.md`. **DoD:** `docs/backlog/DOD.md`.
- **Sin WIP.** Los agentes pueden crecer o decrecer; el límite real es la
  capacidad de revisión de Pablo.
- **Una Zona, un agente.** En `prisma-migrations`, una migración en vuelo.
  Ocupan Zona las tarjetas en En curso, Pausada y En revisión.
- **Pausa:** comentario obligatorio con motivo, estado de la rama y
  condición para retomar. La tarjeta conserva Agente, Rama y Zona. Antes
  de coger algo nuevo, el agente pregunta a Pablo si se retoma lo pausado.

No hay un tope global de tarjetas en «En curso». El tope es una por Zona.

### 3.1. Comentario de decisión

Tras cada avance relevante, publica un comentario de decisión en la issue con
`docs/backlog/plantillas/comentario-decision.md` (marcador `<!-- ttd-decision -->`).
Registra también las decisiones de Pablo en el chat, con fecha y decisión.

Avances: reclamar, decidir diseño o alcance, cambiar el plan, pausar, retomar,
pasar a En revisión, responder a una revisión de Pablo y cerrar (fusionada,
descartada o «not planned»). Un comentario breve por avance, sin editar los
anteriores salvo errores de hecho, sin logs ni código largo.

Al retomar una tarea pausada, en revisión o abandonada, publica un comentario
con Fase «Retomada»: quién retoma, commit/estado de partida, qué falta y plan.
Devuelve la tarjeta a «En curso» en Project 2 y actualiza Agente si cambia.

En revisión resume qué está hecho, qué debe mirar Pablo y enlaza la PR.
La pausa usa la misma plantilla con Fase «Pausada» y mantiene motivo detallado,
rama/último commit y condición para retomar en Motivo e Impacto / siguiente paso.
No sustituye a `DECISIONES.md`: las decisiones de producto `DEC-NNN` siguen
allí y solo Pablo las decide. Si el token no permite comentar, deja el texto
en la PR e indica explícitamente la limitación.

## 4. Cómo se reclama una issue

Sin saltarse pasos:

1. Si hay algo en Pausada, preguntar a Pablo si se retoma.
2. En la vista «Siguiente», elegir una tarjeta en Listo para hacer cuya
   Zona no esté ocupada (En curso, Pausada o En revisión).
3. Moverla a En curso.
4. Rellenar Agente (`<ejecutor>-<rol>-N`) y Rama (el nombre de la rama).
5. Crear el worktree en `../worktrees-ttd/<rama>` (al lado del checkout
   principal): `git worktree add "../worktrees-ttd/<rama>" -b <rama> origin/main`.
6. Abrir enseguida una PR en borrador. La descripción empieza por
   `Closes #N`.
7. PR lista para revisar → En revisión. Para cerrar, comprobar `DOD.md`.

### Adoptar una PR que ya existía

Si la rama y la PR son anteriores a este flujo (Development no muestra la
PR, Agente está vacío o Rama se rellenó a mano):

1. Añadir `Closes #N` como primera línea de la descripción.
2. Rellenar Agente y Rama en el Project.

El check de `backlog-sync`, al ver `Closes`, `Fixes` o `Resolves`:

- escribe la Rama con la rama de la PR;
- avisa en la PR si Agente está vacío;
- si la tarjeta estaba en Listo para hacer, la pasa a En curso.

Solo falla el check si falta `Closes #N`. Lo demás son avisos. Una PR
antigua queda cubierta en cuanto se edita la descripción.

## 5. Reglas por evento

| Evento | Project | Issue | Ficheros | Quién |
|---|---|---|---|---|
| Idea nueva | Item en Ideas, con Prioridad, Area, Tipo, Zona y Referencia | Issue `BKL-NNN` | — | Agente o Pablo |
| Necesita decisión | Se queda en Ideas | Etiqueta `decision-pendiente` | Fila `DEC-NNN` abierta en DECISIONES.md | Quien la detecta |
| Decisión tomada | A Listo para hacer, o se descarta | Quitar `decision-pendiente` | Fila «Decidida» en la PR que la aplica | Pablo decide; el agente registra |
| Cumple la definición de listo | Listo para hacer | — | — | Quien escribe la spec |
| Un agente empieza | En curso; Agente y Rama | Comentario de decisión de inicio | Worktree propio | Ese agente |
| PR abierta para revisar | En revisión | Comentario de decisión que resume el estado; PR empieza por `Closes #N` | — | Ese agente |
| PR ya existente, sin enlace | En curso si estaba en Listo para hacer; si no, no se mueve | Se añade `Closes #N` y se rellenan Agente y Rama | — | Quien la adopta; el check escribe la Rama |
| PR fusionada | Hecho (automático) | Se cierra; comentario de decisión final | — | Workflow; el agente revisa |
| Descartada | Hecho | Cerrar como «not planned» con comentario de decisión y motivo | Fila de DECISIONES a Decidida si aplicaba | Pablo |
| Se pausa | Pausada | Comentario de decisión obligatorio: motivo, rama/commit, condición para retomar | — | Ese agente |
| Se retoma (pausada, en revisión o abandonada) | En curso; actualizar Agente si cambia | Comentario de decisión «Retomada»: quién, commit/estado, qué falta y plan | — | Ese agente, con autorización de Pablo |
| Respuesta a revisión de Pablo | En curso mientras trabaja | Comentario de decisión; si retoma, aplicar la fila anterior | — | Ese agente |
| Mejora obvia tras una entrega (opcional) | — | — | `APRENDIZAJES.md` y, con el sí de Pablo, `DOR.md`/`DOD.md` | Agente o Pablo propone; **Pablo aprueba** |

## 6. Quién actualiza qué

- **Agentes que implementan (Codex, Cursor):** miran el tablero, reclaman,
  implementan en un worktree, publican comentarios de decisión en la issue, enlazan la issue y actualizan DECISIONES.md
  si aplican una decisión. Si su token no tiene scope `project`, lo dejan
  escrito en la PR para que lo ejecute Pablo.
- **Grok Bot (ticktackdone):** propone movimientos, reagrupa el trabajo en
  piezas paralelas y prepara decisiones. No decide producto.
- **Pablo:** decide, prioriza, aprueba PRs y descarta.
- **Workflows:** al abrir o editar una PR con `Closes`/`Fixes`/`Resolves`,
  backlog-sync escribe la Rama, avisa si Agente está vacío y pasa de
  Listo para hacer a En curso. El check solo falla si falta `Closes #N`.
  Al fusionar una PR que cierra la issue, Status = Hecho.

## 7. Higiene

- Sin datos personales, de familia ni nombres de clientes en issues, PRs
  o ficheros del backlog.
- Una issue por unidad que un agente pueda fusionar solo. Las épicas se
  parten en sub-issues paralelas (o en una sola PR si no admiten paralelo).

## 8. Mejora continua

- Si una entrega deja algo obvio, la DoR o la DoD se actualizan en ese
  momento, con el sí de Pablo. La siguiente entrega ya aplica la mejora.
- No hay revisión periódica.
- Anotar un aprendizaje es opcional y nunca bloquea. Un fix o un chore
  sin nada que aprender se cierra sin más. La CI no lo comprueba.
