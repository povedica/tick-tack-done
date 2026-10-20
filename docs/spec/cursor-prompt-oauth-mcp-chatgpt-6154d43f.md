# Prompt para Cursor: OAuth en el MCP de tick-tack-done para ChatGPT

Contexto: repo povedica/tick-tack-done, API NestJS en `apps/api`, MCP en `POST /api/v1/mcp` (Streamable HTTP, JSON-RPC, sin sesión, `apps/api/src/mcp`). Hoy el MCP solo acepta `Authorization: Bearer <PAT>` (tokens personales con scopes). ChatGPT solo permite conectar MCP personalizados con OAuth, así que no puede usarlo.

## Lo que ya existe (no lo rehagas, reutilízalo)

Revisa `apps/api/src/auth/oauth.controller.ts`, `oauth.service.ts`, `oauth.dto.ts`, `pkce.ts`, `scopes.ts`, `api-auth.guard.ts`, `tokens.service.ts` y `apps/web/src/features/auth/ConsentPage.tsx`:

- Authorization Code + PKCE (S256), clientes públicos sin secreto, registro manual con `POST /oauth/clients` (requiere `account:admin`, solo sesión de navegador).
- `GET /oauth/authorize` (JSON de consentimiento, requiere sesión) y `POST` de consentimiento que devuelve `redirect_to`.
- `POST /oauth/token` intercambia el code (TTL 10 min, un solo uso) por un token PAT `Bearer`, con los scopes aprobados. Respuesta actual: `access_token`, `token_type`, `scope`.

## Lo que falta para que ChatGPT conecte (objetivo)

ChatGPT (y el estándar MCP de autorización) espera descubrimiento y registro automáticos. Implementa:

1. **401 con descubrimiento.** Cuando `/api/v1/mcp` recibe petición sin credencial válida, responde 401 con cabecera `WWW-Authenticate: Bearer resource_metadata="https://todo.reflexionia.com/.well-known/oauth-protected-resource"` (verifica el path real del MCP y la URL pública).
2. **Protected Resource Metadata (RFC 9728)** en `/.well-known/oauth-protected-resource`: `resource` (URL del MCP), `authorization_servers`, `scopes_supported`.
3. **Authorization Server Metadata (RFC 8414)** en `/.well-known/oauth-authorization-server`: `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `scopes_supported`.
4. **Dynamic Client Registration (RFC 7591)** en `POST /oauth/register`, pública pero con rate limit estricto: clientes públicos (sin secreto), `redirect_uris` obligatorias y validadas. Lista blanca de redirect URIs de ChatGPT (por ejemplo `https://chatgpt.com/connector_platform_oauth_redirect` y los que documente OpenAI; compruébalos en la ayuda de OpenAI antes de fijarlos) más `http://localhost`/`127.0.0.1` para pruebas. Un cliente registrado así no obtiene nada sin consentimiento del dueño.
5. **Endpoint `/authorize` navegable.** Hoy devuelve JSON para la SPA. Añade la ruta de navegador `GET /oauth/authorize` (o redirige a la SPA, p. ej. `/oauth/consent?...`) que: si no hay sesión, lleva a login y vuelve; si la hay, muestra `ConsentPage` con nombre del cliente, redirect URI y scopes pedidos, y botones Aprobar/Denegar. Respeta `state`, `code_challenge`, `code_challenge_method=S256` y el parámetro `resource` (RFC 8707).
6. **Refresh tokens.** `POST /oauth/token` con `grant_type=refresh_token`: refresh token opaco, hash en BD, rotación en cada uso, detección de reutilización (si se reutiliza uno ya rotado, revoca toda la cadena). Access token con caducidad corta (por ejemplo 1 hora). Incluye `expires_in` y `refresh_token` en la respuesta.
7. **Parámetro `scope` opcional.** Si el cliente no lo envía, usa el conjunto por defecto del MCP (ver abajo). Nunca concedas más de lo que el dueño aprobó en la pantalla de consentimiento.
8. **Revocación.** Los tokens OAuth aparecen en la página "Tokens y MCP" con nombre del cliente (p. ej. "ChatGPT"), último uso y botón de revocar (revoca access y refresh). Añade `POST /oauth/revoke` (RFC 7009). El audit log (`token-audit.ts`) registra emisión, refresco, uso y revocación.
9. **Caddy / proxy.** `deploy/production/todo.caddy` solo enruta `/api/*`, `/feeds/*`, `/open/*`. Enruta también `/.well-known/oauth-*` y `/oauth/*` a `todo-api` (o sirve los metadatos bajo `/api/`, y ajusta los campos de los metadatos en consecuencia). Confirma que `/api/docs*` sigue en 404.
10. **CORS.** Permite solo lo necesario para `/.well-known/*`, `/oauth/register` y `/oauth/token` desde el origen de ChatGPT; el resto sigue cerrado.

