# OAuth del MCP para ChatGPT

ChatGPT solo conecta un MCP personalizado con OAuth. El servidor MCP sigue en
`POST /api/v1/mcp` y acepta tanto un PAT (`Authorization: Bearer`) como un access
token de OAuth. Los PAT no cambian: no caducan, no llevan refresh y `account:admin`
sigue reservado a la sesión del navegador.

## Descubrimiento

Una petición a `/api/v1/mcp` sin credencial válida responde `401` con:

```http
WWW-Authenticate: Bearer resource_metadata="https://todo.reflexionia.com/.well-known/oauth-protected-resource"
```

El origen sale de `PUBLIC_URL` (en producción, `https://todo.reflexionia.com`).

| Documento                           | Ruta                                          |
| ----------------------------------- | --------------------------------------------- |
| Recurso protegido (RFC 9728)        | `GET /.well-known/oauth-protected-resource`   |
| Servidor de autorización (RFC 8414) | `GET /.well-known/oauth-authorization-server` |

El recurso es `https://todo.reflexionia.com/api/v1/mcp`. El emisor (`issuer`) es el
mismo origen y aparece en `authorization_servers`. El metadato anuncia
`authorization_response_iss_parameter_supported: true` y cada redirección de
consentimiento incluye `iss` con ese valor (RFC 9207). Así ChatGPT puede usar la URI
de retorno estable.

## Endpoints

| Método | Ruta                                               | Quién                                                                                         |
| ------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/oauth/register` (alias `/oauth/register`) | Público, con límite estricto. Registro dinámico (RFC 7591) de clientes públicos, sin secreto. |
| `GET`  | `/oauth/authorize`                                 | Navegador. Sin sesión va a `/login` y vuelve; con sesión abre `/oauth/consent`.               |
| `GET`  | `/api/v1/oauth/authorize`                          | JSON de la pantalla de consentimiento (sesión).                                               |
| `POST` | `/api/v1/oauth/authorize`                          | Aprueba o deniega. Devuelve `redirect_to`.                                                    |
| `POST` | `/api/v1/oauth/token` (alias `/oauth/token`)       | Canjea el código o rota el refresh.                                                           |
| `POST` | `/api/v1/oauth/revoke` (alias `/oauth/revoke`)     | Revoca access y refresh (RFC 7009). Responde 200 aunque el token sea desconocido.             |
| `POST` | `/api/v1/oauth/clients`                            | Registro manual. Exige `account:admin` y sesión de navegador.                                 |

Caddy envía `/.well-known/oauth-*`, `/oauth/authorize`, `/oauth/token`, `/oauth/register`
y `/oauth/revoke` a la API. `/oauth/consent` se queda en la aplicación web.
`/api/docs*` sigue en 404.

CORS solo abre `/.well-known/oauth-*`, `/oauth/register`, `/oauth/token` y sus rutas
`/api/v1` para `https://chatgpt.com` y `https://chat.openai.com`.

## Registro y consentimiento

El registro dinámico solo acepta estas URI de redirección, comparadas de forma exacta
(sin comodines):

- `https://chatgpt.com/connector_platform_oauth_redirect` (estable, con identificación del emisor).
- `https://chatgpt.com/connector/oauth/{callback_id}` (la que usa ChatGPT si el servidor no anuncia `iss`).
- `http://localhost` y `http://127.0.0.1`, con puerto y ruta, para pruebas.

Fuente: [autenticación de plugins de OpenAI](https://developers.openai.com/plugins/build/auth)
(octubre 2026). Un cliente registrado no recibe datos hasta que el dueño aprueba la pantalla.

PKCE es obligatorio y solo vale `S256`. El código dura 10 minutos, es de un solo uso y
queda atado a `client_id`, `redirect_uri` y `code_challenge`. El parámetro `resource`
(RFC 8707) tiene que ser la URL del MCP.

Si el cliente no envía `scope`, el techo es el conjunto por defecto del MCP: lectura y
escritura de tareas, listas, etiquetas, filtros, hábitos, foco, notas y calendario, más
`reminders:write`, `profile:read`, `webhooks:manage` y `automations:manage` (20; el
encargo los contaba como 21). No entran por defecto `countdowns:*`, `profile:write` ni
`backup:read`. El dueño puede desmarcar permisos. El token nunca supera lo aprobado ni
lo pedido. `account:admin` no se puede conceder.

## Tokens

El access token caduca a la hora (`expires_in: 3600`) y se guarda como el resto de PAT:
solo el hash. El refresh es opaco, también solo hash, dura 30 días y rota en cada uso.
Si se presenta un refresh ya rotado o revocado, se revoca toda la cadena (access y
refresh). El mismo límite de ritmo y la misma auditoría que un PAT se aplican al uso.
La auditoría registra además emisión, refresco, revocación y reutilización.

En **Ajustes → Tokens y MCP** cada token de OAuth muestra el nombre del cliente
(por ejemplo «ChatGPT»), el último uso y el botón de revocar, que invalida access y refresh.

## Conectar ChatGPT

1. En ChatGPT web: Plugins → `+` → Add custom MCP server.
2. URL del servidor: `https://todo.reflexionia.com/api/v1/mcp`. Autenticación: OAuth.
3. ChatGPT abre el inicio de sesión y la pantalla de consentimiento. Al aprobar, vuelve a ChatGPT y lista las herramientas que permiten los scopes del token.
4. Para cortar el acceso: Ajustes → Tokens y MCP → revocar el token «ChatGPT», o `POST /api/v1/oauth/revoke`.

Según la ayuda de OpenAI, las acciones de escritura por MCP están en beta en planes
Business, Enterprise y Edu. Si el plan no las permite, el OAuth queda listo y ChatGPT
puede limitarse a leer.

No hace falta ningún secreto de cliente en el repositorio. Los tokens no se escriben en logs.
