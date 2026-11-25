import type { Breadcrumb, ErrorEvent, Event, Exception, StackFrame } from '@sentry/react';
import { routeTemplate } from '../route-templates';

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN = /\brfx_[a-z]+_[A-Za-z0-9_-]+/g;
const BEARER = /\bBearer\s+[^\s,;]+/gi;
const SESSION = /__Host-rfx_session=[^\s;,]+/g;
// Single quotes stay: engines quote property names that way ("reading 'title'").
const QUOTED = /"[^"\n]*"|«[^»\n]*»|“[^”\n]*”/g;
const TOKEN_PATHS = /\/(feeds|public\/lists)\/[^/?#\s]+/g;
const NUMERIC = /\/\d{2,}(?=\/|$)/g;

export const ALLOWED_TAGS = new Set(['component', 'route', 'source', 'deploy_sha', 'smoke']);
export const TUNNEL_PATH = '/api/v1/sentry-tunnel';
const KEPT_CRUMBS = new Set(['navigation', 'fetch', 'xhr']);

/** Removes literals, secrets and identifiers from free text a user may have typed. */
export function scrubText(text: string, max = 300): string {
  const clean = text
    .replace(QUOTED, '"…"')
    .replace(SESSION, '[token]')
    .replace(BEARER, 'Bearer [token]')
    .replace(TOKEN, '[token]')
    .replace(EMAIL, '[email]')
    .replace(UUID, ':id');
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Path only: no origin, query or hash; tokens and ids masked. Other origins become `[external]`. */
export function safePath(raw: string, origin = currentOrigin()): string {
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return '[invalid]';
  }
  if (url.origin !== origin) {
    return '[external]';
  }
  return (
    routeTemplate(url.pathname) ??
    url.pathname
      .replace(TOKEN_PATHS, '/$1/:token')
      .replace(UUID, ':id')
      .replace(NUMERIC, '/:n')
      .replace(EMAIL, '[email]')
  );
}

/** Same-origin bundle URLs keep their path for source maps. Anything else is dropped. */
export function frameFile(raw: string | undefined, origin = currentOrigin()): string | undefined {
  if (raw === undefined) return undefined;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? `${url.origin}${url.pathname}` : undefined;
  } catch {
    return undefined;
  }
}

/** Only navigation and fetch/xhr survive, as one normalized line without data (CA-13). */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const data = (crumb.data ?? {}) as Record<string, unknown>;
  const base = baseOf(crumb);
  if (crumb.category === 'navigation') {
    const from = typeof data.from === 'string' ? safePath(data.from) : '?';
    const to = typeof data.to === 'string' ? safePath(data.to) : '?';
    return { ...base, type: 'navigation', message: `${from} -> ${to}` };
  }
  if (crumb.category === 'fetch' || crumb.category === 'xhr') {
    const url = typeof data.url === 'string' ? data.url : '';
    if (url.includes(TUNNEL_PATH)) return null;
    const method = typeof data.method === 'string' ? data.method.toUpperCase().slice(0, 8) : 'GET';
    const status = typeof data.status_code === 'number' ? ` ${String(data.status_code)}` : '';
    return { ...base, type: 'http', message: `${method} ${safePath(url)}${status}` };
  }
  return null;
}

/** Builds a new event from an allowlist. Anything not copied here never leaves the browser. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const clean: ErrorEvent = { type: undefined };
  if (event.event_id !== undefined) clean.event_id = event.event_id;
  if (event.timestamp !== undefined) clean.timestamp = event.timestamp;
  if (event.platform !== undefined) clean.platform = event.platform;
  if (event.level !== undefined) clean.level = event.level;
  if (event.release !== undefined) clean.release = event.release;
  if (event.environment !== undefined) clean.environment = event.environment;
  if (event.fingerprint !== undefined)
    clean.fingerprint = event.fingerprint.map((p) => scrubText(p));
  if (typeof event.message === 'string') clean.message = scrubText(event.message);
  const values = event.exception?.values;
  if (values !== undefined) clean.exception = { values: values.map(scrubException) };
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.tags ?? {})) {
    if (!ALLOWED_TAGS.has(key) || value === undefined || value === null) continue;
    const text = String(value);
    tags[key] = key === 'route' ? safePath(text) : scrubText(text, 64);
  }
  clean.tags = tags;
  // beforeBreadcrumb already normalized them; here only the allowlist and the text check remain.
  const crumbs = (event.breadcrumbs ?? []).flatMap((crumb): Breadcrumb[] => {
    if (crumb.category === undefined || !KEPT_CRUMBS.has(crumb.category)) return [];
    const kept = baseOf(crumb);
    if (crumb.type !== undefined) kept.type = crumb.type;
    kept.message = scrubText(crumb.message ?? '', 160);
    return [kept];
  });
  if (crumbs.length > 0) clean.breadcrumbs = crumbs;
  const images = event.debug_meta?.images?.flatMap((image) =>
    image.type === 'sourcemap'
      ? [
          {
            type: 'sourcemap' as const,
            code_file: frameFile(image.code_file) ?? '',
            debug_id: image.debug_id,
          },
        ]
      : [],
  );
  if (images !== undefined && images.length > 0) clean.debug_meta = { images };
  return clean;
}

function baseOf(crumb: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = {};
  if (crumb.category !== undefined) out.category = crumb.category;
  if (crumb.level !== undefined) out.level = crumb.level;
  if (crumb.timestamp !== undefined) out.timestamp = crumb.timestamp;
  return out;
}

function scrubException(value: Exception): Exception {
  const out: Exception = {};
  if (value.type !== undefined) out.type = scrubText(value.type, 80);
  if (value.value !== undefined) out.value = scrubText(value.value);
  if (value.mechanism !== undefined) {
    out.mechanism = { type: value.mechanism.type };
    if (value.mechanism.handled !== undefined) out.mechanism.handled = value.mechanism.handled;
  }
  const frames = value.stacktrace?.frames;
  if (frames !== undefined) out.stacktrace = { frames: frames.map(scrubFrame) };
  return out;
}

function scrubFrame(frame: StackFrame): StackFrame {
  const out: StackFrame = {};
  const file = frameFile(frame.filename);
  if (file !== undefined) {
    out.filename = file;
    out.abs_path = file;
  }
  if (frame.function !== undefined) out.function = scrubText(frame.function, 120);
  if (frame.lineno !== undefined) out.lineno = frame.lineno;
  if (frame.colno !== undefined) out.colno = frame.colno;
  if (frame.in_app !== undefined) out.in_app = frame.in_app;
  return out;
}

/** Type, message and the top frame: identical bugs share a key for the throttle. */
export function fingerprintOf(event: Event): string {
  const values = event.exception?.values ?? [];
  const last = values[values.length - 1];
  const frames = last?.stacktrace?.frames ?? [];
  const top = frames[frames.length - 1];
  return [
    last?.type ?? '',
    last?.value ?? event.message ?? '',
    top?.filename ?? '',
    top?.function ?? '',
  ].join('|');
}

function currentOrigin(): string {
  return typeof location === 'undefined' ? 'http://localhost' : location.origin;
}
