/** Routes that stay anonymous. Anything else in the OpenAPI document requires a bearer (S-17). */
export const PUBLIC_OPERATIONS = [
  'get /api/v1/health',
  'get /api/v1/auth/registration',
  'post /api/v1/auth/register',
  'post /api/v1/auth/login',
  'post /api/v1/auth/password-reset/request',
  'post /api/v1/auth/password-reset/verify',
  'post /api/v1/auth/password-reset/confirm',
  'post /api/v1/oauth/token',
  'post /api/v1/oauth/register',
  'post /api/v1/oauth/revoke',
  'get /.well-known/oauth-protected-resource',
  'get /.well-known/oauth-authorization-server',
  'get /browser-oauth/authorize',
  'post /api/v1/integrations/telegram/webhook',
  'post /api/v1/integrations/telegram/webhook/{ownerId}',
  'get /api/v1/integrations/google/callback',
  'post /api/v1/inbound/email',
  'get /feeds/{token}',
] as const;

const PUBLIC = new Set<string>(PUBLIC_OPERATIONS);

export function isPublicOperation(method: string, path: string): boolean {
  return PUBLIC.has(`${method.toLowerCase()} ${path}`);
}
