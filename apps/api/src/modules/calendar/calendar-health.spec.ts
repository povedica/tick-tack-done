/* eslint-disable @typescript-eslint/require-await -- the Prisma double is synchronous */
import { describe, expect, it } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../http/domain.exception.js';
import { CalendarService } from './calendar.service.js';
import { subscriptionHealth } from './calendar-health.js';
import type { GoogleSyncService } from './google-sync.service.js';

const user = {
  id: 'user-1',
  email: 'ada@example.com',
  timeZone: 'Europe/Madrid',
  completeChildren: 'ask' as const,
  scopes: ['calendar:read', 'calendar:write'],
  tokenId: null,
  sessionId: null,
  listIds: null,
};

const row = {
  id: 'sub-1',
  ownerId: user.id,
  provider: 'google',
  calendarId: 'ada@example.com',
  summary: 'Personal',
  color: null,
  visible: true,
  syncDirection: 'read',
  syncToken: 'old',
  lastSyncedAt: new Date('2026-11-10T08:00:00.000Z'),
  lastReconciledAt: new Date('2026-11-10T08:00:00.000Z'),
  lastError: 'google_reconnect_required',
  syncFailures: 1,
  retryAfter: null,
  url: null,
  deletedAt: null,
  watchChannelId: null,
  watchResourceId: null,
  watchTokenHash: null,
  watchExpiresAt: null,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-10T08:00:00.000Z'),
};

describe('calendar connection health', () => {
  it('RF-2563: reauth and a reconnect error outrank a generic failure', () => {
    expect(
      subscriptionHealth({
        provider: 'google',
        lastError: null,
        googleStatus: 'reauth_required',
      }),
    ).toBe('reconnect_required');
    expect(
      subscriptionHealth({
        provider: 'google',
        lastError: 'calendar_watch_unavailable',
        googleStatus: 'connected',
      }),
    ).toBe('error');
    expect(
      subscriptionHealth({
        provider: 'ical',
        lastError: null,
        googleStatus: 'reauth_required',
      }),
    ).toBe('ok');
  });

  it('RF-2563: GET sync-status reports reconnect_required without hiding the account', async () => {
    const prisma = {
      calendarSubscription: {
        findMany: async () => [row],
      },
      externalEvent: {
        groupBy: async () => [{ subscriptionId: row.id, _count: { _all: 4 } }],
      },
    };
    const google = {
      googleAccount: async () => ({
        status: 'reauth_required',
        connected: false,
        account: 'ada@example.com',
        googleStatus: 'reauth_required',
      }),
    } as unknown as GoogleSyncService;
    const service = new CalendarService(
      prisma as never,
      { record: async () => undefined },
      google,
      null,
      {} as never,
    );
    const status = await service.syncStatus(user);
    expect(status.google).toEqual({
      status: 'reauth_required',
      connected: false,
      account: 'ada@example.com',
    });
    expect(status.subscriptions[0]).toEqual(
      expect.objectContaining({
        id: row.id,
        health: 'reconnect_required',
        last_error: 'google_reconnect_required',
        event_count: 4,
      }),
    );
  });

  it('RF-2563: sync_calendar returns reconnect health instead of an empty failure', async () => {
    const prisma = {
      calendarSubscription: {
        findFirst: async () => row,
        findUnique: async () => row,
      },
    };
    const google = {
      syncOne: async () => {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'google_reconnect_required',
          'Google authorization expired or was revoked. Reconnect Google from integrations.',
        );
      },
      googleAccount: async () => ({
        status: 'reauth_required',
        connected: false,
        account: 'ada@example.com',
        googleStatus: 'reauth_required',
      }),
    } as unknown as GoogleSyncService;
    const service = new CalendarService(
      prisma as never,
      { record: async () => undefined },
      google,
      null,
      {} as never,
    );
    const body = await service.syncReported(user, row.id);
    expect(body).toEqual(
      expect.objectContaining({
        health: 'reconnect_required',
        error: 'google_reconnect_required',
        last_error: 'google_reconnect_required',
      }),
    );
  });

  it('RF-2563: a missing subscription is still an error', async () => {
    const prisma = {
      calendarSubscription: { findFirst: async () => null },
    };
    const service = new CalendarService(
      prisma as never,
      { record: async () => undefined },
      {} as GoogleSyncService,
      null,
      {} as never,
    );
    await expect(service.syncReported(user, row.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });
});
