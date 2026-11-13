---
name: backlog-github-projects
description: Mantener el backlog de ttd en GitHub Projects («ttd · backlog») y DECISIONES.md. Úsala antes de empezar (mirar el tablero, reclamar, comprobar Zona), al abrir o fusionar una PR, cuando se toma o descarta una decisión, y cuando pregunten «¿qué hago ahora?».
---

# Backlog en GitHub Projects (ttd)

Fuente de verdad del estado: el Project «ttd · backlog» (n.º en la variable `PROJECT_NUMBER`).
`docs/backlog/DECISIONES.md` es el registro de decisiones. `docs/backlog/BACKLOG.md` es un
espejo generado; no edites su bloque a mano.
Reglas completas: `docs/backlog/PROTOCOLO-BACKLOG.md`.
DoR: `docs/backlog/DOR.md`. DoD: `docs/backlog/DOD.md`.

GitHub mantiene el campo nativo `Status` y no permite renombrarlo. «Estado»
es el concepto del protocolo: usa `Status` con las seis opciones en español
(Ideas, Listo para hacer, En curso, Pausada, En revisión, Hecho). Los comandos admiten
también un campo `Estado` existente; no crees otro campo para sustituir el nativo.

Para un Project de la cuenta autenticada se usa `--owner @me`: evita la consulta de
organizaciones de `gh project` y funciona con el PAT classic de scopes `repo` y `project`.

Este procedimiento lo comparten Cursor y Codex. La entrada para ambos está en `AGENTS.md`.

## Cuándo se activa

- Antes de escribir código: abrir el Project, mirar «Siguiente» y «En curso»,
  comprobar Zona y reclamar (En curso + Agente + Rama).
- Al abrir una PR (pasar a En revisión) y al fusionarla (Hecho).
- Tras cada avance relevante o decisión, también al retomar y responder a revisión.
- Cuando Pablo decide algo, descarta una idea o aparece una idea nueva.

## Límites

- No envíes mensajes ni comentarios a otras personas sin autorización de Pablo.
- Nunca decides producto: las decisiones son de Pablo. Tú propones opciones y recomendación.
- Nunca empieces una issue que no esté en «Listo para hacer», ni una cuya Zona
  ya esté ocupada en «En curso», «Pausada» o «En revisión».
- Si hay tarjetas en Pausada, pregunta a Pablo si se retoman antes de coger algo nuevo.
- Si tu token no tiene el scope `project`, no fuerces: deja los comandos en la PR.
- No trabajes sin una issue asignada. Si el pedido llega por el chat, crea la issue antes de tocar código.
- No reabras una issue cerrada para un ajuste. Crea `BKL-NNN · Ajuste de #N: <qué>` con la etiqueta `ajuste`, comentario en las dos, sub-issue o `Refs #N`, tarjeta y PR propias. Aunque sea una línea.

## Valores válidos

- Estado: Ideas · Listo para hacer · En curso · Pausada · En revisión · Hecho
- Prioridad: P1 · P2 · P3
- Area (sin tilde a propósito): calendario · filtros · correo · infra · repo · hábitos · plan del día · nativo/PWA · MCP/API · proyectos
- Tipo: feature · bug · decisión · deuda
- Zona (multiselección): api · web · domain · sdk · prisma-migrations · infra · android · docs
- Agente: texto `<ejecutor>-<rol>-N` (codex-frontend-1, cursor-api-2, grok-docs-1, pablo)
- Rama: texto (nombre de la rama del worktree)
- Referencia: texto (documento por nombre o PR)

## Pasos

### 0. Preparar variables (una vez por sesión)

