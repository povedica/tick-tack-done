#!/usr/bin/env bash
# Sincroniza issues y Project «ttd · backlog» con el ciclo de vida de las PR y del despliegue.
# Lo usa .github/workflows/backlog-sync.yml; también se puede ejecutar a mano.
#
#   sync.sh pr-check     <pr>   Falla si la PR no enlaza issue (Closes/Refs #N) o si cambia
#                               una decisión sin tocar docs/backlog/DECISIONES.md.
#   sync.sh pr-merged    <pr>   Issues que cierra la PR → Estado «Fusionado» + etiqueta
#                               pendiente-despliegue + comentario. Las «Refs» solo reciben comentario.
#   sync.sh check-deploy        Lee el commit de producción en /api/v1/health. Cada issue con
#                               pendiente-despliegue cuyo merge ya está en producción pasa a
#                               en-produccion (+ comentario). NO la mueve a «Desplegado»: eso exige
#                               la prueba en producción (definición de hecho).
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
  ghp project list --owner "$OWNER" --format json --limit 100 \
    --jq ".projects[] | select(.title == \"$TITLE\") | .number" | head -n1
}

set_estado() { # issue_number valor
  local num="$1" value="$2" pn pid fields fid oid item
  if [ -z "${PROJECT_TOKEN:-}" ]; then
    say "::warning::Sin PROJECT_TOKEN: no se actualiza el Project."
    return 0
  fi
  pn="$(project_number)" || return 0
  [ -n "$pn" ] || { say "::warning::No encuentro el Project «$TITLE»."; return 0; }
  pid="$(ghp project view "$pn" --owner "$OWNER" --format json --jq .id)"
  fields="$(ghp project field-list "$pn" --owner "$OWNER" --format json --limit 100)"
  fid="$(jq -r '.fields[] | select(.name=="Estado" or .name=="Status") | .id' <<<"$fields" | head -n1)"
  oid="$(jq -r --arg v "$value" '.fields[] | select(.name=="Estado" or .name=="Status") | .options[]? | select(.name==$v) | .id' <<<"$fields" | head -n1)"
  item="$(ghp project item-list "$pn" --owner "$OWNER" --format json --limit 500 \
    --jq ".items[] | select(.content.type==\"Issue\" and .content.number==$num and .content.repository==\"$REPO\") | .id" | head -n1)"
  if [ -z "$fid" ] || [ -z "$oid" ] || [ -z "$item" ]; then
    say "::warning::#$num: no encuentro el item, el campo Estado o la opción «$value»."
    return 0
  fi
  GH_TOKEN="$PROJECT_TOKEN" run gh project item-edit --id "$item" --project-id "$pid" \
    --field-id "$fid" --single-select-option-id "$oid"
  say "#$num → Estado «$value»"
}

refs_in_body() { # texto → números referenciados con Refs/Closes/Fixes/Resolves
  grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?|refs?) +#[0-9]+' <<<"$1" | grep -oE '[0-9]+' | sort -u || true
}

cmd_pr_check() {
  if [ -z "${PROJECT_NUMBER:-}" ]; then
    say "::warning::Sin PROJECT_NUMBER: check de backlog pendiente de configurar."
    return 0
  fi
  local pr="$1" data body labels author closing files
  data="$(gh pr view "$pr" --repo "$REPO" --json body,labels,author,closingIssuesReferences,files)"
  body="$(jq -r '.body // ""' <<<"$data")"
  labels="$(jq -r '.labels[].name' <<<"$data")"
  author="$(jq -r '.author.login' <<<"$data")"
  if grep -qx 'sin-backlog' <<<"$labels" || [[ "$author" == dependabot* ]] || [[ "$author" == "github-actions"* ]]; then
    say "PR #$pr exenta del check de backlog (sin-backlog o bot)."
    return 0
  fi
  if [ -z "$(refs_in_body "$body")" ]; then
    say "::error::La PR #$pr no enlaza ninguna issue. Añade «Closes #N» (la termina) o «Refs #N» (avanza), o la etiqueta sin-backlog."
    return 1
  fi
  files="$(jq -r '.files[].path' <<<"$data")"
  closing="$(jq -r '.closingIssuesReferences[].number' <<<"$data")"
  local needs_dec=0 n
  if grep -qiE '^\s*- \[[xX]\] .*(decisión|decision)' <<<"$body"; then needs_dec=1; fi
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
    local label_status=0
    edit_labels "$n" --add-label pendiente-despliegue || label_status=$?
    [ "$label_status" -eq 0 ] || [ "$label_status" -eq 2 ] || return "$label_status"
    comment_once "$n" "Fusionada en #$pr (\`${sha:0:7}\`). Estado → Fusionado. Pasará a «en-produccion» cuando /api/v1/health publique un commit que la contenga."
    set_estado "$n" "Fusionado" || true
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
  for n in $(gh issue list --repo "$REPO" --state all --label pendiente-despliegue --limit 200 --json number --jq '.[].number'); do
    for pr in $(gh issue view "$n" --repo "$REPO" --json closedByPullRequestsReferences --jq '.closedByPullRequestsReferences[].number'); do
      sha="$(gh pr view "$pr" --repo "$REPO" --json mergeCommit --jq '.mergeCommit.oid // empty')"
      [ -n "$sha" ] || continue
      if git merge-base --is-ancestor "$sha" "$live"; then
        local label_status=0
        edit_labels "$n" --add-label en-produccion --remove-label pendiente-despliegue || label_status=$?
        [ "$label_status" -ne 2 ] || continue
        [ "$label_status" -eq 0 ] || return "$label_status"
        comment_once "$n" "En producción: /api/v1/health publica \`${live:0:7}\`, que contiene #$pr. Falta la prueba en producción para pasar a «Desplegado» y poner verificado-prod."
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
