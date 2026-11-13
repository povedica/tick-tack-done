import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginAuth,
  createRequestStore,
  endAuth,
  enterRequest,
  formatServerTiming,
  normalizeRoute,
  observeQuery,
  serverTimingParts,
  SLOW_QUERY_MS,
} from './request-timing.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request timing', () => {
  it('normalizes the route and drops the query string', () => {
    const route = normalizeRoute(
      'get',
      '/api/v1/tasks/11111111-1111-4111-8111-111111111111?q=person@example.test',
    );
    expect(route).toBe('GET /api/v1/tasks/:id');
    expect(route).not.toContain('person@example.test');
  });

  it('splits auth, db, app and total and puts the query count on db', () => {
    const store = createRequestStore('req-1', 'GET /api/v1/tasks');
    store.startedAt = 0;
    store.authWallMs = 30;
    store.authDbMs = 10;
    store.dbMs = 40;
    store.queryCount = 7;
    const parts = serverTimingParts(store, 100);
    expect(parts).toEqual({ auth: 20, db: 40, app: 40, total: 100, queryCount: 7 });
    expect(formatServerTiming(parts)).toBe(
      'auth;dur=20.0, db;dur=40.0;desc="7 q", app;dur=40.0, total;dur=100.0',
    );
  });

  it('logs slow_query with the request id and without the query text', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const store = createRequestStore('req-slow', 'GET /api/v1/tasks');
    enterRequest(store);
    beginAuth();
    observeQuery(SLOW_QUERY_MS + 5, 'Task', 'findMany');
    endAuth(SLOW_QUERY_MS + 8);
    expect(store.queryCount).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0])) as {
      event: string;
      request_id: string;
      model: string;
      operation: string;
    };
    expect(payload).toMatchObject({
      event: 'slow_query',
      request_id: 'req-slow',
      model: 'Task',
      operation: 'findMany',
    });
    expect(JSON.stringify(payload)).not.toContain('select');
    expect(JSON.stringify(payload)).not.toContain('@');
  });
});
