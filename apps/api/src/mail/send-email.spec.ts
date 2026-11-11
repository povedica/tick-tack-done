import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailConfigured, sendEmail, smtpRequireTls, smtpSecure } from './send-email.js';
import { ReminderTransport } from '../scheduler/reminder.transport.js';
import { sendSecurityNotice } from '../security/security-mail.js';

const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(() => Promise.resolve({})),
  createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const message = {
  to: 'recipient@example.test',
  subject: 'Recordatorio',
  text: 'Texto privado',
  idempotencyKey: 'reminder/test-delivery',
};
function setup() {
  const key = randomBytes(24).toString('hex');
  vi.stubEnv('RESEND_API_KEY', key);
  vi.stubEnv('EMAIL_FROM', 'App <notices@example.test>');
  vi.stubEnv('SMTP_HOST', 'mailpit');
  vi.stubEnv('SMTP_FROM', 'local@example.test');
  return key;
}
async function transport(telegramLinked = false) {
  vi.stubEnv('PUBLIC_URL', 'https://todo.example.org');
  const configurationUpdatedAt = new Date();
  const module = await Test.createTestingModule({
    providers: [
      ReminderTransport,
      {
        provide: PrismaService,
        useValue: {
          telegramBotConfiguration: {
            findUnique: () =>
              Promise.resolve({
                token: 'unit-token',
                webhookSecret: 'unit-secret',
                botId: 'unit',
                username: 'unit_bot',
                webhookUrl:
                  'https://todo.example.org/api/v1/integrations/telegram/webhook/test-owner',
                updatedAt: configurationUpdatedAt,
              }),
          },
          telegramLink: {
            findFirst: () =>
              Promise.resolve(
                telegramLinked
                  ? {
                      id: 'unit-link',
                      botId: 'unit',
                      chatId: 'test-chat',
                      status: 'connected',
                      username: null,
                      displayName: null,
                      createdAt: new Date(),
                    }
                  : null,
              ),
          },
        },
      },
    ],
  }).compile();
  return module.get(ReminderTransport);
}
describe('RF-802 RF-808: shared transactional email', () => {
  it('uses Resend HTTP ahead of SMTP and preserves the delivery idempotency key', async () => {
    const key = setup();
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ id: 'email-id' })));
    vi.stubGlobal('fetch', fetcher);
    expect(await sendEmail(message)).toEqual({ status: 'sent', retryAfter: null });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          authorization: `Bearer ${key}`,
          'Idempotency-Key': message.idempotencyKey,
        }),
        body: JSON.stringify({
          from: 'App <notices@example.test>',
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      }),
    );
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it.each([
    [429, 'rate_limited'],
    [500, 'failed'],
    [403, 'failed'],
  ] as const)('classifies HTTP %s without exposing provider errors', async (status, outcome) => {
    const key = setup();
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(key, { status, headers: { 'retry-after': '7' } })),
    );
    const result = await sendEmail(message);
    expect(result.status).toBe(outcome);
    expect(JSON.stringify(result)).not.toContain(key);
    if (status === 429) expect(result.retryAfter).toBe(7);
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it('reports uncertain acceptance on network errors and does not send through SMTP', async () => {
    const key = setup();
    vi.stubGlobal('fetch', () => Promise.reject(new Error(key)));
    expect(await sendEmail(message)).toEqual({ status: 'unknown', retryAfter: 30 });
    await expect(
      sendSecurityNotice(message.to, message.subject, message.text),
    ).resolves.toBeUndefined();
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it('refuses incomplete Resend settings without SMTP fallback', async () => {
    setup();
    vi.stubEnv('EMAIL_FROM', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(emailConfigured()).toBe(false);
    expect((await sendEmail(message)).status).toBe('failed');
    expect(fetcher).not.toHaveBeenCalled();
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it('keeps SMTP/Mailpit for local use and skips unconfigured or empty recipients', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('SMTP_HOST', 'mailpit');
    vi.stubEnv('SMTP_FROM', 'local@example.test');
    smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
    expect((await sendEmail(message)).status).toBe('sent');
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: 'local@example.test',
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
    vi.stubEnv('SMTP_HOST', '');
    expect((await sendEmail(message)).status).toBe('skipped');
    expect((await sendEmail({ ...message, to: '' })).status).toBe('skipped');
  });
  it('does not resend uncertain mail after the Resend idempotency window', async () => {
    setup();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const request = {
      ownerId: 'test-owner',
      channel: 'email' as const,
      email: message.to,
      subscriptions: [],
      telegramChatId: null,
      title: message.subject,
      body: message.text,
      deliveryId: 'expired',
      previous: {
        email: 'unknown',
        email_first_attempt_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
      },
    };
    const result = await (await transport()).deliver(request);
    expect(result.email_reconcile_required).toBe(true);
    expect(result.email).toBe('unknown');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('respects the longer provider delay when both email and Telegram are rate limited', async () => {
    setup();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', randomBytes(24).toString('hex'));
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        Response.json(
          {},
          {
            status: 429,
            headers: { 'retry-after': url === 'https://api.resend.com/emails' ? '7' : '2' },
          },
        ),
      ),
    );
    const request = {
      ownerId: 'test-owner',
      channel: 'email' as const,
      email: message.to,
      subscriptions: [],
      telegramChatId: 'test-chat',
      title: message.subject,
      body: message.text,
      deliveryId: 'rate-limit',
    };
    const result = await (await transport(true)).deliver(request);
    expect(result).toMatchObject({
      email: 'rate_limited',
      telegram: 'rate_limited',
      retry_after_seconds: 7,
    });
  });

  it('RF-PR-13: sends html and headers on Resend and SMTP', async () => {
    setup();
    const fetcher = vi.fn(() => Promise.resolve(Response.json({ id: 'email-id' })));
    vi.stubGlobal('fetch', fetcher);
    await sendEmail({
      ...message,
      html: '<p>Hola</p>',
      headers: { 'Auto-Submitted': 'auto-generated' },
    });
    const call = fetcher.mock.calls[0] as unknown as [string, { body?: string }] | undefined;
    const body = JSON.parse(String(call?.[1].body)) as { html?: string; headers?: unknown };
    expect(body.html).toBe('<p>Hola</p>');
    expect(body.headers).toEqual({ 'Auto-Submitted': 'auto-generated' });
    vi.stubEnv('RESEND_API_KEY', '');
    smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
    await sendEmail({
      ...message,
      html: '<p>Hola</p>',
      headers: { 'X-Entity-Ref-ID': 'token-id' },
    });
    expect(smtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<p>Hola</p>', text: message.text }),
    );
  });

  it('RF-PR SMTP_SECURE is explicit and requireTLS stays off for mailpit', () => {
    vi.stubEnv('SMTP_SECURE', 'true');
    expect(smtpSecure()).toBe(true);
    vi.stubEnv('SMTP_SECURE', 'false');
    expect(smtpSecure()).toBe(false);
    expect(smtpRequireTls('mailpit')).toBe(false);
    expect(smtpRequireTls('localhost')).toBe(false);
    expect(smtpRequireTls('smtp.example.test')).toBe(true);
  });
});
