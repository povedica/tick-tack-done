import { afterEach, expect, it, vi } from 'vitest';
import { DriveFolderRenamer } from './folder-renamer.js';
import type { EventRouter } from '../events/event-router.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DomainBusEvent } from '../events/event-bus.js';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it('TTD-AUD-99 list rename updates its Drive folder and ignores upstream failure', async () => {
  let receive: ((event: DomainBusEvent) => Promise<void>) | undefined;
  const router = {
    subscribe: (fn: (event: DomainBusEvent) => Promise<void>) => {
      receive = fn;
    },
  };
  const db = {
    outboxEvent: {
      findFirst: vi.fn().mockResolvedValue({ data: { project: { id: 'list', name: 'Renamed' } } }),
    },
    driveFolder: { findFirst: vi.fn().mockResolvedValue({ driveFolderId: 'folder' }) },
    user: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ googleRefreshToken: 'synthetic-refresh', googleStatus: 'connected' }),
    },
  };
  vi.stubEnv('GOOGLE_CLIENT_ID', 'synthetic');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'synthetic');
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ access_token: 'synthetic-access' }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  new DriveFolderRenamer(
    router as unknown as EventRouter,
    db as unknown as PrismaService,
  ).onModuleInit();
  await expect(
    receive?.({ id: 'event', ownerId: 'owner', type: 'project.updated@v1' }),
  ).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenLastCalledWith(
    expect.stringContaining('/files/folder'),
    expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }) }),
  );
});
