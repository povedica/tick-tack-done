import { HttpStatus } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { CalendarService } from './calendar.service.js';
import type { ListAccessService } from '../collaboration/list-access.js';
import type { GoogleSyncService } from './google-sync.service.js';

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
    const service = new CalendarService(
      prisma,
      new EventRecorder(),
      {} as GoogleSyncService,
      {} as ListAccessService,
    );
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
