import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../../auth/auth-user.js';
import { sealField } from '../../security/field-cipher.js';
import { telegramState } from '../../integrations/telegram-state.js';
import { TelegramSettingsService, webhookUrl } from './telegram-settings.service.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('RF-2003: public Telegram webhook URL', () => {
  it.each([
    '',
    'bad',
    'http://todo.example.org',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.0.0.1',
    'https://[::1]',
    'https://dev.localhost',
    'https://internal',
    'https://user:pass@todo.example.org',
    'https://todo.example.org:3000',
  ])('keeps %s local-only', (value) => {
    vi.stubEnv('PUBLIC_URL', value);
    expect(webhookUrl('owner')).toBeNull();
  });
  it('builds an independent route per user without query parameters', () => {
    vi.stubEnv('PUBLIC_URL', 'https://todo.example.org:8443/path?ignored=1');
    expect(webhookUrl('owner')).toBe(
      'https://todo.example.org:8443/api/v1/integrations/telegram/webhook/owner',
    );
  });
});

function harness(existingUrl = '') {
  vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
  vi.stubEnv('APP_SECRET', randomBytes(32).toString('hex'));
  const token = `42:${randomBytes(24).toString('base64url')}`;
  interface Row {
    ownerId: string;
    botId: string;
    token: string;
    webhookSecret: string;
    username: string;
    webhookUrl: string | null;
    updatedAt: Date;
  }
  interface Gate {
    started: () => void;
    completion: Promise<void>;
    status: number;
  }
  const gates = new Map<string, Gate[]>();
  const pause = (method: string, status = 200) => {
    let started: () => void = () => undefined;
    let resume: () => void = () => undefined;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    const completion = new Promise<void>((resolve) => {
      resume = resolve;
    });
    gates.set(method, [...(gates.get(method) ?? []), { started, completion, status }]);
    return { started: pending, resume };
  };
  let row: Row | null = null;
  let assigned: Row | null = null;
  let inTransaction = false;
  let reject = '';
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const configuration = {
    findUnique: vi.fn((args: { where: { botId?: string } }) =>
      Promise.resolve(args.where.botId ? (assigned ?? row) : row),
    ),
    upsert: vi.fn(
      (args: { create: Omit<Row, 'updatedAt'>; update: Omit<Row, 'ownerId' | 'updatedAt'> }) => {
        row = { ...args.create, updatedAt: new Date((row?.updatedAt.getTime() ?? Date.now()) + 1) };
        return Promise.resolve(row);
      },
    ),
    update: vi.fn((args: { data: Partial<Row> }) => {
      if (!row) throw new Error('missing');
      row = { ...row, ...args.data, updatedAt: new Date(row.updatedAt.getTime() + 1) };
      return Promise.resolve(row);
    }),
    updateMany: vi.fn((args: { where?: Partial<Row>; data: Partial<Row> }) => {
      if (!row) return Promise.resolve({ count: 0 });
      const expected = args.where;
      if (
        expected &&
        ((expected.token !== undefined && expected.token !== row.token) ||
          (expected.botId !== undefined && expected.botId !== row.botId) ||
          (expected.webhookSecret !== undefined && expected.webhookSecret !== row.webhookSecret) ||
          (expected.updatedAt !== undefined &&
            expected.updatedAt.getTime() !== row.updatedAt.getTime()) ||
          (expected.webhookUrl !== undefined && expected.webhookUrl !== row.webhookUrl))
      )
        return Promise.resolve({ count: 0 });
      row = { ...row, ...args.data, updatedAt: new Date(row.updatedAt.getTime() + 1) };
      return Promise.resolve({ count: 1 });
    }),
    deleteMany: vi.fn(() => {
      row = null;
      return Promise.resolve();
    }),
  };
  const tx = {
    telegramBotConfiguration: configuration,
    telegramLink: { updateMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    telegramCallback: { updateMany: vi.fn() },
    telegramPairing: { updateMany: vi.fn() },
    $executeRaw: vi.fn(),
    outboxEvent: { create: vi.fn() },
    activityLog: { create: vi.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: async <T>(fn: (value: typeof tx) => Promise<T>): Promise<T> => {
      const gate = gates.get('transaction')?.shift();
      if (gate) {
        gate.started();
        await gate.completion;
      }
      inTransaction = true;
      try {
        return await fn(tx);
      } finally {
        inTransaction = false;
      }
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      expect(inTransaction).toBe(false);
      const method = url.split('/').at(-1) ?? '';
      calls.push({
        method,
        body: JSON.parse(typeof init.body === 'string' ? init.body : '{}') as Record<
          string,
          unknown
        >,
      });
      const gate = gates.get(method)?.shift();
      if (gate) {
        gate.started();
        return gate.completion.then(() =>
          Response.json({ ok: gate.status === 200, result: true }, { status: gate.status }),
        );
      }
      if (method === reject) return Promise.resolve(Response.json({ ok: false }, { status: 401 }));
      return Promise.resolve(
        Response.json({
          ok: true,
          result:
            method === 'getMe'
              ? {
                  id: Number(url.split('/bot')[1]?.split(':')[0]),
                  is_bot: true,
                  username: 'test_bot',
                }
              : method === 'getWebhookInfo'
                ? { url: existingUrl }
                : true,
        }),
      );
    }),
  );
  const user = { id: 'owner' } as AuthUser;
  const events = { record: vi.fn() };
  const service = new TelegramSettingsService(prisma as unknown as PrismaService, events);
  return {
    service,
    token,
    user,
    calls,
    tx,
    events,
    row: () => row,
    pauseDelete: () => pause('deleteWebhook'),
    pauseSet: () => pause('setWebhook'),
    pauseGetMeFailure: () => pause('getMe', 401),
    pauseTransaction: () => pause('transaction'),
    reject: (method: string) => {
      reject = method;
    },
    assigned: () => {
      assigned = {
        ownerId: 'other',
        botId: '42',
        token: sealField(token),
        webhookSecret: sealField('secret'),
        username: 'test_bot',
        webhookUrl: null,
        updatedAt: new Date(),
      };
    },
  };
}
describe('RF-2003: per-user bot management outside database transactions', () => {
  it('rejects malformed and revoked tokens with a precise code', async () => {
    const h = harness();
    await expect(h.service.save(h.user, 'invalid')).rejects.toMatchObject({
      response: { code: 'telegram_token_invalid' },
    });
    h.reject('getMe');
    await expect(h.service.save(h.user, h.token)).rejects.toMatchObject({
      response: { code: 'telegram_token_invalid' },
    });
    expect(h.row()).toBeNull();
  });
  it('rejects a bot owned by another account before setting its webhook', async () => {
    const h = harness();
    h.assigned();
    await expect(h.service.save(h.user, h.token)).rejects.toMatchObject({
      response: { code: 'telegram_bot_in_use' },
    });
    expect(h.calls.map((call) => call.method)).not.toContain('setWebhook');
  });
  it('takes the retired webhook from the same origin and drops pending updates', async () => {
    const h = harness('https://todo.example.org/api/v1/integrations/telegram/webhook');
    expect(await h.service.save(h.user, h.token)).toMatchObject({
      state: 'webhook_ok',
      webhook_registered: true,
    });
    expect(h.calls.find((call) => call.method === 'setWebhook')?.body).toMatchObject({
      drop_pending_updates: true,
      secret_token: expect.any(String),
    });
    expect(h.calls.map((call) => call.method)).not.toContain('deleteWebhook');
  });
  it('requires explicit force for another origin', async () => {
    const h = harness('https://elsewhere.example.org/webhook');
    await expect(h.service.save(h.user, h.token)).rejects.toMatchObject({
      response: { code: 'telegram_webhook_in_use' },
    });
    await h.service.save(h.user, h.token, true);
    expect(h.calls.map((call) => call.method)).toContain('deleteWebhook');
  });
  it('preserves an error marker, retries and never exposes it or credentials', async () => {
    const h = harness();
    h.reject('setWebhook');
    await expect(h.service.save(h.user, h.token)).rejects.toMatchObject({
      response: { code: 'telegram_configuration_failed' },
    });
    expect(await h.service.status(h.user)).toMatchObject({ state: 'error', webhook_url: null });
    h.reject('');
    expect(await h.service.retry(h.user)).toMatchObject({ state: 'webhook_ok' });
    expect(JSON.stringify(await h.service.status(h.user))).not.toContain(h.token);
    expect(JSON.stringify(h.events.record.mock.calls)).not.toContain(h.token);
  });
  it('makes a revoked saved token visibly recoverable on retry', async () => {
    const h = harness();
    await h.service.save(h.user, h.token);
    h.reject('getMe');
    await expect(h.service.retry(h.user)).rejects.toMatchObject({
      response: { code: 'telegram_token_invalid' },
    });
    expect(await h.service.status(h.user)).toMatchObject({ state: 'error', webhook_url: null });
  });
  it('renders the integration from one shared snapshot despite a subsequent configuration change', async () => {
    const h = harness();
    await h.service.save(h.user, h.token);
    const snapshot = await telegramState(h.tx as unknown as PrismaService, h.user.id);
    h.tx.telegramBotConfiguration.findUnique.mockClear();
    h.tx.telegramBotConfiguration.findUnique.mockResolvedValue(null);
    expect(await h.service.status(h.user, snapshot)).toMatchObject({
      state: 'webhook_ok',
      configured: true,
    });
    expect(h.tx.telegramBotConfiguration.findUnique).not.toHaveBeenCalled();
  });
  it('does not finalize an older registration over a newer reservation for the same bot', async () => {
    const h = harness();
    await h.service.save(h.user, h.token);
    const first = h.pauseSet();
    const second = h.pauseSet();
    const earlier = h.service.save(h.user, h.token).then(
      () => 'saved',
      () => 'superseded',
    );
    await first.started;
    const newer = h.service.save(h.user, `42:${randomBytes(24).toString('base64url')}`);
    await second.started;
    first.resume();
    try {
      expect(await earlier).toBe('superseded');
      expect(h.row()?.webhookUrl).toBe('');
    } finally {
      second.resume();
      await newer;
    }
  });
  it('does not mark a newly saved token as invalid when an old retry fails late', async () => {
    const h = harness();
    await h.service.save(h.user, h.token);
    const paused = h.pauseGetMeFailure();
    const retry = h.service.retry(h.user).then(
      () => 'saved',
      () => 'rejected',
    );
    await paused.started;
    await h.service.save(h.user, `42:${randomBytes(24).toString('base64url')}`);
    paused.resume();
    expect(await retry).toBe('rejected');
    expect(h.row()?.webhookUrl).toBe(
      'https://todo.example.org/api/v1/integrations/telegram/webhook/owner',
    );
  });
  it('preserves a bot reserved after remove read an empty configuration', async () => {
    const h = harness();
    const paused = h.pauseTransaction();
    const removal = h.service.remove(h.user);
    await paused.started;
    await h.service.save(h.user, h.token);
    paused.resume();
    await removal;
    expect(h.row()?.botId).toBe('42');
  });
  it('does not remove a replacement bot while remote deletion of its predecessor is pending', async () => {
    const h = harness();
    await h.service.save(h.user, h.token);
    const paused = h.pauseDelete();
    const removal = h.service.remove(h.user);
    await paused.started;
    await h.service.save(h.user, `43:${randomBytes(24).toString('base64url')}`);
    paused.resume();
    await removal;
    expect(h.row()?.botId).toBe('43');
  });
  it('removes local configuration and links even if remote deletion fails', async () => {
    const h = harness();
    await h.service.save(h.user, h.token);
    h.reject('deleteWebhook');
    await h.service.remove(h.user);
    expect(h.row()).toBeNull();
    expect(h.tx.telegramLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
    expect(await h.service.status(h.user)).toMatchObject({ state: 'none' });
  });
});