```bash
OWNER=povedica; REPO=povedica/tick-tack-done; N="${PROJECT_NUMBER:?}"
PROJECT_OWNER="$OWNER"
IDENTITY=$(gh api user --jq .login)
if [ "$IDENTITY" = "$OWNER" ]; then PROJECT_OWNER="@me"; fi
PID=$(gh project view "$N" --owner "$PROJECT_OWNER" --format json --jq .id)
FIELDS=$(gh project field-list "$N" --owner "$PROJECT_OWNER" --format json --limit 100)
STATE_FIELD=$(jq -r 'if any(.fields[]; .name=="Estado") then "Estado" else "Status" end' <<<"$FIELDS")
fid() { jq -r --arg n "$1" '.fields[]|select(.name==$n)|.id' <<<"$FIELDS"; }
oid() { jq -r --arg n "$1" --arg o "$2" '.fields[]|select(.name==$n)|.options[]?|select(.name==$o)|.id' <<<"$FIELDS"; }
item_of() { gh project item-list "$N" --owner "$PROJECT_OWNER" --format json --limit 500 \
  --jq ".items[]|select(.content.type==\"Issue\" and .content.number==$1 and .content.repository==\"$REPO\")|.id"; }
set_sel() {
  local field="$2"
  [ "$field" != Estado ] || field="$STATE_FIELD"
  gh project item-edit --id "$(item_of "$1")" --project-id "$PID" --field-id "$(fid "$field")" --single-select-option-id "$(oid "$field" "$3")"
}
set_text() {
  gh project item-edit --id "$(item_of "$1")" --project-id "$PID" --field-id "$(fid "$2")" --text "$3"
}
```

`set_text` es el análogo de `set_sel` para campos de texto.

### 1. Idea nueva

```bash
NEXT=$(gh issue list --repo "$REPO" --state all --limit 1000 --json title --jq '[.[].title|(capture("^BKL-(?<n>[0-9]+)")? | .n | tonumber)]|(. // [])|((max // 0)+1)')
gh issue create --repo "$REPO" --title "$(printf 'BKL-%03d · Título' "$NEXT")" --body-file cuerpo.md \
  --label backlog --label area:<area> --label tipo:<tipo> --label prio:P3
gh project item-add "$N" --owner "$PROJECT_OWNER" --url <url>
set_sel <num> Estado Ideas; set_sel <num> Prioridad P3; set_sel <num> Area <area>; set_sel <num> Tipo <tipo>
```

### 2. Necesita decisión

Se queda en Ideas: `set_sel <num> Estado Ideas`, etiqueta `decision-pendiente` y fila nueva en `DECISIONES.md` (estado «Abierta») en la siguiente PR de docs.

### 3. Spec o prompt entregado → «Listo para hacer»

`set_sel <num> Estado "Listo para hacer"` y `gh project item-edit … --field-id "$(fid Referencia)" --text "<doc o PR>"`.

## Antes de reclamar (en orden)

1. Pausadas: `gh project item-list ... --jq '[.items[] | select((.status // .estado)=="Pausada")]'`.
   Si hay alguna, pregunta a Pablo si se retoma antes de seguir.
2. Zona: ninguna tarjeta en En curso, Pausada o En revisión comparte Zona
   con la tuya; en `prisma-migrations`, ninguna.
3. DoR: la tarjeta cumple `docs/backlog/DOR.md`.

## Reclamar

En este orden, sin saltarse pasos. `<rama>` es el nombre de la rama
(`chore/bkl-00N-breve`); el worktree queda en
`../worktrees-ttd/<rama>`, al lado del checkout principal.

```bash
set_sel <num> Estado "En curso"
set_text <num> Agente "cursor-docs-1"
set_text <num> Rama "chore/bkl-00N-breve"
git worktree add "../worktrees-ttd/<rama>" -b <rama> origin/main
# Tras el primer commit, la descripción empieza por Closes #N:
gh pr create --draft --title "…" --body "Closes #<num>"
```

Adoptar una PR que ya existía: añadir `Closes #N` como primera línea y
rellenar Agente y Rama. El check escribe la Rama con la rama de la PR y
avisa si Agente sigue vacío. No se toca la PR de otro agente.

`#N` tiene que existir y estar abierta. La única PR sin issue es la de
`dependabot[bot]` (`issue-link` en `ci-ok`). Un agente no usa `sin-backlog`.

### Ajuste post-cierre

