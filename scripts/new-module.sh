#!/usr/bin/env bash
# Crea el esqueleto de un módulo de dominio en apps/api (ver apps/api/src/modules/README.md)
set -euo pipefail
NAME="${1:?uso: scripts/new-module.sh <nombre>}"
DIR="apps/api/src/modules/$NAME"
mkdir -p "$DIR/dto"
touch "$DIR/$NAME.module.ts" "$DIR/$NAME.controller.ts" "$DIR/$NAME.service.ts" "$DIR/$NAME.service.spec.ts"
echo "Módulo creado en $DIR — recuerda: sin imports entre módulos, eventos por el bus, OpenAPI completo."
