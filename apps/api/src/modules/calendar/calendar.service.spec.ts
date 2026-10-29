import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../auth/auth-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { CalendarService } from './calendar.service.js';
import type { GoogleSyncService } from './google-sync.service.js';

const owner: AuthUser = {
  id: 'owner',
  email: 'owner@example.test',
  timeZone: 'Europe/Madrid',
  completeChildren: 'leave',
  scopes: ['calendar:read'],
  tokenId: 'token',
  sessionId: null,
  listIds: ['list-a'],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('TTD-AUD-86 / RF-2006 user credential isolation', () => {
  it('returns 409 without calling Google for user B despite a global refresh token', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic-client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'synthetic-secret');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'synthetic-global-refresh');
    const fetch = vi.fn().mockRejectedValue(new Error('Unexpected cross-account request'));
    vi.stubGlobal('fetch', fetch);
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ email: 'b@example.test', googleRefreshToken: null }),
      },
    } as unknown as PrismaService;
    const service = new CalendarService(prisma, new EventRecorder(), {} as GoogleSyncService);
    // eslint-disable-next-line @typescript-eslint/dot-notation -- Test the private credential boundary without exposing it publicly.
    await expect(service['googleAccessToken']('owner-b')).rejects.toMatchObject(
      new DomainException(
        HttpStatus.CONFLICT,
        'google_not_connected',
        'Connect Google from Settings > Integrations',
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('calendar range hygiene', () => {
  it('selects the mapped columns, overlaps the window, and keeps the list allowlist', async () => {
    const tasks = vi.fn().mockResolvedValue([]);
    const external = vi.fn().mockResolvedValue([]);
    const service = new CalendarService(
      {
        task: { findMany: tasks },
        externalEvent: { findMany: external },
      } as unknown as PrismaService,
      new EventRecorder(),
      {} as GoogleSyncService,
    );
    await service.range(
      owner,
      '2026-06-01T00:00:00.000Z',
      '2026-06-02T00:00:00.000Z',
      undefined,
      'all',
      'all',
    );
    const where = tasks.mock.calls[0]?.[0].where as { OR: unknown[]; projectId: unknown };
    expect(where.projectId).toEqual({ in: ['list-a'] });
    expect(where.OR).toHaveLength(3);
    expect(tasks.mock.calls[0]?.[0].select).toEqual({
      id: true,
      title: true,
      projectId: true,
      startDate: true,
      dueDate: true,
      isAllDay: true,
    });
    expect(external).toHaveBeenCalledTimes(1);
  });

  it('omits the other side when include is external or tasks', async () => {
    const tasks = vi.fn().mockResolvedValue([]);
    const external = vi.fn().mockResolvedValue([]);
    const service = new CalendarService(
      {
        task: { findMany: tasks },
        externalEvent: { findMany: external },
      } as unknown as PrismaService,
      new EventRecorder(),
      {} as GoogleSyncService,
    );
    await service.range(
      owner,
      '2026-06-01T00:00:00.000Z',
      '2026-06-02T00:00:00.000Z',
      undefined,
      'all',
      'external',
    );
    expect(tasks).not.toHaveBeenCalled();
    expect(external).toHaveBeenCalledTimes(1);
    await service.range(
      { ...owner, listIds: [] },
      '2026-06-01T00:00:00.000Z',
      '2026-06-02T00:00:00.000Z',
      undefined,
      'all',
      'tasks',
    );
    expect(tasks).not.toHaveBeenCalled();
    expect(external).toHaveBeenCalledTimes(1);
  });
});
