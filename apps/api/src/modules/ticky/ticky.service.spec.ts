import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../auth/auth-user.js';
import type { EventRecorder } from '../../events/event-recorder.js';
import type { EventRouter } from '../../events/event-router.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { TickyService } from './ticky.service.js';

const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
  type: 'pkcs8',
  format: 'pem',
});
const owner = randomUUID();
const threadId = randomUUID();
const user: AuthUser = {
  id: owner,
  email: 'synthetic@example.invalid',
  timeZone: 'Europe/Madrid',
  completeChildren: 'ask',
  scopes: ['tasks:read'],
  tokenId: null,
  sessionId: randomUUID(),
  listIds: null,
};

function setup() {
  const db = {
    tickyAuthority: {
      findUnique: vi.fn().mockResolvedValue({
        version: 1,
        revoked: false,
        paused: false,
        actionScopes: [],
        lists: [],
        workdayStart: null,
        workdayEnd: null,
        sourceRevision: 1,
      }),
    },
    tickyThread: {
      create: vi.fn().mockResolvedValue({ id: threadId }),
      findFirst: vi.fn().mockResolvedValue({ id: threadId }),
    },
    tickyClientMessage: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const service = new TickyService(
    db as unknown as PrismaService,
    {} as EventRecorder,
    {} as EventRouter,
  );
  return { service, db };
}

describe('APP-03 / TK-022/600: private service bridge', () => {
  beforeEach(() => {
    vi.stubEnv('TICKY_SERVICE_URL', 'http://synthetic.invalid');
    vi.stubEnv('TICKY_JWT_PRIVATE_KEY_PEM', key);
    vi.stubEnv('TICKY_JWT_KID', 'synthetic');
    vi.stubEnv('TICKY_MODEL_ENABLED', 'false');
    vi.stubEnv('TICKY_READ_ENABLED', 'true');
    vi.stubEnv('TICKY_KILL_SWITCH', 'false');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('blocks new reads under the kill switch before contacting Python', async () => {
    const { service } = setup();
    vi.stubEnv('TICKY_KILL_SWITCH', 'true');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(service.openThread(user)).rejects.toThrow();
    await expect(service.postMessage(user, threadId, randomUUID(), 'Hoy')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the catalog empty and rejects explicit generation when the model flag is off', async () => {
    const { service } = setup();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await service.models(user)).toEqual({ items: [] });
    await expect(
      service.postMessage(user, threadId, randomUUID(), 'Hoy', 'synthetic'),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('creates Python canonical thread before storing the local projection', async () => {
    const { service, db } = setup();
    const fetcher = vi.fn().mockResolvedValue(Response.json({ thread_id: threadId }));
    vi.stubGlobal('fetch', fetcher);
    expect(await service.openThread(user)).toEqual({ id: threadId });
    expect(db.tickyThread.create).toHaveBeenCalledWith({ data: { id: threadId, ownerId: owner } });
    expect(fetcher.mock.calls[0]?.[0].pathname).toBe('/internal/v1/threads');
    expect(fetcher.mock.calls[0]?.[1].body).toBeUndefined();
  });

  it.each([403, 409, 503])(
    'does not create a local-only thread after upstream %s',
    async (status) => {
      const { service, db } = setup();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ detail: 'synthetic' }, { status })),
      );
      await expect(service.openThread(user)).rejects.toThrow();
      expect(db.tickyThread.create).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid upstream thread identifier without storing it', async () => {
    const { service, db } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ thread_id: 'invalid' })));
    await expect(service.openThread(user)).rejects.toThrow();
    expect(db.tickyThread.create).not.toHaveBeenCalled();
  });

  it('forwards deterministic messages while model generation is off', async () => {
    const { service, db } = setup();
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ run_id: randomUUID(), message: 'synthetic' }));
    vi.stubGlobal('fetch', fetcher);
    await service.postMessage(user, threadId, randomUUID(), 'Qué hago hoy');
    expect(fetcher).toHaveBeenCalledOnce();
    const request = JSON.parse(fetcher.mock.calls[0]?.[1].body as string) as Record<
      string,
      unknown
    >;
    expect(request.text).toBe('Qué hago hoy');
    expect(request).not.toHaveProperty('model_id');
    expect(db.tickyClientMessage.upsert).toHaveBeenCalledOnce();
  });

  it('does not persist a failed run admission as a successful replay', async () => {
    const { service, db } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ detail: 'denied' }, { status: 403 })),
    );
    await expect(service.postMessage(user, threadId, randomUUID(), 'Hoy')).rejects.toThrow();
    expect(db.tickyClientMessage.upsert).not.toHaveBeenCalled();
  });

  it('rejects another owner thread without contacting Python', async () => {
    const { service, db } = setup();
    db.tickyThread.findFirst.mockResolvedValue(null);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(service.postMessage(user, threadId, randomUUID(), 'Hoy')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
