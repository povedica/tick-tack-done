import { afterEach, expect, it, vi } from 'vitest';
import { DriveAttachmentsService } from './attachments.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventRecorder } from '../events/event-recorder.js';
import type { AuthUser } from '../auth/auth-user.js';
afterEach(() => vi.unstubAllGlobals());
it('TTD-AUD-99 no Drive returns 409 before reading a binary or contacting Google', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const db = {
    task: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: 'task', projectId: 'list', project: { name: 'Casa' } }),
    },
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ googleRefreshToken: null, googleStatus: 'disconnected' }),
    },
  };
  const service = new DriveAttachmentsService(db as unknown as PrismaService, {} as EventRecorder);
  await expect(
    service.startSession({ id: 'owner', listIds: null } as AuthUser, 'task', {
      name: 'x.txt',
      mime_type: 'text/plain',
      size: 4,
    }),
  ).rejects.toMatchObject({
    status: 409,
    response: expect.objectContaining({ code: 'drive_not_connected' }),
  });
  expect(fetch).not.toHaveBeenCalled();
});
