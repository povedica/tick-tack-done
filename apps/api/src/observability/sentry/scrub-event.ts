import type { Breadcrumb, ErrorEvent, EventHint, Exception, StackFrame } from '@sentry/core';
import { describeError, describeParts, scrubText, safePath } from '../redact.js';

/** Closed list (CA-05). Any other tag is dropped. */
export const ALLOWED_TAGS = [
  'component',
  'route',
  'request_id',
  'queue',
  'job',
  'mcp.method',
  'mcp.tool',
  'deploy_sha',
  'smoke',
] as const;

const ALLOWED = new Set<string>(ALLOWED_TAGS);
const USER_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Builds a new event from an allowlist: exception, closed tags, release,
 * environment, level and user.id. Request, extra, contexts, cookies, headers,
 * bodies, query strings, server name and breadcrumb data never survive.
 */
export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent {
  const out: ErrorEvent = { type: undefined };
  if (event.event_id !== undefined) out.event_id = event.event_id;
  if (event.timestamp !== undefined) out.timestamp = event.timestamp;
  if (event.platform !== undefined) out.platform = event.platform;
  if (event.level !== undefined) out.level = event.level;
  if (event.release !== undefined) out.release = event.release;
  if (event.environment !== undefined) out.environment = event.environment;
  if (event.fingerprint !== undefined) out.fingerprint = event.fingerprint;
  if (typeof event.message === 'string') {
    out.message = scrubText(event.message);
  }
  const values = event.exception?.values;
  if (values !== undefined && values.length > 0) {
    const original = hint?.originalException;
    out.exception = {
      values: values.map((value, index) =>
        scrubException(value, index === values.length - 1 ? original : undefined),
      ),
    };
  }
  const tags = scrubTags(event.tags);
  if (tags !== undefined) {
    out.tags = tags;
  }
  const id = event.user?.id;
  if (typeof id === 'string' && USER_ID.test(id)) {
    out.user = { id };
  }
  if (event.breadcrumbs !== undefined && event.breadcrumbs.length > 0) {
    out.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }
  return out;
}

function scrubException(value: Exception, original: unknown): Exception {
  const parts =
    original instanceof Error
      ? describeError(original)
      : describeParts(value.type ?? 'Error', value.value ?? '');
  const out: Exception = { type: parts.name, value: parts.message };
  if (value.mechanism !== undefined) {
    out.mechanism = { type: value.mechanism.type };
    if (value.mechanism.handled !== undefined) out.mechanism.handled = value.mechanism.handled;
  }
  const frames = value.stacktrace?.frames;
  if (frames !== undefined) {
    out.stacktrace = { frames: frames.map(scrubFrame) };
  }
  return out;
}

function scrubFrame(frame: StackFrame): StackFrame {
  const out: StackFrame = {};
  const path = frame.filename ?? frame.abs_path;
  if (path !== undefined) out.filename = scrubText(repoPath(path), 500);
  if (frame.module !== undefined) out.module = scrubText(frame.module, 200);
  if (frame.function !== undefined) out.function = scrubText(frame.function, 200);
  if (frame.lineno !== undefined) out.lineno = frame.lineno;
  if (frame.colno !== undefined) out.colno = frame.colno;
  if (frame.in_app !== undefined) out.in_app = frame.in_app;
  return out;
}

/**
 * Host and container paths become repo paths: `/app/src/x.ts` and
 * `/home/ci/…/apps/api/src/x.ts` both read `apps/api/src/x.ts`.
 */
export function repoPath(path: string): string {
  const modules = path.lastIndexOf('/node_modules/');
  if (modules >= 0) {
    return path.slice(modules + 1);
  }
  const app = /^(?:.*\/)?apps\/api\/(.*)$/.exec(path) ?? /^\/app\/(.*)$/.exec(path);
  return app?.[1] === undefined ? path : `apps/api/${app[1]}`;
}

function scrubTags(tags: ErrorEvent['tags']): Record<string, string> | undefined {
  if (tags === undefined) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!ALLOWED.has(key) || value === undefined || value === null) {
      continue;
    }
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    out[key] = key === 'route' ? safePath(scrubText(text, 200)) : scrubText(text, 200);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Only navigation and fetch/xhr survive, with a normalized URL and no data. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = {};
  if (breadcrumb.type !== undefined) out.type = breadcrumb.type;
  if (breadcrumb.category !== undefined) out.category = breadcrumb.category;
  if (breadcrumb.level !== undefined) out.level = breadcrumb.level;
  if (breadcrumb.timestamp !== undefined) out.timestamp = breadcrumb.timestamp;
  return out;
}

/** Stable key for the throttle: exception type, scrubbed message and top frame. */
export function fingerprintOf(event: ErrorEvent): string {
  const values = event.exception?.values;
  const last = values?.[values.length - 1];
  if (last === undefined) {
    return `message:${event.message ?? ''}`;
  }
  const frames = last.stacktrace?.frames ?? [];
  const top = frames[frames.length - 1];
  const where = top === undefined ? '' : `${top.filename ?? ''}:${String(top.lineno ?? '')}`;
  return `${last.type ?? ''}:${last.value ?? ''}:${where}`;
}
