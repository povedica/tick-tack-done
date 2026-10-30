---
name: backlog-github-projects
description: Mantener el backlog de ttd en GitHub Projects («ttd · backlog») y sus espejos docs/backlog/BACKLOG.md y DECISIONES.md. Úsala al empezar o terminar una tarea, al abrir o fusionar una PR, cuando se toma o descarta una decisión, tras un despliegue y cuando pregunten «¿qué hago ahora?» o por el estado del proyecto.
---

# Backlog en GitHub Projects (ttd)

Fuente de verdad del estado: el Project «ttd · backlog» (n.º en la variable `PROJECT_NUMBER`).
`docs/backlog/BACKLOG.md` es un espejo generado; `docs/backlog/DECISIONES.md` es el registro de decisiones.
Reglas completas: `docs/backlog/PROTOCOLO-BACKLOG.md`.

GitHub mantiene el campo nativo `Status` y no permite renombrarlo. «Estado» es el concepto del
protocolo: usa `Status` con las siete opciones en español. Los comandos admiten también un
campo `Estado` existente; no crees otro campo para sustituir el nativo.

Para un Project de la cuenta autenticada se usa `--owner @me`: evita la consulta de
organizaciones de `gh project` y funciona con el PAT classic de scopes `repo` y `project`.

Este procedimiento lo comparten Cursor y Codex. La entrada para ambos está en `AGENTS.md`.

## Cuándo se activa

- Antes de empezar trabajo: confirmar que hay issue y que el WIP lo permite.
- Al abrir una PR, al fusionarla y tras un despliegue.
- Cuando Pablo decide algo, descarta una idea o aparece una idea nueva.
- En el repaso semanal y cuando preguntan por el estado.

## Límites

- No envíes mensajes ni comentarios a otras personas sin autorización de Pablo.
- Nunca decides producto: las decisiones son de Pablo. Tú propones opciones y recomendación.
- Nunca marcas «Desplegado» sin prueba en producción (definición de hecho).
- Nunca editas a mano el bloque generado de BACKLOG.md.
- Sin datos personales, de familia ni nombres de clientes en issues, PRs o ficheros.
- Si tu token no tiene el scope `project`, no fuerces: deja los comandos en la PR para que los ejecute Pablo.

## Valores válidos

- Estado: Idea · Decidir · Spec lista · En Codex/PR · Fusionado · Desplegado · Descartado
- Prioridad: P1 · P2 · P3
- Area (sin tilde a propósito): calendario · filtros · correo · infra · repo · hábitos · plan del día · nativo/PWA · MCP/API · proyectos
- Tipo: feature · bug · decisión · deuda
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
```

### 1. Idea nueva

```bash
NEXT=$(gh issue list --repo "$REPO" --state all --limit 1000 --json title --jq '[.[].title|(capture("^BKL-(?<n>[0-9]+)")? | .n | tonumber)]|(. // [])|((max // 0)+1)')
gh issue create --repo "$REPO" --title "$(printf 'BKL-%03d · Título' "$NEXT")" --body-file cuerpo.md \
  --label backlog --label area:<area> --label tipo:<tipo> --label prio:P3
gh project item-add "$N" --owner "$PROJECT_OWNER" --url <url>
set_sel <num> Estado Idea; set_sel <num> Prioridad P3; set_sel <num> Area <area>; set_sel <num> Tipo <tipo>
```

### 2. Necesita decisión → «Decidir»

`set_sel <num> Estado Decidir`, etiqueta `decision-pendiente` y fila nueva en `DECISIONES.md` (estado «Abierta») en la siguiente PR de docs.

### 3. Spec o prompt entregado → «Spec lista»

`set_sel <num> Estado "Spec lista"` y `gh project item-edit … --field-id "$(fid Referencia)" --text "<doc o PR>"`.

### 4. Empieza la implementación / PR abierta → «En Codex/PR»

Comprueba el WIP antes (máximo 3). Si hay más de 500 elementos, no uses un recuento truncado:
lee todos los elementos antes de decidir si hay hueco.

```bash
gh project item-list "$N" --owner "$PROJECT_OWNER" --format json --limit 500 --jq '[.items[]|select((.estado // .status)=="En Codex/PR")]|length'
```

Si ya hay 3, no empieces: avisa y propone cuál cerrar. Si hay hueco: `set_sel <num> Estado "En Codex/PR"`. La PR lleva «Closes #N» o «Refs #N».

### 5. PR fusionada → «Fusionado»

Automático (workflow integrado «Item closed» y backlog-sync). Comprueba que la issue tiene `pendiente-despliegue`.

### 6. Desplegado y verificado → «Desplegado»

1. `curl -s https://todo.reflexionia.com/api/v1/health` → el `commit` contiene el merge (`git merge-base --is-ancestor <merge> <commit>`). backlog-sync pone `en-produccion`.
2. Haz la prueba descrita en la PR con una cuenta de prueba.
3. `set_sel <num> Estado Desplegado`; `gh issue edit <num> --add-label verificado-prod --remove-label en-produccion`; marca la casilla de la PR.

### 7. Decisión tomada

Actualiza la fila de `DECISIONES.md` (estado «Decidida», fecha, decisión, quién) en una PR con «Refs #N». Quita `decision-pendiente` y mueve la issue al estado que toque (Spec lista, Idea o Descartado).

### 8. Descartado

`set_sel <num> Estado Descartado`; `gh issue close <num> --reason "not planned" --comment "Descartada: <motivo>"`. Ojo: el workflow «Item closed» la pondrá en Fusionado; vuelve a ponerla en Descartado.

### 9. Regenerar el espejo

`scripts/backlog/generar-backlog.sh` y PR con la etiqueta `sin-backlog` (o deja que lo haga backlog-sync).

## Checklist al cerrar una tarea

- [ ] La issue tiene Estado, Prioridad, Area, Tipo y Referencia.
- [ ] La PR enlaza la issue (Closes/Refs) y respeta el WIP ≤ 3.
- [ ] Si cambió una decisión, DECISIONES.md está actualizado en la misma PR.
- [ ] Nada pasa a «Desplegado» sin /health + prueba.
- [ ] BACKLOG.md regenerado (o PR de backlog-sync pendiente de revisar).
