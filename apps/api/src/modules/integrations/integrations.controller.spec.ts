import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { IntegrationsController } from './integrations.controller.js';
import type { TelegramBotService } from './telegram-bot.service.js';
import type { TasksService } from '../tasks/tasks.service.js';
import type { AuthUser } from '../../auth/auth-user.js';
import type { Response } from 'express';
import { sealField } from '../../security/field-cipher.js';

describe('TTD-AUD-97 Google disconnect', () => {
  it.each([false, true])(
    'revokes own credential and removes imported Google events only when requested (%s)',
    async (remove) => {
      const fetch = vi.fn().mockResolvedValue(new globalThis.Response('', { status: 200 }));
      vi.stubGlobal('fetch', fetch);
      const tx = {
        user: { update: vi.fn().mockResolvedValue({}) },
        externalEvent: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      };
      const prisma = {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ googleRefreshToken: sealField('synthetic-refresh') }),
        },
        $transaction: vi.fn().mockImplementation((fn: (value: unknown) => unknown) => fn(tx)),
      } as unknown as PrismaService;
      const events = { record: vi.fn().mockResolvedValue(undefined) } as unknown as EventRecorder;
      const controller = new IntegrationsController(
        prisma,
        events,
        {} as TelegramBotService,
        {} as TasksService,
      );
      const status = vi.fn().mockReturnThis();
      const res = { status, end: vi.fn() } as unknown as Response;
      await controller.disconnectGoogle({ id: 'owner' } as AuthUser, res, {
        remove_imported_events: String(remove),
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke',
        expect.objectContaining({
          method: 'POST',
          body: new URLSearchParams({ token: 'synthetic-refresh' }),
        }),
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'owner' },
        data: {
          googleRefreshToken: null,
          googleAccountEmail: null,
          googleStatus: 'disconnected',
          googleGrantedScopes: [],
        },
      });
      if (remove)
        expect(tx.externalEvent.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { ownerId: 'owner', deletedAt: null, subscription: { provider: 'google' } },
          }),
        );
      else expect(tx.externalEvent.updateMany).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(204);
    },
  );
});

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
    const service = new IntegrationsController(
      prisma,
      new EventRecorder(),
      {} as TelegramBotService,
      {
        linkDriveFile: vi
          .fn()
          .mockRejectedValue(
            new DomainException(
              HttpStatus.CONFLICT,
              'drive_not_connected',
              'Connect Google Drive in Settings > Integrations',
            ),
          ),
      } as unknown as TasksService,
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/dot-notation -- Test the private credential boundary without exposing it publicly.
      service['copyDriveFile']({ id: 'owner-b' } as AuthUser, 'task', {
        task_id: 'task',
        file_id: 'drive',
        name: 'Synthetic',
        url: 'https://drive.google.com/file/d/drive',
      }),
    ).rejects.toMatchObject(
      new DomainException(
        HttpStatus.CONFLICT,
        'drive_not_connected',
        'Connect Google Drive in Settings > Integrations',
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
