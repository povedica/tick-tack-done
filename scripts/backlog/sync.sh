#!/usr/bin/env bash
# Sincroniza issues y Project «ttd · backlog» con el ciclo de vida de las PR y del despliegue.
# Lo usa .github/workflows/backlog-sync.yml; también se puede ejecutar a mano.
#
#   sync.sh pr-check     <pr>   Falla solo si la descripción no tiene «Closes #N».
#                               Si hay Closes/Fixes/Resolves, rellena Rama con la rama
#                               de la PR, avisa si Agente está vacío y, si la tarjeta
#                               estaba en «Listo para hacer», la pasa a «En curso».
#                               También falla si cambia una decisión sin tocar
#                               docs/backlog/DECISIONES.md.
#   sync.sh pr-merged    <pr>   Issues que cierra la PR → Estado «Hecho» + comentario.
#                               No mueve a «Pausada» ni sale de «Pausada». Las «Refs» solo
#                               reciben comentario.
#   sync.sh check-deploy        Lee el commit de producción en /api/v1/health. Si el merge ya
#                               está en producción, comenta y puede marcar en-produccion.
#                               No cambia el Estado: la issue ya está en «Hecho».
#
# Variables: REPO, OWNER, PROJECT_NUMBER (o PROJECT_TITLE), HEALTH_URL,
#   GH_TOKEN (repo), PROJECT_TOKEN (classic con scope «project»; si falta, no toca el Project),
#   DRY_RUN=1 para solo imprimir.
set -euo pipefail

REPO="${REPO:-povedica/tick-tack-done}"
OWNER="${OWNER:-povedica}"
TITLE="${PROJECT_TITLE:-ttd · backlog}"
HEALTH_URL="${HEALTH_URL:-https://todo.reflexionia.com/api/v1/health}"
DRY_RUN="${DRY_RUN:-0}"

say() { printf '%s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '[simulación]'
    # Bash 3.2 necesita exportar el locale antes de citar texto multibyte.
    (export LC_ALL=C; printf ' %q' "$@")
    printf '\n'
  else
    "$@"
  fi
}

# No crea etiquetas: si falta una del paquete, avisa y continúa.
edit_labels() {
  local num="$1" result
  shift
  if [ "$DRY_RUN" = "1" ]; then
    run gh issue edit "$num" --repo "$REPO" "$@"
    return
  fi
  if result="$(gh issue edit "$num" --repo "$REPO" "$@" 2>&1)"; then
    return 0
  fi
  if grep -qiE "label.*(not found|does not exist|could not be found)" <<<"$result"; then
    say "::warning::#$num: falta una etiqueta del backlog; configúrala antes de reintentar."
    return 2
  fi
  printf '%s\n' "$result" >&2
  return 1
}

comment_once() {
  local num="$1" body="$2" comments
  comments="$(gh api --paginate "repos/$REPO/issues/$num/comments?per_page=100" --jq '.[].body')"
  if ! grep -Fqx -- "$body" <<<"$comments"; then
    run gh issue comment "$num" --repo "$REPO" --body "$body"
  fi
}

# gh contra el Project con el token de Projects (classic). Sin token, no hace nada.
ghp() {
  if [ -z "${PROJECT_TOKEN:-}" ]; then
    say "::warning::Sin PROJECT_TOKEN: no se actualiza el Project."
    return 1
  fi
  GH_TOKEN="$PROJECT_TOKEN" gh "$@"
}

project_number() {
  if [ -n "${PROJECT_NUMBER:-}" ]; then echo "$PROJECT_NUMBER"; return; fi
  ghp project list --owner "${1:-$OWNER}" --format json --limit 100 \
    --jq ".projects[] | select(.title == \"$TITLE\") | .number" | head -n1
}

