# Cierre de la cola de Dependabot (19 oct 2026)

Documento de la primera pasada de Dependabot sobre `main`. Explica por qué se abrieron tantas PR a la vez, por qué una parte no se puede mergear tal cual, y el arreglo con el que se cierra cada una.

## 1. Por qué aparecieron todas juntas

`.github/dependabot.yml` entró en `main` con `3cdc478` (19 oct 2026, 12:07 CEST). Aunque el intervalo es semanal, la primera pasada al aparecer el fichero en la rama por defecto es inmediata. Entre las 12:20 y las 12:26 Dependabot abrió una PR por cada actualización que el fichero no agrupa.

El fichero vigila cuatro sitios:

| Ecosistema | Directorio | Agrupación en el fichero original | Tope por defecto |
| --- | --- | --- | --- |
| npm | `/` | solo minor y patch | 5 PR abiertas |
| github-actions | `/` | ninguna | 5 PR abiertas |
| docker | `/apps/api` | ninguna | 5 PR abiertas |
| docker | `/apps/web` | ninguna | 5 PR abiertas |

Cada action y cada imagen salió en su propia PR. Los major de npm también, porque el grupo `minor-and-patch` no los incluye. Las de Actions se pisaban entre sí: `#21`, `#25` y `#27` editaban las mismas líneas de `ci.yml` y `security.yml`.

Ya están en `main`, con el CI en verde y el workflow siguiendo en Node 22 en el momento del merge:

- `#26` `gitleaks/gitleaks-action` 2 → 3
- `#24` `github/codeql-action` 3 → 4
- `#21` `actions/setup-node` 4 → 7
- `#25` `pnpm/action-setup` 4 → 6
- `#27` `actions/checkout` 4 → 7

## 2. Lo que sigue abierto y por qué falla

### 2.1 `#28` — grupo minor y patch

CI: `quality` falla. El resto pasa. `typescript-eslint` 8.18 → 8.71 activa reglas que el código de `packages/domain` no cumplía:

| Regla | Archivo |
| --- | --- |
| `@typescript-eslint/no-misused-spread` | `packages/domain/src/auth/totp.ts` (`[...cleaned]` sobre un string ASCII de Base32) |
| `@typescript-eslint/prefer-optional-chain` | `packages/domain/src/filters/arrange.ts`, `packages/domain/src/filters/parse.ts` |
| `@typescript-eslint/no-unnecessary-type-assertion` | `packages/domain/src/transfer/csv.ts` |

El salto también incluye prettier 3.4 → 3.9, argon2 0.41 → 0.45, class-validator 0.14 → 0.15 y express 5.2 → 5.3. Esos no rompen tests ni OpenAPI.

Arreglo: corregir esos seis avisos en la propia PR y mergearla cuando `quality` pase.

### 2.2 `#32`, `#31` y `#29` — NestJS 12

`@nestjs/common@12`, `@nestjs/testing@12` y `@nestjs/cli@12` publican `"type": "module"`. `apps/api` no tiene `"type": "module"`, así que TypeScript (con `module: NodeNext`) trata sus `.ts` como CommonJS y rechaza el import:

`TS1479: The current file is a CommonJS module whose imports will produce 'require' calls; however, the referenced file is an ECMAScript module.`

Además, `#31` deja `@nestjs/testing@12` contra `@nestjs/common@11`. En runtime el test de health no resuelve `@nestjs/common/internal`. `#29` (solo el CLI) tiene el CI en verde porque el CLI no entra en el typecheck de la app, pero no debe adelantarse al framework.

Arreglo: en `#32`, pasar `apps/api` a ESM y subir a la vez el resto de `@nestjs/*` que tiene que ir en la misma major (`core`, `platform-express`, `swagger`, `bullmq`, `testing`, `cli`). Cuando eso está en `main`, rebasear `#31` y `#29` y cerrarlas.

Los imports relativos de `apps/api` no llevan extensión. Con `NodeNext` y `"type": "module"` tienen que terminar en `.js` para que `tsc` y Node resuelvan el emit. `__dirname` solo aparece en `prisma/seed.ts` y en los dos `vitest.config*.ts`.

### 2.3 `#22`, `#23` y `#30` — Node 26

Tres PR parten el mismo salto de runtime:

| Superficie | Hoy en `main` | Lo que pide Dependabot |
| --- | --- | --- |
| CI `node-version` | 22 | no lo toca |
| `engines.node` | `>=22` | no lo toca |
| `apps/api` y `apps/web` `FROM node` | `22-alpine` | `26-alpine` (`#23`, `#22`) |
| `@types/node` | `^22` | `^26` (`#30`) |

El CI de `#22` y `#23` sale verde porque los workflows usan `actions/setup-node`, no construyen esos Dockerfiles. Mergear la imagen sin mover el CI dejaría producción en un Node que la suite no ejecuta. `@types/node@26` por delante del runtime permite tipar APIs que Node 22 no tiene.

Arreglo: tratarlo como un solo cambio de runtime. En `#30` se sube también `node-version` del CI y `engines.node` a 26, y se corre la suite ahí. Si pasa, se mergea `#30` y después `#23` y `#22`. Si no pasa, esas tres PR se cierran y Dependabot ignora ese major hasta que el runtime esté elegido a propósito.

## 3. Para que la siguiente pasada no vuelva a abrir una PR por archivo

En el mismo cambio de configuración:

- `github-actions` queda agrupado: la próxima tanda de actions entra en una sola PR.
- Los major de `@nestjs/*` quedan agrupados: common, testing y cli no vuelven a llegar por separado.
- Sigue el grupo `minor-and-patch` de npm.
- El tope de 5 PR por ecosistema no se toca. Con los grupos, la primera pasada ya no lo llena con actions sueltas.

## 4. Resultado

La suite de `#30` pasó en Node 26 (quality, unitarios, integración y OpenAPI). A partir de ahí el runtime queda alineado: CI `node-version: 26`, `engines.node` `>=26`, `@types/node` `^26` e imágenes `node:26-alpine` en `apps/api` y `apps/web`.

| PR | Cierre |
| --- | --- |
| `#28` | Mergeada tras corregir las reglas nuevas de `typescript-eslint` 8.71 y el formato de Prettier 3.9 |
| `#32` | Mergeada. `apps/api` es ESM (`"type": "module"`, imports relativos en `.js`) y el resto de `@nestjs/*` sube junto a la 12. `ora` queda fijado en 5.4.1 porque el CLI 12 arrastra schematics que hacen `require()` de la ora 9, ESM, y Node corta ese ciclo |
| `#31` y `#29` | Cerradas. Testing 12.1.3 y CLI 12.0.8 ya iban dentro de `#32`; solas, contra Nest 11, no arrancaban |
| `#30` | Mergeada con el CI y `engines` en 26 |
| `#23` y `#22` | Mergeadas después, cuando el CI ya ejecutaba esa major |
