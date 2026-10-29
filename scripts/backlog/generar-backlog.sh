#!/usr/bin/env bash
# Regenera el bloque generado de docs/backlog/BACKLOG.md desde el Project «ttd · backlog».
# Solo lee GitHub (gh project item-list). Escribe únicamente el fichero local; hacer commit
# y PR es cosa de quien lo ejecuta (persona o workflow backlog-sync).
#
# Uso: scripts/backlog/generar-backlog.sh [--from-json items.json] [--out docs/backlog/BACKLOG.md]
# Requiere: gh con scope «project» (o read:project) y jq.
# Nota: gh exporta cada campo con su nombre en minúscula inicial («Estado» → «estado»,
# «Area» → «area»). Por eso el campo se llama «Area» sin tilde: gh corta el primer byte.
set -euo pipefail

OWNER="${OWNER:-povedica}"
TITLE="${PROJECT_TITLE:-ttd · backlog}"
OUT="docs/backlog/BACKLOG.md"
FROM_JSON=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from-json) [ $# -ge 2 ] || { echo "Falta el fichero JSON" >&2; exit 2; }; FROM_JSON="$2"; shift 2 ;;
    --out) [ $# -ge 2 ] || { echo "Falta la ruta de salida" >&2; exit 2; }; OUT="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done
command -v jq >/dev/null || { echo "Falta jq" >&2; exit 1; }

if [ -n "$FROM_JSON" ]; then
  ITEMS="$(cat "$FROM_JSON")"
else
  NUMBER="${PROJECT_NUMBER:-}"
  if [ -z "$NUMBER" ]; then
    NUMBER="$(gh project list --owner "$OWNER" --format json --limit 100 \
      --jq ".projects[] | select(.title == \"$TITLE\") | .number" | head -n1)"
  fi
  [ -n "$NUMBER" ] || { echo "No encuentro el Project «$TITLE»" >&2; exit 1; }
  ITEMS="$(gh project item-list "$NUMBER" --owner "$OWNER" --format json --limit 500)"
fi

jq -e '.items | type == "array"' >/dev/null <<<"$ITEMS"
if ! jq -e '(.totalCount // (.items | length)) <= (.items | length)' >/dev/null <<<"$ITEMS"; then
  echo "El Project supera el límite de lectura; no se publica un espejo incompleto." >&2
  exit 1
fi

STAMP="$(TZ=Europe/Madrid date '+%d/%m/%Y %H:%M')"
TABLE="$(jq -r '
  def estado: (.estado // .status // "—");
  def orden: {"Idea":0,"Decidir":1,"Spec lista":2,"En Codex/PR":3,"Fusionado":4,"Desplegado":5,"Descartado":6}[estado] // 9;
  def cell: tostring | gsub("\\|"; "\\|") | gsub("[\r\n]"; " ");
  [.items[] | select(.content.type == "Issue")]
  | sort_by(orden, (.prioridad // "P9"), (.content.title // .title))
  | .[]
  | (.content.title // .title // "") as $title
  | ([$title | capture("^(?<id>BKL-[0-9]+) · (?<t>.*)$")] | first) as $match
  | ($match // {id: "—", t: $title}) as $tt
  | "| \($tt.id) | [#\(.content.number)](\(.content.url)) | \($tt.t | cell) | \((estado) | cell) | \((.prioridad // "—") | cell) | \((.area // "—") | cell) | \((.tipo // "—") | cell) | \((.referencia // "—") | cell) | \(((.labels // []) | map(select(. == "en-produccion" or . == "verificado-prod" or . == "decision-pendiente")) | join(", ")) // "") |"
' <<<"$ITEMS")"

BLOCK="$(cat <<MD
<!-- backlog:inicio — bloque generado por scripts/backlog/generar-backlog.sh desde el Project «ttd · backlog». No editar a mano: cambia el Project y regenera. -->

_Generado el $STAMP (hora de Madrid)._

| ID | # | Título | Estado | Prioridad | Área | Tipo | Referencia | Marcas |
|---|---|---|---|---|---|---|---|---|
$TABLE

<!-- backlog:fin -->
MD
)"

mkdir -p "$(dirname "$OUT")"
if [ -f "$OUT" ] && grep -q '<!-- backlog:' "$OUT"; then
  awk '
    /<!-- backlog:inicio/ { if (started++) exit 1; inside=1 }
    /<!-- backlog:fin -->/ { if (!inside || ended++) exit 1; inside=0 }
    END { if (started != 1 || ended != 1 || inside) exit 1 }
  ' "$OUT" || { echo "Marcadores del backlog inválidos; no se modifica $OUT" >&2; exit 1; }
fi
TEMP_OUT="$(mktemp "${OUT}.XXXXXX")"
trap 'rm -f "$TEMP_OUT"' EXIT
if [ -f "$OUT" ] && grep -q '<!-- backlog:inicio' "$OUT" && grep -q '<!-- backlog:fin -->' "$OUT"; then
  # Sustituye solo el bloque generado y conserva el texto de alrededor.
  BLOCK="$BLOCK" awk '
    /<!-- backlog:inicio/ { print ENVIRON["BLOCK"]; skip = 1; next }
    /<!-- backlog:fin -->/ { skip = 0; next }
    !skip { print }
  ' "$OUT" >"$TEMP_OUT"

else
  # shellcheck disable=SC2016  # las comillas invertidas son Markdown, no expansión
  printf '# Backlog de ttd\n\n%s\n\nReglas: `docs/backlog/PROTOCOLO-BACKLOG.md`. Decisiones: `docs/backlog/DECISIONES.md`.\n' "$BLOCK" >"$TEMP_OUT"
fi
mv "$TEMP_OUT" "$OUT"
echo "Escrito $OUT ($(printf '%s\n' "$TABLE" | grep -c '^|' || true) elementos)."