## Scopes: respetar los existentes

- No cambies `API_SCOPES` ni la semántica de los PAT actuales. Los PAT siguen funcionando igual (el guard debe aceptar PAT y token OAuth).
- `account:admin` NO se puede conceder por OAuth (solo sesión de navegador), igual que hoy con los PAT.
- Scopes por defecto sugeridos para el cliente ChatGPT, los mismos que el token de agente actual (21 scopes): tasks, lists, tags, filters, habits, focus, notes, calendar (read/write), `reminders:write`, `profile:read`, `webhooks:manage`, `automations:manage`. Excluidos: `profile:write` y `backup:read`. En la pantalla de consentimiento el dueño puede desmarcar scopes.
- `tools/list` del MCP debe seguir filtrando por scopes del token: ChatGPT solo ve las herramientas que su token permite.
- Los tokens OAuth heredan los mismos límites de rate limit y auditoría que los PAT (`token-rate-limit.ts`).

## Seguridad (mínimos)

- PKCE S256 obligatorio; rechaza `plain`. Validación exacta de `redirect_uri` (sin comodines).
- Codes de un solo uso, TTL 10 min, atados a client_id + redirect_uri + code_challenge.
- Secretos y refresh tokens solo como hash en BD (reutiliza `token-secret.ts`). Nada de tokens en logs.
- Mismo `issuer` y URL pública en metadatos y tokens (sin IP ni nombres internos).
- Rate limit en `/oauth/register`, `/oauth/token`, `/oauth/authorize` (reutiliza `attempt-limiter.ts`).
- El repo es público: sin secretos, IP ni usuarios del servidor en código, docs ni tests.

## Tests y criterios de aceptación

- Unit: PKCE, rotación y reutilización de refresh, validación de redirect URI, scopes concedidos <= aprobados.
- E2E (`apps/api/test/mcp.e2e-spec.ts` como base): sin token, `/api/v1/mcp` devuelve 401 con `WWW-Authenticate` y `resource_metadata`; los dos `.well-known` devuelven JSON válido; registro dinámico, authorize + consent, token, refresh, llamada a `tools/list` con token OAuth, revocación y 401 posterior.
- Regresión: los PAT existentes y la sesión web siguen funcionando; los tests actuales del MCP pasan.
- Prueba manual: en ChatGPT web, Plugins > `+` > "Add custom MCP server", URL `https://todo.reflexionia.com/api/v1/mcp`, autenticación OAuth. Debe abrir el login/consentimiento, volver a ChatGPT y listar las herramientas. Crear una tarea de prueba y borrarla.
- Documenta en `docs/` el flujo, los endpoints y cómo revocar.

## Cómo trabajar

Rama nueva (no push a main), commits pequeños, migración Prisma con `down.sql` como las existentes. Antes de codificar, resume en 10 líneas qué reutilizas y qué cambias, y qué te falta verificar de la documentación de OpenAI.

Nota: ChatGPT puede limitar la escritura por MCP según el plan (según la ayuda de OpenAI, beta en Business/Enterprise/Edu). Si el plan de Pablo no la permite, el OAuth quedará listo pero ChatGPT podría solo leer.
