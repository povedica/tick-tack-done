# tick-tack-done: fallo de conexión OAuth de ChatGPT (HTTP 429 + formato de error no estándar)

Fecha: 2026-10-21. Base del diagnóstico: lectura del repo público `github.com/povedica/tick-tack-done` (último commit visto: `4e89f7b`, 2026-10-20 17:01 +0200) y del texto de error que reportó tu agente.

Alcance y límite de este diagnóstico: el código confirma defectos posibles de esa versión del repo, coherentes con el síntoma, pero NO confirma qué endpoint falló en vivo, en qué capa se generó el 429 ni qué tráfico real hizo ChatGPT. No se capturó tráfico real ni se reprodujeron llamadas contra producción. La versión desplegada o tu copia local pueden ir por delante del commit revisado: verifica cada punto contra el código actual antes de cambiar nada.

## Síntoma reportado

Al añadir el conector MCP en ChatGPT con la URL `https://todo.reflexionia.com/api/v1/mcp`, el inicio de sesión OAuth no arranca: el servidor respondió `429 Too many requests` y pide esperar ~15 minutos. Además, el cuerpo del error llegó como `{"error":{"code":"rate_limited",...}}` (objeto) y el cliente OAuth de ChatGPT no pudo leerlo, porque espera `error` como texto.

## Hallazgo 1 - Límite de peticiones bajo y compartido (posible origen del 429)

Archivo: `apps/api/src/auth/attempt-limiter.ts` (control S-01 de la auditoría de seguridad). Ventana de 15 minutos (`WINDOW_MS = 15 * 60 * 1000`), en Redis en producción.

Buckets (según el código):

- `ip:<ip>` con `IP_LIMIT = 10`: lo consumen SOLO las llamadas instrumentadas: login (`auth.service.ts`), OAuth authorize GET y consent POST, OAuth token, OAuth revoke (`oauth.service.ts`) y TOTP (`totp.controller.ts`). `recordAttempt(ip)` se ejecuta en cada llamada, incluidas las exitosas: intercambios de código y refrescos válidos también gastan el presupuesto.
- `register:<ip>` con `REGISTER_LIMIT = 5`: solo el registro dinámico de clientes (`/oauth/register`). Bucket aparte.
- Los endpoints de discovery (`/.well-known/*`) no pasan por el limiter.

Lectura correcta: ni el discovery ni el registro cargan el bucket compartido. Lo que lo consume en un intento de conexión son las llamadas instrumentadas (authorize, consent, token) más tus propios logins en la web y reintentos, todo bajo la misma IP. Con 10 por 15 minutos compartidos, el presupuesto es fácil de agotar durante la configuración de un conector nuevo.

Cuando el bucket está agotado, `assertAllowed` solo hace `peek` (no suma): la ventana expira 15 minutos después del primer intento de la racha, y reintentar estando bloqueado no la extiende.

El cuerpo de error que vio tu agente (`{"code":"rate_limited",...}`) coincide con la forma que produce esta API (`DomainException` + `api-exception.filter.ts`), lo cual es coherente con que el 429 lo emitiese la API NestJS. En el commit revisado el `Caddyfile` no tiene límite de peticiones, pero esto no descarta otras capas en el despliegue real.

## Hallazgo 2 - Formato de error no conforme con OAuth en las rutas OAuth

Archivo: `apps/api/src/http/api-exception.filter.ts` (función `errorBody`).

Todos los errores de la API se serializan como:

```json
{ "error": { "code": "rate_limited", "message": "Too many requests", "details": { "retry_after": 812 } } }
```

Es el formato interno de la API (lo usa la web), pero en los endpoints OAuth incumple el estándar:

