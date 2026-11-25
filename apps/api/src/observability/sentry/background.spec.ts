import { EventEmitter } from 'node:events';
import type { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leaks, TRAP } from '../../../test/helpers/pii-trap.js';
import { fakeTransport, type CapturedEnvelopes } from '../../../test/helpers/sentry-transport.js';
import { ApiExceptionFilter } from '../../http/api-exception.filter.js';
import { McpService } from '../../mcp/mcp.service.js';
import { isolated, reportCalendarSyncFailure } from '../background-failure.js';
import { watchQueue } from '../queue-failures.js';
import { cronEveryTicks, TickHeartbeat } from './cron.js';
import { closeSentry, initSentry } from './sentry.js';

const ENABLED = {
  SENTRY_ENABLED: 'true',
  SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
  SENTRY_ENVIRONMENT: 'production',
  GIT_COMMIT: 'abcdef1234567890',
};

let captured: CapturedEnvelopes;

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  const fake = fakeTransport();
  captured = fake.captured;
  initSentry(ENABLED, { transport: fake.transport, processHandlers: false });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await closeSentry();
});

async function sentEvents(): Promise<Record<string, unknown>[]> {
  await Sentry.flush(2_000);
  return captured.events();
}

describe('Sentry in background work', () => {
  it('CA-07/CA-05: a failed domain-events job sends 1 worker event without its data', async () => {
    const worker = new EventEmitter();
    watchQueue('domain-events', null, worker);
    worker.emit(
      'failed',
      { name: 'task.created@v1', id: 'job-1', attemptsMade: 1, data: { title: TRAP.title } },
      new Error(`listener failed for ${TRAP.email}`),
    );
    const events = await sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tags: { component: 'worker', queue: 'domain-events', job: 'task.created@v1' },
    });
    expect(leaks(captured.raw.join('\n'))).toEqual([]);
  });

  it('an intermediate attempt is not reported; the last attempt is', async () => {
    const worker = new EventEmitter();
    watchQueue('domain-events', null, worker);
    worker.emit(
      'failed',
      { name: 'task.created@v1', id: 'job-1', attemptsMade: 1, opts: { attempts: 3 } },
      new Error('try again'),
    );
    expect(await sentEvents()).toEqual([]);
    worker.emit(
      'failed',
      { name: 'task.created@v1', id: 'job-1', attemptsMade: 3, opts: { attempts: 3 } },
      new Error('gave up'),
    );
    expect(await sentEvents()).toHaveLength(1);
  });

  it('a repeating calendar sync stays an error and sends one event per fingerprint', async () => {
    reportCalendarSyncFailure('google', 'calendar_fetch_failed');
    reportCalendarSyncFailure('google', 'calendar_fetch_failed');
    reportCalendarSyncFailure('ical', 'calendar_fetch_failed');
    const events = await sentEvents();
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.level === 'error')).toBe(true);
    expect(events.map((event) => event.fingerprint)).toEqual([
      ['calendar-sync|google|calendar_fetch_failed'],
      ['calendar-sync|ical|calendar_fetch_failed'],
    ]);
  });

  it('CA-07: a failed local-day job sends 1 worker event', async () => {
    const worker = new EventEmitter();
    watchQueue('calendar-local-days', null, worker);
    worker.emit('failed', { name: 'timed-recalc', attemptsMade: 3 }, new Error('zone pass failed'));
    const events = await sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tags: { component: 'worker', queue: 'calendar-local-days', job: 'timed-recalc' },
    });
  });

  it('CA-07/CA-10: a failing scheduler phase sends exactly 1 event and returns the fallback', async () => {
    const result = await isolated({ queue: 'scheduler', job: 'reminders' }, 0, () =>
      Promise.reject(new Error('phase failed')),
    );
    expect(result).toBe(0);
    const events = await sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ tags: { component: 'worker', job: 'reminders' } });
  });

  it('a queue error event (Redis down) is logged, not reported', async () => {
    const queue = new EventEmitter();
    watchQueue('domain-events', queue, null);
    queue.emit('error', new Error('ECONNREFUSED'));
    expect(await sentEvents()).toEqual([]);
  });
});

const mcpUser = {
  requestSource: 'mcp' as const,
  id: '11111111-1111-4111-8111-111111111111',
  email: TRAP.email,
  timeZone: 'Europe/Madrid',
  completeChildren: 'ask' as const,
  tokenId: null,
  sessionId: null,
  listIds: null,
};

function mcpService(list: () => Promise<unknown>): McpService {
  const none = {} as never;
  return new McpService(
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    { list } as never,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
  );
}

function mcpHost(): ArgumentsHost {
  const response = {
    status() {
      return this;
    },
    json() {
      return this;
    },
    setHeader: () => undefined,
    getHeader: () => 'req-mcp-0001',
  };
  return {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/mcp', url: '/api/v1/mcp', method: 'POST' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

const call = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'list_countdowns', arguments: { archived: true } },
};

describe('Sentry in MCP', () => {
  it('CA-06: a toolError scope_missing sends 0 events', async () => {
    const service = mcpService(() => Promise.resolve({ items: [] }));
    const result = await service.handle({ ...mcpUser, scopes: [] }, call);
    expect(JSON.stringify(result)).toContain('scope_missing');
    expect(await sentEvents()).toEqual([]);
  });

  it('an internal tool failure that ends in 500 sends 1 event with mcp.method and mcp.tool only', async () => {
    const service = mcpService(() =>
      Promise.reject(new Error(`countdown "${TRAP.title}" for ${TRAP.email}`)),
    );
    const failure = await service.handle({ ...mcpUser, scopes: ['countdowns:read'] }, call).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    new ApiExceptionFilter().catch(failure, mcpHost());
    const events = await sentEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tags: {
        component: 'mcp',
        'mcp.method': 'tools/call',
        'mcp.tool': 'list_countdowns',
        route: 'POST /api/v1/mcp',
      },
    });
    expect(captured.raw.join('\n')).not.toContain('archived');
    expect(leaks(captured.raw.join('\n'))).toEqual([]);
  });
});

describe('scheduler-tick cron monitor', () => {
  it('checks in every N ticks; default 5, configurable, 0 turns it off', async () => {
    expect(cronEveryTicks({})).toBe(5);
    expect(cronEveryTicks({ SENTRY_CRON_EVERY_TICKS: '1' })).toBe(1);
    expect(cronEveryTicks({ SENTRY_CRON_EVERY_TICKS: '0' })).toBe(0);
    expect(cronEveryTicks({ SENTRY_CRON_EVERY_TICKS: 'x' })).toBe(5);
    const heartbeat = new TickHeartbeat(5);
    for (let tick = 0; tick < 10; tick += 1) {
      heartbeat.beat(true);
    }
    await Sentry.flush(2_000);
    const checkIns = captured.raw.filter((envelope) => envelope.includes('"type":"check_in"'));
    expect(checkIns).toHaveLength(2);
    expect(checkIns[0]).toContain('"monitor_slug":"scheduler-tick"');
    expect(checkIns[0]).toContain('"status":"ok"');
  });

  it('without Sentry there is no check-in', async () => {
    await closeSentry();
    const heartbeat = new TickHeartbeat(1);
    heartbeat.beat(true);
    await Sentry.flush(100);
    expect(captured.raw).toEqual([]);
  });
});
