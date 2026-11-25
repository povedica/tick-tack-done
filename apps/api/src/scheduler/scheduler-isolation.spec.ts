import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaks, TRAP } from '../../test/helpers/pii-trap.js';
import { fakeTransport } from '../../test/helpers/sentry-transport.js';
import { OutboxPublisher } from '../events/outbox-publisher.js';
import { closeSentry, initSentry } from '../observability/sentry/sentry.js';
import { SchedulerService } from './scheduler.service.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

class PrismaClientKnownRequestError extends Error {
  override name = 'PrismaClientKnownRequestError';
  readonly code = 'P2010';
}

type Calls = Map<string, number>;

/** Every model answers "nothing to do", except the overrides. */
function fakePrisma(calls: Calls, overrides: Record<string, () => Promise<unknown>> = {}): unknown {
  const empty: Record<string, unknown> = {
    findMany: [],
    findFirst: null,
    findUnique: null,
    count: 0,
    updateMany: { count: 0 },
    deleteMany: { count: 0 },
  };
  const root: Record<string, unknown> = {};
  return new Proxy(root, {
    get(_target, model: string) {
      if (model === '$transaction') {
        return (work: (tx: unknown) => Promise<unknown>) => work(root);
      }
      return new Proxy(
        {},
        {
          get(_inner, method: string) {
            return () => {
              const key = `${model}.${method}`;
              calls.set(key, (calls.get(key) ?? 0) + 1);
              const override = overrides[key];
              return override === undefined ? Promise.resolve(empty[method] ?? null) : override();
            };
          },
        },
      );
    },
  });
}

function scheduler(prisma: unknown, googleSync: Record<string, unknown> = {}): SchedulerService {
  const ok = (): Promise<void> => Promise.resolve();
  return new SchedulerService(
    prisma as never,
    { record: ok },
    {} as never,
    { syncDue: ok, renewWatches: ok, ...googleSync } as never,
    { syncIcalDue: ok } as never,
    { shutdownReminder: () => Promise.resolve(null) } as never,
  );
}

function jobsLogged(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((call) => {
    const line = JSON.parse(String(call[0])) as { job: string };
    return line.job;
  });
}

describe('scheduler tick isolation', () => {
  it('CA-07: a failing phase is logged and the rest of the tick still runs', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const calls: Calls = new Map();
    const prisma = fakePrisma(calls, {
      'reminder.findMany': () =>
        Promise.reject(
          new PrismaClientKnownRequestError(
            `Invalid \`prisma.reminder.findMany()\` invocation: title "${TRAP.title}"`,
          ),
        ),
    });
    const service = scheduler(prisma, {
      syncDue: () => Promise.reject(new Error(`google ${TRAP.email}`)),
    });

    await expect(service.run(new Date('2026-11-25T10:00:00Z'), false)).resolves.toEqual({
      materialized: 0,
      fired: 0,
      late: 0,
    });

    expect(jobsLogged(error)).toEqual(['reminders', 'google-sync']);
    expect(calls.get('habit.findMany')).toBeGreaterThan(0);
    expect(calls.get('reminderDelivery.findMany')).toBe(1);
    expect(String(error.mock.calls[0]?.[1])).toContain('PrismaError P2010 reminder.findMany');
    expect(leaks(JSON.stringify(error.mock.calls))).toEqual([]);
  });

  it('a rejected tick is caught and logged, not left as an unhandled rejection', async () => {
    vi.stubEnv('SCHEDULER_AUTOSTART', 'true');
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = scheduler(fakePrisma(new Map()));
    vi.spyOn(service, 'run').mockRejectedValue(new Error('tick exploded'));
    service.onModuleInit();
    service.onModuleDestroy();
    await vi.waitFor(() => {
      expect(jobsLogged(error)).toEqual(['tick']);
    });
  });

  it('a failed tick sends an error check-in and flushes it', async () => {
    vi.stubEnv('SCHEDULER_AUTOSTART', 'true');
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const fake = fakeTransport();
    initSentry(
      {
        SENTRY_ENABLED: 'true',
        SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
        SENTRY_ENVIRONMENT: 'production',
        GIT_COMMIT: 'abcdef1234567890',
      },
      { transport: fake.transport, processHandlers: false },
    );
    const service = scheduler(fakePrisma(new Map()));
    vi.spyOn(service, 'run').mockRejectedValue(new Error('tick exploded'));
    try {
      service.onModuleInit();
      service.onModuleDestroy();
      await vi.waitFor(() => {
        // The test does not flush. The envelope is here only because beat() flushed the error check-in.
        const checkIns = fake.captured.raw.filter((envelope) =>
          envelope.includes('"type":"check_in"'),
        );
        expect(checkIns).toHaveLength(1);
        expect(checkIns[0]).toContain('"status":"error"');
        expect(checkIns[0]).toContain('"monitor_slug":"scheduler-tick"');
      });
    } finally {
      await closeSentry();
    }
  });
});

describe('outbox publisher loop', () => {
  it('a failing publish pass is caught and logged', async () => {
    vi.stubEnv('BUS_AUTOSTART', 'true');
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const prisma = fakePrisma(new Map(), {
      'outboxEvent.deleteMany': () => Promise.reject(new Error('db down')),
    });
    const publisher = new OutboxPublisher(prisma as never, { start: vi.fn() } as never);
    publisher.onModuleInit();
    publisher.onModuleDestroy();
    await vi.waitFor(() => {
      expect(jobsLogged(error)).toEqual(['publish-pending']);
    });
  });
});
