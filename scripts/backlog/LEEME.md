# Scripts del backlog

`sync.sh` mantiene el Project «ttd · backlog» al ritmo de las PR.
`exemptions.json` dice quién no tiene que llevar «Closes #N» en el
check `pr-check`, y qué autores también se saltan `issue-link` (el
check de `ci-ok` que corta el merge). El script no tiene un condicional
por bot: compara la PR con esas reglas.

## Añadir una exención

1. Edita `scripts/backlog/exemptions.json`. No toques `sync.sh` ni
   `scripts/ci/issue_link.py`.
2. Añade un objeto en `rules`, con `id`, `checks`, `reason` y `when`.
   El `id` es el que queda en el log (`Regla: …`). El `reason` también.
3. `checks` es una lista. Hoy valen `pr-check` e `issue-link`.
   - `pr-check` es el job de `backlog-sync`. No forma parte de `ci-ok`.
   - `issue-link` sí forma parte de `ci-ok`. Un agente no puede usarlo
     para trabajar sin issue. Por eso `sin-backlog`, `dependencies` y
     `github-actions` no lo nombran. La única regla que lo nombra hoy
     es Dependabot.
4. `when` combina con Y las claves que pongas:
   - `author.login` es el login normalizado. `app/dependabot`,
     `dependabot[bot]` y `dependabot` son el mismo. `author.bot` es
     obligatorio: `true` exige `is_bot` (en `gh pr view`) o
     `user.type == Bot` (en el evento de Actions). Un humano que se
     llame igual no queda exento.
   - `labels_any`: basta una de esas etiquetas.
   - `paths_all`: todos los ficheros de la PR casan con alguno de los
     globs (`*` no cruza `/`, `**` sí). Si la PR no trae la lista de
     ficheros, la regla no casa. `issue-link` lee el evento y normalmente
     no trae ficheros: una regla de rutas no le aplica.
5. La primera regla que casa gana. Pon la más específica antes.
6. Añade un caso en `scripts/backlog/test_backlog.py` (y, si la regla
   nombra `issue-link`, en `scripts/deploy/test_workflow_contracts.py`).

Ejemplo para otro bot, solo en el check del Project:

```json
{
  "id": "renovate",
  "checks": ["pr-check"],
  "reason": "Renovate actualiza dependencias y no cierra una issue.",
  "when": { "author": { "login": "renovate", "bot": true } }
}
```

Un check nuevo (un tercer consumidor) sí toca código: hay que añadirlo
a `ALLOWED_CHECKS` en `exemptions.py` y llamarlo con
`find_exemption`. Una regla de un check que ya existe, no.

## Token sin permiso de escritura

Las PR de Dependabot y las de un fork reciben un `GITHUB_TOKEN` de
solo lectura, y los secretos del repositorio no llegan. Antes de
comentar, `sync.sh` lee las cabeceras `x-accepted-github-permissions`
o `x-oauth-scopes`. Si el permiso es de lectura, no llama a
`addComment` y no falla por eso. El check sigue en rojo si la PR
humana no tiene «Closes #N». Si las cabeceras no dicen nada, se
intenta el comentario como hasta ahora.

No hace falta una regla para los forks: el permiso ya los cubre.
