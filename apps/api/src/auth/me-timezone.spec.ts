import { describe, expect, it } from 'vitest';
import { DomainException } from '../http/domain.exception.js';
import type { LocalDayQueue } from '../modules/calendar/local-day-queue.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import { MeService } from './me.service.js';

const user: AuthUser = {
  id: 'user-1',
  email: 'ada@example.test',
  timeZone: 'Europe/Madrid',
  completeChildren: 'ask',
  scopes: [],
  tokenId: null,
  sessionId: null,
  listIds: null,
};

describe('MeService timezone change', () => {
  it('enqueues the timed-event recalc and does not rewrite rows in the request', async () => {
    const enqueued: string[] = [];
    const service = serviceFor('Europe/Madrid', enqueued);
    const result = await service.update(user, { time_zone: 'America/New_York' });
    expect(result.time_zone).toBe('America/New_York');
    expect(enqueued).toEqual(['user-1']);
  });

  it('does not enqueue when the profile zone stays the same', async () => {
    const enqueued: string[] = [];
    const service = serviceFor('America/New_York', enqueued);
    await service.update(user, { time_zone: 'America/New_York' });
    expect(enqueued).toEqual([]);
  });

  it('rejects an unknown zone before enqueueing', async () => {
    const enqueued: string[] = [];
    const service = serviceFor('Europe/Madrid', enqueued);
    await expect(service.update(user, { time_zone: 'not a zone' })).rejects.toBeInstanceOf(
      DomainException,
    );
    expect(enqueued).toEqual([]);
  });
});

function serviceFor(previousZone: string, enqueued: string[]): MeService {
  const prisma = {
    user: {
      findUnique: () => Promise.resolve({ timeZone: previousZone }),
    },
    $transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        user: {
          update: () => Promise.resolve(profileRow('America/New_York')),
        },
      }),
  };
  const localDays = {
    enqueueTimedRecalc: (ownerId: string) => {
      enqueued.push(ownerId);
      return Promise.resolve();
    },
  };
  const events = { record: () => Promise.resolve() };
  return new MeService(
    prisma as unknown as PrismaService,
    events,
    localDays as unknown as LocalDayQueue,
  );
}

function profileRow(timeZone: string) {
  return {
    id: 'user-1',
    email: 'ada@example.test',
    displayName: 'Ada',
    timeZone,
    locale: 'es',
    weekStart: 'monday' as const,
    theme: 'auto' as const,
    nlpLanguage: 'es',
    density: 'comfortable',
    accent: 'indigo',
    defaultReminderTrigger: null,
    taskCompleteChildren: 'ask' as const,
    dailyReminderTime: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    telegramEnabled: false,
    focusNotifications: false,
    shutdownReminderTime: null,
    workDayStart: '09:00',
    workDayEnd: '18:00',
    workDays: [1, 2, 3, 4, 5],
    workFolderIds: [] as string[],
    workProjectIds: [] as string[],
    workTagIds: [] as string[],
    hideWorkOutsideHours: false,
    showWorkUntil: null,
    defaultTaskDuration: 30,
    deadlineSoonDays: 2,
    eveningStart: '18:00',
    featureFlags: {},
    captureSettings: {},
  };
}