- Token endpoint (RFC 6749 §5.2, https://www.rfc-editor.org/rfc/rfc6749#section-5.2): `error` es OBLIGATORIO y es un único código en texto (`invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`), con `error_description` y `error_uri` opcionales, serializados como JSON plano de primer nivel. HTTP 400 salvo indicación contraria.
- Registro dinámico (RFC 7591 §3.2.2, https://www.rfc-editor.org/rfc/rfc7591#section-3.2.2): mismo patrón, códigos `invalid_redirect_uri`, `invalid_client_metadata`, `invalid_software_statement`, `unapproved_software_statement`.
- Recurso protegido (RFC 6750 §3, https://www.rfc-editor.org/rfc/rfc6750#section-3): códigos `invalid_request`, `invalid_token`, `insufficient_scope`, comunicados también por la cabecera `WWW-Authenticate`.

Forma esperada (ejemplo del propio RFC 6749):

```json
{ "error": "invalid_request", "error_description": "..." }
```

Afecta a TODOS los errores JSON de `/oauth/*` y `/api/v1/oauth/*` (invalid_client, invalid_grant, redirect_uri no registrada, PKCE incorrecto, etc.), no solo al 429: aunque el límite no saltara, cualquier fallo OAuth le llegaría a ChatGPT en un formato que no puede interpretar.

Ojo con la distinción authorize vs token: los errores del endpoint de autorización NO se devuelven como JSON; se devuelven redirigiendo al `redirect_uri` con los parámetros `error`/`error_description`/`state` en la query (RFC 6749 §4.1.2.1, https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2.1), y solo tras validar que el `redirect_uri` coincide exactamente con uno registrado (RFC 6749 §3.1.2, https://www.rfc-editor.org/rfc/rfc6749#section-3.1.2). Si el `redirect_uri` no es válido, no se redirige: se muestra el error directamente al usuario. El formato JSON aplica a token, registro y revocación.

Lo que sí está bien y hay que conservar:

- La cabecera `Retry-After` se envía en los 429 (`api-exception.filter.ts`, bloque `getStatus() === 429`).
- Metadata RFC 8414 (https://www.rfc-editor.org/rfc/rfc8414) y RFC 9728 (https://www.rfc-editor.org/rfc/rfc9728) correcta: `token_endpoint` = `/api/v1/oauth/token`, `registration_endpoint` = `/api/v1/oauth/register`, PKCE `S256`, `token_endpoint_auth_methods_supported: ["none"]`.
- Los códigos internos del servicio ya usan nombres OAuth válidos (`invalid_client`, `invalid_grant`, ...); el problema es solo el envoltorio JSON.

## Cambios pedidos

### Cambio 1 (obligatorio): formato de error conforme en las rutas OAuth

En `api-exception.filter.ts` o en un filtro específico del módulo OAuth:

- Token, registro y revocación: devolver `{ "error": "<codigo>", "error_description": "<mensaje>" }` con `error` como string de primer nivel, mapeando los códigos internos a los registrados en RFC 6749 §5.2 y RFC 7591 §3.2.2 según el endpoint.
- Autorización: errores por redirección con parámetros query según RFC 6749 §4.1.2.1, tras validación estricta (coincidencia exacta) del `redirect_uri`; sin redirección si la URI no es válida.
- NO cambiar el formato interno `{error:{code,message,details}}` del resto de la API: la web depende de él.

Sobre el 429 en concreto: RFC 6749 §5.2 no registra ningún código para rate limiting en el token endpoint (`temporarily_unavailable` existe solo para el endpoint de autorización, §4.1.2.1). Es una decisión de compatibilidad que hay que tomar y verificar contra el cliente real: usar `temporarily_unavailable` como extensión o mantener `rate_limited` como string no registrado; en ambos casos lo crítico es que `error` sea texto y que `Retry-After` siga presente. Verificar qué acepta el cliente de ChatGPT antes de cerrar la decisión.

### Cambio 2 (obligatorio): aislar y dimensionar el límite de OAuth sin quitar protección

En `attempt-limiter.ts` y sus usos:

- Sacar las rutas OAuth del bucket compartido de login: bucket propio (p. ej. `oauth-ip:<ip>` o por IP+client_id).
- Mantener DOS límites para OAuth: uno de volumen global que sí cuente éxitos (protección DoS y de abuso de refrescos), dimensionado para que un flujo de conexión normal con algún reintento y los refrescos posteriores quepan con holgura; y el bucket estricto de fallos ya existente (`fail:<subject>`, 5/15 min) intacto.
- Mantener `REGISTER_LIMIT` bajo, pero ten en cuenta que borrar y recrear el conector en ChatGPT puede registrar un cliente nuevo cada vez.
- No eliminar el limiter: es el control S-01 de la auditoría de seguridad.
- Verificar la topología real de proxies antes de fijar `TRUST_PROXY_HOPS`: debe ser el número exacto de proxies de confianza del despliegue (no asumir 1). Con un valor incorrecto, `req.ip` puede ser la del proxy (todos los clientes compartirían bucket) o, peor, un cliente podría falsificar `X-Forwarded-For` para evadir el límite o cargar el bucket de terceros.

### Cambio 3 (recomendado): tests en entorno aislado

En tests/staging con límites configurables (no en producción):

- Errores de `/oauth/token`, `/oauth/register` y `/oauth/revoke` devuelven `error` string + `error_description` (RFC 6749 §5.2 / RFC 7591 §3.2.2).
- Errores de `/oauth/authorize` se entregan por redirección con `error` en query solo a `redirect_uri` registradas; sin redirección si no valida.
- 429 OAuth con `Retry-After` y `error` string.
- El formato interno de errores del resto de la API no cambia (tests existentes siguen pasando).

## Criterios de aceptación

1. Un flujo de conexión normal de ChatGPT (discovery -> registro dinámico -> authorize -> consent -> intercambio de código -> primera llamada MCP -> un refresco) completa sin 429 en entorno de pruebas con límites representativos.
2. Provocar un error de token (p. ej. `code_verifier` incorrecto) y comprobar respuesta HTTP 400 con `{"error":"invalid_grant",...}` y `error` string.
3. Agotar el límite OAuth a propósito en staging y comprobar HTTP 429 + `Retry-After` + `error` string, y que tras esperar el `Retry-After` indicado el flujo vuelve a funcionar.
4. El login web y el resto de la API siguen devolviendo el formato de error interno actual.

## Mientras se despliega el arreglo (operativo, sin cambios de código)

- Esperar el tiempo que indique la cabecera `Retry-After` de la respuesta 429 si está disponible; si no se puede ver, ~15 minutos desde el primer intento de la racha (la ventana del limiter en el código revisado).
- Reintentar una sola vez y, si vuelve a fallar, capturar la respuesta HTTP completa (endpoint, status, cabeceras, cuerpo) para el siguiente diagnóstico. Según el código revisado, reintentar estando bloqueado no extiende la ventana (solo `peek`), pero cada intento con presupuesto disponible sí lo consume.

## Fuentes normativas verificadas

- RFC 6749 §5.2, errores del token endpoint: https://www.rfc-editor.org/rfc/rfc6749#section-5.2
- RFC 6749 §4.1.2.1, errores del endpoint de autorización (redirección, incluye `temporarily_unavailable`): https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2.1
- RFC 6749 §3.1.2, requisitos de `redirect_uri`: https://www.rfc-editor.org/rfc/rfc6749#section-3.1.2
- RFC 7591 §3.2.2, errores de registro dinámico: https://www.rfc-editor.org/rfc/rfc7591#section-3.2.2
- RFC 6750 §3, errores del recurso protegido y `WWW-Authenticate`: https://www.rfc-editor.org/rfc/rfc6750#section-3
- RFC 8414, metadata del authorization server: https://www.rfc-editor.org/rfc/rfc8414
- RFC 9728, metadata del recurso protegido: https://www.rfc-editor.org/rfc/rfc9728
