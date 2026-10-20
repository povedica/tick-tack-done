import type { NextFunction, Request, Response } from 'express';

const CHATGPT_ORIGINS = new Set(['https://chatgpt.com', 'https://chat.openai.com']);

const CORS_PATHS = new Set([
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-authorization-server',
  '/oauth/register',
  '/oauth/token',
  '/api/v1/oauth/register',
  '/api/v1/oauth/token',
]);

const ALIASES = new Set(['/oauth/token', '/oauth/register', '/oauth/revoke']);

/** Routes public OAuth aliases onto /api/v1 and allows ChatGPT to call discovery and the token endpoint. */
export function oauthEdgeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = (req.originalUrl.length > 0 ? req.originalUrl : req.url).split('?')[0] ?? '';
  if (req.method === 'GET' && path === '/oauth/authorize') {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `/browser-oauth/authorize${query}`;
  } else if (req.method === 'POST' && ALIASES.has(path)) {
    req.url = `/api/v1${req.url}`;
  }
  const origin = req.header('origin');
  if (origin !== undefined && CHATGPT_ORIGINS.has(origin) && CORS_PATHS.has(path)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
  }
  next();
}
