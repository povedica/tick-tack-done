import { createHmac, timingSafeEqual } from 'node:crypto';

const CALLBACK_PATH = '/api/v1/integrations/google/callback';

function allowedRedirects(): ReadonlySet<string> {
  const values = [`http://127.0.0.1:5173${CALLBACK_PATH}`, `http://localhost:5173${CALLBACK_PATH}`];
  const pub = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  if (pub.length > 0) {
    values.push(`${pub}${CALLBACK_PATH}`);
  }
  const web = (process.env.APP_WEB_URL ?? '').replace(/\/$/, '');
  if (web.length > 0) {
    values.push(`${web}${CALLBACK_PATH}`);
  }
  return new Set(values);
}

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

export interface GoogleState {
  readonly uid: string;
  readonly exp: number;
  readonly redirect: string;
}

export function redirectFor(origin: string | undefined): string | null {
  if (origin === undefined || origin.length === 0) {
    return null;
  }
  const candidate = `${origin}${CALLBACK_PATH}`;
  return allowedRedirects().has(candidate) ? candidate : null;
}

export function signState(state: GoogleState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const mac = createHmac('sha256', appSecret()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function readState(token: string): GoogleState | null {
  const dot = token.indexOf('.');
  if (dot <= 0) {
    return null;
  }
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', appSecret()).update(payload).digest('base64url');
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GoogleState;
    if (
      parsed.exp < Date.now() ||
      !allowedRedirects().has(parsed.redirect) ||
      parsed.uid.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function authorizeUrl(redirect: string, state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

function appSecret(): string {
  const value = process.env.APP_SECRET ?? '';
  if (value.length < 16) {
    throw new Error('APP_SECRET is missing');
  }
  return value;
}
