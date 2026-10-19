# Spec: MCP listo para Cursor y preparado para crecer

Encargo de implementación. Deja el servidor MCP de tick-tack-done usable desde
Cursor (y desde cualquier cliente Streamable HTTP) y deja un contrato claro
para añadir tools después. No reabras la sección 21 de
`docs/spec/ticktick-clone-spec-v1.1.md`, no subas la versión del documento y
no implementes OAuth.

Trabaja en una rama `fix/mcp-streamable-http` desde `main`. Un solo PR. Cita
esta spec y RF-2001.

No borres ni reescribas tareas, listas ni tokens de producción. No pegues el
PAT en el repo, en la spec, en tests ni en logs. El ejemplo de configuración
lleva el literal `Bearer <token>`.

Al terminar: `pnpm lint`, `pnpm typecheck`, `pnpm test`. Añade el e2e de
transporte descrito abajo. Si cambia el contrato HTTP, regenera OpenAPI
(`pnpm --filter api openapi:generate`).

## Lo que ya funciona (no lo reescribas)

Probado el 19/10/2026 contra `http://127.0.0.1:5173/api/v1/mcp` con un PAT
real, mientras Vite hacía de proxy hacia la API.

- `POST` con `Authorization: Bearer`, `Content-Type: application/json` y
  `Accept: application/json, text/event-stream` responde **200**
  `application/json`.
- `initialize` con `protocolVersion: "2025-03-26"` devuelve
  `serverInfo.name = "reflexionia-tasks"`, `protocolVersion: "2025-03-26"` y
  `capabilities.tools.listChanged: false`. No envía `Mcp-Session-Id`. Eso es
  correcto para un servidor sin sesión.
- `tools/list` publica las 22 tools de `MCP_TOOLS` cuando el token tiene los
  scopes. Un PAT solo de tareas no ve hábitos ni listas
  (`apps/api/src/mcp/mcp.catalog.ts`, `visibleTools`).
- `tools/call` de solo lectura funciona: `list_projects`, `list_tasks`,
  `dashboard_snapshot`, `list_smart_lists`.
- Una notificación JSON-RPC (sin `id`, o método `notifications/…`) ya
  responde **202** vacío (`McpController.handle` cuando `handle` devuelve
  `null`).
- El e2e `apps/api/test/mcp.e2e-spec.ts` cubre el caso RF-2001 de scopes:
  listar, crear y completar, y rechazar hábitos y listas fuera de scope.

Ese POST es el protocolo. El fallo está en el otro verbo.

## Problema que bloquea a Cursor

Cursor no usa las tools como funciones sueltas. Abre un transporte
**Streamable HTTP** (protocolo 2025-03-26) contra la URL del `mcp.json`.

Configuración que se probó (el secreto no va en este archivo):

```json
{
  "mcpServers": {
    "tick-tack-done": {
      "url": "http://127.0.0.1:5173/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

Secuencia real, log de Cursor del 19/10/2026 11:38
(`mcp-server-user-tick-tack-done.log`):

1. Con un bearer inválido, el POST responde **401**
   `{"error":{"code":"unauthorized","message":"Invalid token"}}`. Cursor
   intenta entonces un fallback OAuth y también falla. Un 401 con token malo
   es el comportamiento correcto. No añadas OAuth en este PR.
2. Con el PAT válido, el POST de `initialize` conecta
   (`Successfully connected to streamableHttp server`).
3. Acto seguido Cursor hace `GET` de la misma URL con
   `Accept: text/event-stream`, para el canal de mensajes servidor → cliente.
4. La API solo declara `@Post()` en
   `apps/api/src/mcp/mcp.controller.ts`. El GET cae en el 404 de Nest:
   `Cannot GET /api/v1/mcp` (`code: not_found`). Comprobado otra vez a las
   11:42: POST 200, GET 404, sin cabecera `Mcp-Session-Id`.
5. Cursor interpreta ese 404 como sesión terminada, reintenta y, al quinto
   404 seguido, archiva el transporte y apaga el reintento
   (`Tombstoning streamable HTTP transport after 5 consecutive session HTTP
   404 responses`). El servidor desaparece del agente. En este chat las tools
   no llegaron a registrarse.

El protocolo Streamable HTTP dice: si el servidor no ofrece stream SSE, el
GET **debe** responder **405 Method Not Allowed**, sin cuerpo. El 405 significa
«sigue solo por POST». El 404 significa «esta sesión ya no existe».

Vite ya reenvía `/api` al proceso de la API (`apps/web/vite.config.ts`). No
hace falta otra ruta en el proxy. El 405 tiene que nacer en Nest, así vale
igual para `http://127.0.0.1:5173/api/v1/mcp`, para el puerto directo de la
API y para `https://todo.reflexionia.com/api/v1/mcp` detrás de Caddy.

