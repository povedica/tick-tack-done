import { AsyncLocalStorage } from 'node:async_hooks';
import { Logger } from '@nestjs/common';
import type { Response } from 'express';

/** A single query slower than this is a slow_query log. */
export const SLOW_QUERY_MS = 50;
/** A response slower than this is a slow_request log. */
export const SLOW_REQUEST_MS = 200;

const logger = new Logger('RequestTiming');

export interface RequestTimingStore {
  readonly requestId: string;
  readonly route: string;
  startedAt: number;
  authWallMs: number;
  authDbMs: number;
  inAuth: boolean;
  dbMs: number;
  queryCount: number;
}

export interface ServerTimingParts {
  readonly auth: number;
  readonly db: number;
  readonly app: number;
  readonly total: number;
  readonly queryCount: number;
}

const storage = new AsyncLocalStorage<RequestTimingStore>();

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Path only: drop the query string and replace ids. No emails, titles, or user ids. */
export function normalizeRoute(method: string, path: string): string {
  const bare = path.split('?')[0] ?? path;
  const withIds = bare.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');
  return `${method.toUpperCase()} ${withIds}`;
}

export function enterRequest(store: RequestTimingStore): void {
  storage.enterWith(store);
}

export function createRequestStore(requestId: string, route: string): RequestTimingStore {
  return {
    requestId,
    route,
    startedAt: performance.now(),
    authWallMs: 0,
    authDbMs: 0,
    inAuth: false,
    dbMs: 0,
    queryCount: 0,
  };
}

export function beginAuth(): void {
  const store = storage.getStore();
  if (store !== undefined) {
    store.inAuth = true;
  }
}

export function endAuth(wallMs: number): void {
  const store = storage.getStore();
  if (store === undefined) {
    return;
  }
  store.inAuth = false;
  store.authWallMs += wallMs;
}

export function observeQuery(durationMs: number, model: string, operation: string): void {
  const store = storage.getStore();
  if (store !== undefined) {
    store.dbMs += durationMs;
    store.queryCount += 1;
    if (store.inAuth) {
      store.authDbMs += durationMs;
    }
  }
  if (durationMs <= SLOW_QUERY_MS) {
    return;
  }
  logger.warn(
    JSON.stringify({
      event: 'slow_query',
      request_id: store?.requestId ?? null,
      duration_ms: roundMs(durationMs),
      model,
      operation,
    }),
  );
}

export function serverTimingParts(
  store: RequestTimingStore,
  now = performance.now(),
): ServerTimingParts {
  const total = Math.max(0, now - store.startedAt);
  const auth = Math.max(0, store.authWallMs - store.authDbMs);
  const db = Math.max(0, store.dbMs);
  const app = Math.max(0, total - auth - db);
  return { auth, db, app, total, queryCount: store.queryCount };
}

export function formatServerTiming(parts: ServerTimingParts): string {
  return [
    `auth;dur=${parts.auth.toFixed(1)}`,
    `db;dur=${parts.db.toFixed(1)};desc="${String(parts.queryCount)} q"`,
    `app;dur=${parts.app.toFixed(1)}`,
    `total;dur=${parts.total.toFixed(1)}`,
  ].join(', ');
}

/** Sets Server-Timing once, just before headers leave. Logs slow_request without personal data. */
export function installServerTiming(res: Response, store: RequestTimingStore): void {
  let applied = false;
  const apply = (): void => {
    if (applied || res.headersSent) {
      return;
    }
    applied = true;
    const parts = serverTimingParts(store);
    res.setHeader('Server-Timing', formatServerTiming(parts));
    if (parts.total <= SLOW_REQUEST_MS) {
      return;
    }
    logger.warn(
      JSON.stringify({
        event: 'slow_request',
        request_id: store.requestId,
        route: store.route,
        total_ms: roundMs(parts.total),
        auth_ms: roundMs(parts.auth),
        db_ms: roundMs(parts.db),
        app_ms: roundMs(parts.app),
        query_count: parts.queryCount,
      }),
    );
  };
  const writeHead = res.writeHead.bind(res);
  res.writeHead = function writeHeadWithTiming(...args: Parameters<Response['writeHead']>) {
    apply();
    return writeHead(...args);
  } as Response['writeHead'];
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}
