# Versionado y CHANGELOG

La versión del producto sigue SemVer mientras sea 0.x.

- Una novedad visible sube el minor (`0.2.0` → `0.3.0`).
- Una corrección compatible sube el patch.
- Un cambio incompatible, en 0.x, sube el minor y se explica en el CHANGELOG.
  La `1.0.0` no se publica hasta que Pablo la pida.

El mismo número va en el `package.json` de la raíz, `apps/api`, `apps/web`,
`packages/domain` y `packages/sdk`. Acerca de y `GET /api/v1/health` leen la
versión de `apps/api/package.json` (más el commit, en `mcp_version`). `domain`
y `sdk` son privados y no se publican aparte: acompañan el número del producto.
La extensión de Raycast no lleva versión npm.

`CHANGELOG.md` lleva la entrada nueva arriba, en español y con fecha, con el
encabezado `## X.Y.Z (D de mes de AAAA)`. Dentro se agrupa en Novedades,
Cambios, Correcciones, Seguridad (si la hay) y Mantenimiento. Cada punto enlaza
su PR. Las migraciones, el SQL manual y los cambios incompatibles van en un
apartado propio de esa entrada. No se borra el texto de las entradas anteriores.

La etiqueta `vX.Y.Z` la crea Pablo sobre el commit de `main` que se despliega,
después de fusionar la entrada. Esta guía no elige la herramienta
(release-please o changesets): sigue abierto en DEC-002 (BKL-017, #115).

## Siguiente release

1. Esperar a que esté en `main` todo lo que entra en la release.
2. Escribir la entrada del CHANGELOG y subir los cinco `package.json`.
3. Dejar `info.version` de `apps/api/openapi.json` igual que `apps/api/package.json`.
4. Abrir la PR. La etiqueta y la rama `production` quedan fuera hasta el OK de Pablo.