## Qué hay que dejar

Servidor **sin estado**. Cada POST se autentica con el bearer y se responde
en JSON. No hay almacén de sesiones, no hay `Mcp-Session-Id` y no hay SSE
hasta que exista un mensaje que el servidor deba empujar (más abajo).

### Transporte

En `McpController`, mismo path `mcp`:

| Petición | Auth | Respuesta |
| --- | --- | --- |
| `POST` JSON-RPC con `id` | Bearer o sesión dev, como ahora | 200 `application/json` con el resultado JSON-RPC |
| `POST` notificación (sin `id`, o `notifications/…`) | Igual | 202 sin cuerpo |
| `GET` con bearer válido | Sí | **405**, sin cuerpo, cabecera `Allow: POST` |
| `DELETE` con bearer válido | Sí | **405**, sin cuerpo, cabecera `Allow: POST` |
| `GET` o `DELETE` sin bearer | — | 401, igual que el resto de rutas autenticadas |
| Bearer inválido | — | 401 `Invalid token`. No arranques OAuth |

`DELETE` entra en el mismo arreglo: hoy también sería un 404 de Nest, y
Cursor usa DELETE para cerrar una sesión. Sin sesiones, 405.

No devuelvas `Mcp-Session-Id` en el initialize. En cuanto esa cabecera
exista, el cliente la reenvía y exige un GET con la sesión viva. Añadirla
sin stream es lo que vuelve a tumbar la conexión.

El POST sigue respondiendo `application/json` cuando el cliente acepta JSON.
No conviertas todas las respuestas en SSE. Cursor ya aceptó el initialize en
JSON; el fallo fue solo el GET.

### Contrato para crecer

Las tools siguen saliendo de un solo catálogo, `MCP_TOOLS` en
`apps/api/src/mcp/mcp.catalog.ts`. Añadir una operación nueva, en este PR o
en uno posterior, es esto y nada más:

1. Una entrada en `MCP_TOOLS`: `name`, `description`, `scopes`, `inputSchema`
   con `additionalProperties: false`.
2. Un caso en `McpService.run` que llama a un **servicio de dominio ya
   existente** (`TasksService`, `ListsService`, etc.). El resultado se
   envuelve como hasta ahora: `{ content: [{ type: "text", text: JSON }], isError: false }`.
3. Un test de catálogo si la visibilidad por scope no queda cubierta, y un
   e2e del `tools/call` si la tool escribe o cambia una regla.
4. La tool no aparece en `tools/list` si falta algún scope declarado
   (`visibleTools`). Un `tools/call` directo sin scope responde `isError`
   con `scope_missing: …` y no toca la base de datos. Eso ya está; no lo
   aflojes.

Reglas que el catálogo actual no cumple y este PR debe dejar escritas en
código, no solo en un comentario:

- Ninguna tool nueva lee ni escribe Prisma desde `McpService`. `list_notes`
  y `pin_sticky_note` / `start_focus` hoy sí lo hacen. No las copies. No las
  reescribas en este PR si no existe aún un servicio de notas o de foco:
  déjalas y no añadas una tercera.
- El comentario de `MCP_TOOLS` («Notes are V1 and are not exposed») y el
  resumen OpenAPI del controller («Notes are not exposed») son falsos:
  `list_notes` y `pin_sticky_note` están publicadas. Corrige el texto para
  que describa el filtro real: una tool se ve solo con todos sus scopes.
- Los listados que ya devuelven `next_cursor` deben aceptar `cursor` en el
  `inputSchema` y pasarlo al servicio. Hoy `list_tasks`, `list_projects` y
  el resto ignoran el cursor (`limit` por defecto 50, máximo 100). Un agente
  con más de una página no puede seguir. No inventes otro formato de
  paginación: el mismo `cursor` / `next_cursor` de la API v1.

### Fuera de este PR

No los implementes ahora. Déjalos posibles con el contrato de arriba.