set_estado() { # issue_number valor
  local num="$1" value="$2" pn pid fields fid oid item owner identity current line
  if [ "$value" = "Pausada" ]; then
    say "::warning::#$num: este script no mueve una issue a «Pausada»."
    return 0
  fi
  if [ -z "${PROJECT_TOKEN:-}" ]; then
    say "::warning::Sin PROJECT_TOKEN: no se actualiza el Project."
    return 0
  fi
  owner="$OWNER"
  identity="$(ghp api user --jq .login)" || return 1
  if [ "$identity" = "$OWNER" ]; then owner="@me"; fi
  pn="$(project_number "$owner")" || return 0
  [ -n "$pn" ] || { say "::warning::No encuentro el Project «${TITLE}»."; return 0; }
  pid="$(ghp project view "$pn" --owner "$owner" --format json --jq .id)"
  fields="$(ghp project field-list "$pn" --owner "$owner" --format json --limit 100)"
  fid="$(jq -r '.fields[] | select(.name=="Estado" or .name=="Status") | .id' <<<"$fields" | head -n1)"
  oid="$(jq -r --arg v "$value" '.fields[] | select(.name=="Estado" or .name=="Status") | .options[]? | select(.name==$v) | .id' <<<"$fields" | head -n1)"
  line="$(ghp project item-list "$pn" --owner "$owner" --format json --limit 500 \
    --jq ".items[] | select(.content.type==\"Issue\" and .content.number==$num and .content.repository==\"$REPO\") | [.id, (.estado // .status // \"\")] | @tsv" | head -n1)"
  item="${line%%$'\t'*}"
  current="${line#*$'\t'}"
  if [ -z "$line" ] || [ "$current" = "$line" ]; then current=""; fi
  if [ "$current" = "Pausada" ]; then
    say "::warning::#$num: está en «Pausada»; no se cambia el estado."
    return 0
  fi
  if [ -z "$fid" ] || [ -z "$oid" ] || [ -z "$item" ]; then
    say "::warning::#$num: no encuentro el item, el campo Estado o la opción «${value}»."
    return 0
  fi
  GH_TOKEN="$PROJECT_TOKEN" run gh project item-edit --id "$item" --project-id "$pid" \
    --field-id "$fid" --single-select-option-id "$oid"
  say "#$num → Estado «${value}»"
}

refs_in_body() { # texto → números referenciados con Refs/Closes/Fixes/Resolves
  grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?|refs?) +#[0-9]+' <<<"$1" | grep -oE '[0-9]+' | sort -u || true
}

# Close/Closes/Closed, Fix/Fixes/Fixed y Resolve/Resolves/Resolved.
# Refs no cierra la issue.
CLOSING_REF='(close[sd]?|fix(e[sd])?|resolve[sd]?) +#[0-9]+'

# Closes, Fixes y Resolves enlazan la PR en Development. Refs no.
closing_numbers() {
  grep -oiE "$CLOSING_REF" <<<"$1" | grep -oE '[0-9]+' | sort -u || true
}

has_closes() {
  grep -qiE "$CLOSING_REF" <<<"$1"
}

REVIEW_ISSUES=""

# Escribe la Rama, avisa si Agente está vacío y saca de «Listo para hacer».
# Nunca falla el check: sin token o sin item, solo avisa.
sync_linked_issues() {
  local pr="$1" body="$2" branch="$3" numbers n line item rest status agente rama_id
  local owner identity pn pid fields
  numbers="$(closing_numbers "$body")"
  [ -n "$numbers" ] || return 0
  if [ -z "${PROJECT_TOKEN:-}" ]; then
    say "::warning::Sin PROJECT_TOKEN: no se rellena la Rama ni se mueve el estado."
    return 0
  fi
  if [ -z "$branch" ]; then
    say "::warning::PR #$pr sin nombre de rama; no relleno Rama."
  fi
  owner="$OWNER"
  identity="$(ghp api user --jq .login)" || { say "::warning::No pude leer el Project."; return 0; }
  if [ "$identity" = "$OWNER" ]; then owner="@me"; fi
  pn="$(project_number "$owner")" || { say "::warning::No pude leer el Project."; return 0; }
  [ -n "$pn" ] || { say "::warning::No encuentro el Project «${TITLE}»."; return 0; }
  pid="$(ghp project view "$pn" --owner "$owner" --format json --jq .id)" || { say "::warning::No pude leer el Project."; return 0; }
  fields="$(ghp project field-list "$pn" --owner "$owner" --format json --limit 100)" || { say "::warning::No pude leer el Project."; return 0; }
  rama_id="$(jq -r '.fields[] | select(.name=="Rama") | .id' <<<"$fields" | head -n1)"
  for n in $numbers; do
    line="$(ghp project item-list "$pn" --owner "$owner" --format json --limit 500 \
      --jq ".items[] | select(.content.type==\"Issue\" and .content.number==$n and .content.repository==\"$REPO\") | [.id, (.estado // .status // \"\"), (.agente // \"\")] | @tsv" | head -n1 || true)"
    if [ -z "$line" ]; then
      say "::warning::#$n: no está en el Project."
      continue
    fi
    item="${line%%$'\t'*}"
    rest="${line#*$'\t'}"
    status="${rest%%$'\t'*}"
    if [ "$rest" = "$line" ]; then status=""; agente=""; else agente="${rest#*$'\t'}"; fi
    if [ "$agente" = "$rest" ]; then agente=""; fi
    if [ "$status" = "En revisión" ]; then REVIEW_ISSUES="$REVIEW_ISSUES $n"; fi
    if [ -n "$branch" ] && [ -n "$rama_id" ]; then
      if GH_TOKEN="$PROJECT_TOKEN" run gh project item-edit --id "$item" --project-id "$pid" \
        --field-id "$rama_id" --text "$branch"; then
        say "#$n → Rama «${branch}»"
      else
        say "::warning::#$n: no pude escribir la Rama."
      fi
    elif [ -z "$rama_id" ]; then
      say "::warning::#$n: el Project no tiene campo Rama."
    fi
    if [ -z "$agente" ]; then
      say "::warning::#$n: Agente está vacío. Rellena <ejecutor>-<rol>-N."
      comment_once "$pr" "Backlog: la issue #$n no tiene Agente. Rellena <ejecutor>-<rol>-N en el Project." \
        || say "::warning::No pude avisar en la PR #$pr de que Agente está vacío."
    fi
    if [ "$status" = "Listo para hacer" ]; then
      set_estado "$n" "En curso" || say "::warning::#$n: no pude pasarla a «En curso»."
    fi
  done
}

