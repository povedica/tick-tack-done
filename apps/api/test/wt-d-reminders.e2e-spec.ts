import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { harness } from './wt-d-harness.js';
describe('TTD-AUD-115 reminders', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await h.close();
  });
  it.each([
    [false, undefined, 'email'],
    [true, undefined, 'push'],
    [true, 'email', 'email'],
  ] as const)('respects configured and explicit channels', async (push, channel, expected) => {
    vi.stubEnv('VAPID_PUBLIC_KEY', push ? 'synthetic' : '');
    vi.stubEnv('VAPID_PRIVATE_KEY', push ? 'synthetic' : '');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('SMTP_HOST', 'synthetic');
    vi.stubEnv('SMTP_FROM', 'synthetic@example.test');
    const task = await h.create({ due_date: '2030-01-01T09:00:00Z' });
    const response = await h.api
      .post(`/api/v1/tasks/${task.id}/reminders`)
      .send({ trigger: 'TRIGGER:-PT5M', type: 'relative', ...(channel ? { channel } : {}) })
      .expect(201);
    expect(response.body.channel).toBe(expected);
  });
});