- OAuth2 (RF-2001 lo cita junto al PAT). Cursor, tras un 401, ya intenta
  OAuth y falla. Con un PAT válido no hace falta. Un 401 claro es la
  respuesta hasta que exista el flujo de la sección 10.1.
- Stream SSE de verdad, `Mcp-Session-Id` y `tools.listChanged: true`. Hace
  falta el día que el servidor empuje un aviso sin que el cliente pregunte.
  Hasta entonces el GET se queda en 405.
- Resources y prompts MCP. RF-2001 dice «tools/resources»; las resources
  llegan cuando haya un documento estable que merezca URI (por ejemplo una
  tarea). No crees URIs vacías.
- Tools que aún no existen y un agente echará de menos: `update_task`
  (título, fechas, prioridad, lista, tags), reabrir, borrar, listar
  completadas, checklist. Cada una será una entrada de catálogo cuando se
  haga, reutilizando el servicio de tareas. No ensanches `create_task` en
  este PR: hoy solo acepta `title` y `project_id`, y el e2e depende de eso.
- Los bugs de ida y vuelta del import TickTick (título vacío, subtarea en
  otra lista, `repeat_rule`). Van en
  `docs/spec/cursor-prompt-bugs-migracion-ticktick-2026-10-18.md`.
- No cambies la URL pública. Sigue siendo `POST /api/v1/mcp`, y ahora también
  `GET` y `DELETE` sobre ese path.

## Enmienda de la spec de producto

En `docs/spec/ticktick-clone-spec-v1.1.md`, RF-2001 (sección 9.20, cerca de
la línea 515) y la línea que dice `MCP (RF-2001): POST /api/v1/mcp`, añade
el transporte sin cambiar el número de versión:

- Streamable HTTP sin estado.
- `POST` JSON-RPC, respuesta `application/json`; notificación → 202.
- `GET` y `DELETE` → 405 hasta que exista SSE de servidor a cliente.
- Sin `Mcp-Session-Id` mientras no haya sesión.
- Tools en `MCP_TOOLS`, nunca con más privilegios que el PAT.
- Paginación con el `cursor` de la API v1.

Actualiza la descripción OpenAPI del endpoint para que un agente que lea el
esquema vea el 405 y no solo el POST.

## Pruebas

Amplía `apps/api/test/mcp.e2e-spec.ts`. El helper `rpc` actual siempre manda
`id: 1`; no cubre notificaciones ni el GET.

1. `GET /api/v1/mcp` con PAT → 405, cuerpo vacío, `Allow` contiene `POST`.
2. `DELETE /api/v1/mcp` con PAT → 405, cuerpo vacío, `Allow` contiene `POST`.
3. `GET` sin credencial → 401.
4. `POST initialize` → 200, `reflexionia-tasks`, y la respuesta **no** lleva
   `Mcp-Session-Id`.
5. `POST` `notifications/initialized` sin `id` → 202.
6. El caso de scopes que ya existe sigue en verde.
7. Una tool de listado con `cursor` reenvía el cursor al servicio (puede ser
   el e2e de `list_tasks` o `list_projects`: crea los suficientes ítems, o
   afirma el `next_cursor` que la API ya devuelve y que un segundo call con
   ese cursor no repite la primera página).

No hace falta un test que arranque Cursor. Sí hace falta dejar escrito, en
el PR, el resultado de este probe contra la API en marcha (el puerto directo
o el de Vite, el que esté levantado):

```bash
# POST initialize → 200, sin Mcp-Session-Id
# GET con el mismo bearer → 405 y Allow: POST
```

No imprimas el token en la salida del PR.

## Hecho cuando

1. Un cliente Streamable HTTP completa `initialize` por POST y el GET
   siguiente recibe 405, no 404.
2. Cursor, tras recargar MCP, deja de archivar el transporte. Las tools
   entran en el agente. El log no vuelve a decir `Failed to open SSE stream:
   Not Found` ni `Tombstoning`.
3. Un PAT limitado sigue sin ver ni ejecutar tools de más.
4. Un listado puede pedir la página siguiente con `cursor`.
5. Añadir la próxima tool no exige tocar el transporte: catálogo, servicio,
   test.
6. `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan.

Después del arreglo, quien use Cursor tiene que recargar los servidores MCP
a mano. El cliente desactivó el reintento automático al quinto 404; un
proceso nuevo de la API no lo revive solo.