Si la issue está cerrada y falta algo, no se reabre. Issue nueva
`BKL-NNN · Ajuste de #N: <qué>`, etiqueta `ajuste` (créala si no existe:
color `fbca04`, descripción «Ajuste posterior al cierre. Issue nueva enlazada
a la original; no reabre ni reutiliza la cerrada.»), comentario en las dos,
sub-issue o `Refs #N`, y su propia PR.

## Comentar una decisión

Tras cada avance relevante, publica un comentario de decisión en la issue con
`docs/backlog/plantillas/comentario-decision.md` (marcador `<!-- ttd-decision -->`).
Registra también las decisiones de Pablo en el chat, con fecha y decisión.

Usa la plantilla y guarda el texto en `comentario.md`:

```bash
gh issue comment <num> --repo "$REPO" --body-file comentario.md
```

Un comentario por avance (reclamar, diseño/alcance, cambio de plan, pausa,
retomar, revisión, respuesta a Pablo y cierre), sin editar anteriores salvo
errores de hecho. No sustituye a `DECISIONES.md`. Si no puedes comentar,
deja el texto en la PR e indica la limitación. Tras reclamar, publica el primero.

## Retomar

Al retomar una tarea pausada, en revisión o abandonada, publica un comentario
con Fase «Retomada»: quién retoma, commit/estado de partida, qué falta y plan.
Devuelve la tarjeta a «En curso» en Project 2 y actualiza Agente si cambia.

## Pausar

```bash
set_sel <num> Estado "Pausada"
gh issue comment <num> --repo "$REPO" --body-file comentario.md
```

`comentario.md` usa la plantilla, incluido `<!-- ttd-decision -->`, con
Fase «Pausada». Motivo e Impacto / siguiente paso incluyen motivo detallado,
rama/último commit y condición para retomar. Sin comentario no hay pausa.

## Cerrar

Comprueba `docs/backlog/DOD.md`. Si salió una mejora obvia, propónla a Pablo (opcional).

Primero publica el comentario de decisión con Fase «En revisión»: qué está
hecho, qué debe mirar Pablo y enlace a la PR. Entonces, al abrirla lista para revisión: `set_sel <num> Estado "En revisión"`.

### 5. PR fusionada → «Hecho»

El workflow pasa a Hecho. No hace falta una etiqueta de cola. Comprueba que la issue se ha cerrado.

### 6. Verificación en producción (opcional)

No es una columna. Si se quiere, comentar el SHA de `/api/v1/health` y poner la etiqueta `verificado-prod`.

### 7. Decisión tomada

Actualiza la fila de `DECISIONES.md` (estado «Decidida», fecha, decisión, quién) en una PR con «Refs #N». Quita `decision-pendiente` y mueve la issue al estado que toque (Listo para hacer, Ideas o Hecho si se descarta).

### 8. Descartada

`set_sel <num> Estado Hecho` y `gh issue close <num> --reason "not planned" --comment "Descartada: <motivo>"`. El workflow «Item closed» debe dejarla en Hecho.

### 9. Regenerar el espejo

`scripts/backlog/generar-backlog.sh`. Lo ejecuta backlog-sync. Una PR de agente no lleva `sin-backlog` para saltarse la issue: `issue-link` solo exime a `dependabot[bot]`.

## Checklist al cerrar una tarea

- [ ] Pregunté por las pausadas antes de reclamar.
- [ ] Zona libre (y nada más en prisma-migrations).
- [ ] Agente `<ejecutor>-<rol>-N` y Rama rellenados.
- [ ] La descripción de la PR empieza por `Closes #N` y esa issue está abierta.
- [ ] Si es un ajuste post-cierre, la issue es nueva, con etiqueta `ajuste`, enlazada a la original. No se reabrió la cerrada.
- [ ] Si pausé: comentario con motivo, estado y condición para retomar.
- [ ] Comentarios de decisión publicados; el último resume el estado al pasar a En revisión.
- [ ] Al retomar: comentario «Retomada», vuelta a En curso y Agente actualizado si cambia.
- [ ] DoD cumplida.
- [ ] Si cambió una decisión, DECISIONES.md está actualizado en la misma PR.
