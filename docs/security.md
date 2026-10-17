# Seguridad

Puntos de la sección 15 que condicionan el día a día:

- Argon2id para contraseñas; PATs con hash (se muestran una vez), scopes mínimos, un token por
  agente, auditoría por token en ActivityLog.
- Scopes declarados por endpoint (`@Scopes`), guard global, rate limit 1000 req/15 min por token.
- Webhooks firmados HMAC-SHA256 con reintentos exponenciales.
- Secretos solo por entorno; `.env.example` nunca lleva valores reales.
- Toda entrada externa es no confiable: validar tamaño y forma (email-to-task, adjuntos 25 MB).
- Sin telemetría a terceros por defecto.