# Solo comprueba presencia: no inventa decisiones ni cambia estados al retomar.
# El estado ya leído por sync_linked_issues sirve también con PR en borrador.
warn_missing_decisions() {
  local body="$1" draft="$2" n comments
  for n in $(closing_numbers "$body"); do
    if [ "$draft" != "false" ] && [[ " $REVIEW_ISSUES " != *" $n "* ]]; then
      continue
    fi
    if ! comments="$(gh api --paginate "repos/$REPO/issues/$n/comments?per_page=100" --jq '.[].body')"; then
      say "::warning::#$n: no pude leer los comentarios de decisión de la issue."
      continue
    fi
    if ! grep -Fq -- '<!-- ttd-decision -->' <<<"$comments"; then
      say "::warning::#$n: no hay comentario de decisión en la issue. Usa docs/backlog/plantillas/comentario-decision.md. Al retomar: Fase Retomada y vuelta a En curso."
    fi
  done
}

cmd_pr_check() {
  if [ -z "${PROJECT_NUMBER:-}" ]; then
    say "::warning::Sin PROJECT_NUMBER: check de backlog pendiente de configurar."
    return 0
  fi
  local pr="$1" data body labels author closing files branch trimmed
  data="$(gh pr view "$pr" --repo "$REPO" --json body,labels,author,closingIssuesReferences,files,headRefName,isDraft)"
  body="$(jq -r '.body // ""' <<<"$data")"
  labels="$(jq -r '.labels[].name' <<<"$data")"
  author="$(jq -r '.author.login' <<<"$data")"
  branch="$(jq -r '.headRefName // empty' <<<"$data")"
  if grep -qx 'sin-backlog' <<<"$labels" || [[ "$author" == dependabot* ]] || [[ "$author" == "github-actions"* ]]; then
    say "PR #$pr exenta del check de backlog (sin-backlog o bot)."
    return 0
  fi
  if ! has_closes "$body"; then
    say "::error::La PR #$pr no tiene «Closes #N». Sin eso GitHub no la muestra en Development. La etiqueta sin-backlog exime a dependencias y CI."
    comment_once "$pr" "Backlog: falta «Closes #N» en la descripción. Tiene que ser la primera línea para que GitHub enlace la PR en Development." \
      || say "::warning::No pude avisar en la PR #$pr de que falta «Closes #N»."
    sync_linked_issues "$pr" "$body" "$branch" || say "::warning::No pude actualizar el Project de la PR #$pr."
    return 1
  fi
  trimmed="$(printf '%s' "$body" | sed -e 's/^[[:space:]]*//')"
  if ! printf '%s\n' "$trimmed" | grep -qiE "^${CLOSING_REF}"; then
    say "::warning::PR #$pr: «Closes #N» tiene que ser la primera línea de la descripción."
    comment_once "$pr" "Backlog: «Closes #N» tiene que ser la primera línea de la descripción." \
      || say "::warning::No pude avisar en la PR #$pr de dónde va «Closes #N»."
  fi
  sync_linked_issues "$pr" "$body" "$branch" || say "::warning::No pude actualizar el Project de la PR #$pr."
  warn_missing_decisions "$body" "$(jq -r 'if .isDraft == false then "false" else "true" end' <<<"$data")" \
    || say "::warning::No pude comprobar los comentarios de decisión."
  files="$(jq -r '.files[].path' <<<"$data")"
  closing="$(jq -r '.closingIssuesReferences[].number' <<<"$data")"
  local needs_dec=0 n
  if grep -qiE '^\s*- \[[xX]\] (Cambia una decisión|Changes? (a |an? )?decision)' <<<"$body"; then needs_dec=1; fi
  for n in $closing; do
    if gh issue view "$n" --repo "$REPO" --json labels --jq '.labels[].name' | grep -qx 'tipo:decision'; then
      needs_dec=1
    fi
  done
  if [ "$needs_dec" = "1" ] && ! grep -qx 'docs/backlog/DECISIONES.md' <<<"$files"; then
    say "::error::La PR #$pr cierra o cambia una decisión: actualiza docs/backlog/DECISIONES.md (fila, fecha y decisión)."
    return 1
  fi
  if grep -qx 'docs/backlog/BACKLOG.md' <<<"$files"; then
    say "::warning::BACKLOG.md se regenera desde el Project (scripts/backlog/generar-backlog.sh). No edites el bloque generado a mano."
  fi
  say "Check de backlog OK para la PR #$pr."
}

cmd_pr_merged() {
  local pr="$1" data sha body closing n refs
  data="$(gh pr view "$pr" --repo "$REPO" --json body,mergeCommit,closingIssuesReferences,mergedAt)"
  sha="$(jq -r '.mergeCommit.oid // empty' <<<"$data")"
  [ -n "$sha" ] || { say "La PR #$pr no está fusionada."; return 0; }
  body="$(jq -r '.body // ""' <<<"$data")"
  closing="$(jq -r '.closingIssuesReferences[].number' <<<"$data")"
  for n in $closing; do
    comment_once "$n" "Fusionada en #$pr (\`${sha:0:7}\`). Estado → Hecho."
    set_estado "$n" "Hecho" || true
  done
  refs="$(refs_in_body "$body")"
  for n in $refs; do
    grep -qx "$n" <<<"$closing" && continue
    comment_once "$n" "Avance fusionado en #$pr (\`${sha:0:7}\`). La issue sigue abierta: no se cambia su estado."
  done
}

cmd_check_deploy() {
  local live n pr sha
  live="$(curl -fsS --max-time 15 "$HEALTH_URL" | jq -r '.commit // empty')" || {
    say "::warning::No pude leer el commit de producción en $HEALTH_URL."
    return 0
  }
  [ -n "$live" ] || { say "::warning::No pude leer el commit de producción en $HEALTH_URL."; return 0; }
  if [[ ! "$live" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    say "::warning::El commit de producción no es un SHA válido."
    return 0
  fi
  if ! git rev-parse --verify --quiet "$live^{commit}" >/dev/null && [ "$DRY_RUN" != "1" ]; then
    git fetch --quiet origin
  fi
  if ! git rev-parse --verify --quiet "$live^{commit}" >/dev/null; then
    say "::warning::Producción publica $live, que no está en el repo."
    return 0
  fi
  say "Producción: $live"
  # Marca opcional. No cambia el Estado y no toca las issues en Pausada:
  # Pausada solo la mueve el agente, con comentario, o Pablo.
  for n in $(gh issue list --repo "$REPO" --state closed --limit 200 --json number,labels --jq '.[] | select(any(.labels[]; .name == "en-produccion") | not) | .number'); do
    for pr in $(gh issue view "$n" --repo "$REPO" --json closedByPullRequestsReferences --jq '.closedByPullRequestsReferences[].number'); do
      sha="$(gh pr view "$pr" --repo "$REPO" --json mergeCommit --jq '.mergeCommit.oid // empty')"
      [ -n "$sha" ] || continue
      if git merge-base --is-ancestor "$sha" "$live"; then
        local label_status=0
        edit_labels "$n" --add-label en-produccion || label_status=$?
        [ "$label_status" -ne 2 ] || continue
        [ "$label_status" -eq 0 ] || return "$label_status"
        comment_once "$n" "En producción: /api/v1/health publica \`${live:0:7}\`, que contiene #$pr. La etiqueta en-produccion es opcional y no cambia el Estado."
        break
      fi
    done
  done
}

case "${1:-}" in
  pr-check) cmd_pr_check "${2:?número de PR}" ;;
  pr-merged) cmd_pr_merged "${2:?número de PR}" ;;
  check-deploy) cmd_check_deploy ;;
  *) echo "Uso: $0 {pr-check <pr>|pr-merged <pr>|check-deploy}" >&2; exit 2 ;;
esac
