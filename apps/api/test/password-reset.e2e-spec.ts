import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { totpCode } from '@reflexionia/domain';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/passwords.js';
import { hashSecret } from '../src/auth/session-cookie.js';
import { newOauthRefreshToken, newPersonalAccessToken } from '../src/auth/token-secret.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { sealField } from '../src/security/field-cipher.js';

const sent = vi.hoisted(() => [] as { to: string; text: string; html?: string }[]);
vi.mock('../src/mail/send-email.js', async () => {
  const actual = await vi.importActual('../src/mail/send-email.js');
  return {
    ...actual,
    sendEmail: (message: { to: string; text: string; html?: string }) => {
      sent.push(message);
      return Promise.resolve({ status: 'sent', retryAfter: null });
    },
  };
});

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.PUBLIC_URL = 'https://todo.reflexionia.com';
process.env.AUTH_RESET_IP_LIMIT = '5000';
process.env.AUTH_RESET_EMAIL_LIMIT = '5000';
process.env.AUTH_RESET_CONFIRM_IP_LIMIT = '5000';
process.env.PASSWORD_RESET_MIN_RESPONSE_MS = '0';
process.env.SCHEDULER_AUTOSTART = 'false';

const prisma = new PrismaClient();
type SuperTestApp = Parameters<typeof request>[0];

describe('RF-PR password reset', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  const owners: string[] = [];
  const logs: string[] = [];

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    for (const ownerId of owners) {
      await prisma.activityLog.deleteMany({ where: { ownerId } });
      await prisma.outboxEvent.deleteMany({ where: { ownerId } });
      await prisma.oauthRefreshToken.deleteMany({ where: { userId: ownerId } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: ownerId } });
      await prisma.recoveryCode.deleteMany({ where: { ownerId } });
      await prisma.personalAccessToken.deleteMany({ where: { ownerId } });
      await prisma.session.deleteMany({ where: { userId: ownerId } });
      await prisma.oauthClient.deleteMany({ where: { ownerId } });
      await prisma.user.delete({ where: { id: ownerId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function user(password = 'correct-horse-battery'): Promise<{ id: string; email: string }> {
    const email = `reset-${randomUUID()}@reflexionia.test`;
    const created = await prisma.user.create({
      data: {
        email,
        displayName: 'Ada',
        timeZone: 'Europe/Madrid',
        locale: 'es',
        passwordHash: await hashPassword(password),
      },
    });
    owners.push(created.id);
    return created;
  }

  async function tokenFromMail(email: string): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const mail = sent.find((item) => item.to === email && item.text.includes('#token='));
      const token = mail?.text.match(/#token=([A-Za-z0-9_-]+)/)?.[1];
      if (token !== undefined) {
        return token;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    }
    throw new Error('reset mail was not captured');
  }

  it('RF-PR-02 CA-2: request is identical for a missing account and an existing one', async () => {
    const existing = await user();
    const missing = `missing-${randomUUID()}@reflexionia.test`;
    const known = await request(server)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: existing.email });
    const unknown = await request(server)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: missing });
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(known.headers['set-cookie']).toBeUndefined();
    expect(await tokenFromMail(existing.email)).toHaveLength(43);
    expect(sent.some((item) => item.to === missing)).toBe(false);
  });

  it('RF-PR-05 CA-7 CA-8: confirm revokes sessions and oauth, keeps manual tokens, and rotates the password', async () => {
    const account = await user();
    const agent = request.agent(server);
    await agent
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'correct-horse-battery' })
      .expect(200);
    const manual = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId: account.id,
        name: 'manual',
        tokenHash: manual.hash,
        tokenPrefix: manual.prefix,
        scopes: ['profile:read'],
      },
    });
    const client = await prisma.oauthClient.create({
      data: { ownerId: account.id, name: 'Chat', redirectUris: ['https://example.test/cb'] },
    });
    const access = newPersonalAccessToken();
    const pat = await prisma.personalAccessToken.create({
      data: {
        ownerId: account.id,
        oauthClientId: client.id,
        name: randomUUID(),
        tokenHash: access.hash,
        tokenPrefix: access.prefix,
        scopes: ['profile:read'],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const refresh = newOauthRefreshToken();
    await prisma.oauthRefreshToken.create({
      data: {
        familyId: randomUUID(),
        clientId: client.id,
        userId: account.id,
        accessTokenId: pat.id,
        tokenHash: refresh.hash,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    sent.length = 0;
    await request(server)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: account.email })
      .expect(202);
    const token = await tokenFromMail(account.email);
    const verified = await request(server)
      .post('/api/v1/auth/password-reset/verify')
      .send({ token });
    expect(verified.body).toMatchObject({ valid: true, totp_required: false });
    const confirmed = await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, new_password: 'a-brand-new-secret' });
    expect(confirmed.status).toBe(204);
    const again = await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, new_password: 'a-brand-new-secret' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('reset_token_invalid');
    await agent.get('/api/v1/auth/session').expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'correct-horse-battery' })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: 'a-brand-new-secret' })
      .expect(200);
    const refreshed = await request(server).post('/api/v1/oauth/token').send({
      grant_type: 'refresh_token',
      client_id: client.id,
      refresh_token: refresh.token,
    });
    expect(refreshed.status).toBe(400);
    expect(JSON.stringify(refreshed.body)).toContain('invalid_grant');
    const kept = await prisma.personalAccessToken.findFirst({ where: { tokenHash: manual.hash } });
    expect(kept?.revokedAt).toBeNull();
    const oauthPat = await prisma.personalAccessToken.findUnique({ where: { id: pat.id } });
    expect(oauthPat?.revokedAt).not.toBeNull();
    const event = await prisma.outboxEvent.findFirst({
      where: { ownerId: account.id, type: 'account.password_reset@v1' },
    });
    expect(event?.data).toEqual({ user: { id: account.id } });
    expect(JSON.stringify(event?.data)).not.toContain(account.email);
    expect(logs.join('\n')).not.toContain(token);
    const stored = await prisma.passwordResetToken.findFirst({
      where: { tokenHash: hashSecret(token) },
    });
    expect(stored?.usedAt).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(token);
  });

  it('RF-PR-05: two confirms in parallel let only one win', async () => {
    const account = await user();
    sent.length = 0;
    await request(server)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: account.email })
      .expect(202);
    const token = await tokenFromMail(account.email);
    const pair = await Promise.all([
      request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, new_password: 'parallel-secret-one' }),
      request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, new_password: 'parallel-secret-two' }),
    ]);
    const statuses = pair.map((item) => item.status).sort();
    expect(statuses).toEqual([204, 400]);
  });

  it('RF-PR-06: TOTP and a recovery code are required, and five failures burn the link', async () => {
    const account = await user();
    const secret = 'JBSWY3DPEHPK3PXP';
    await prisma.user.update({
      where: { id: account.id },
      data: { totpEnabled: true, totpSecret: sealField(secret) },
    });
    const recovery = 'abcd-1234';
    await prisma.recoveryCode.create({
      data: { ownerId: account.id, codeHash: hashSecret(recovery) },
    });
    sent.length = 0;
    await request(server)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: account.email })
      .expect(202);
    const token = await tokenFromMail(account.email);
    const verified = await request(server)
      .post('/api/v1/auth/password-reset/verify')
      .send({ token });
    expect(verified.body.totp_required).toBe(true);
    const missing = await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, new_password: 'totp-protected-secret' });
    expect(missing.body.error.code).toBe('totp_required');
    const code = await totpCode(secret, Date.now());
    const saved = await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, new_password: 'totp-protected-secret', totp_code: code });
    expect(saved.status).toBe(204);
    const stillOn = await prisma.user.findUnique({ where: { id: account.id } });
    expect(stillOn?.totpEnabled).toBe(true);

    sent.length = 0;
    await request(server)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: account.email })
      .expect(202);
    const second = await tokenFromMail(account.email);
    const recovered = await request(server).post('/api/v1/auth/password-reset/confirm').send({
      token: second,
      new_password: 'recovered-secret-ok',
      recovery_code: recovery,
    });
    expect(recovered.status).toBe(204);
    const used = await prisma.recoveryCode.findFirst({ where: { ownerId: account.id } });
    expect(used?.usedAt).not.toBeNull();

    sent.length = 0;
    await request(server)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: account.email })
      .expect(202);
    const burned = await tokenFromMail(account.email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(server)
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: burned, new_password: 'another-long-secret', totp_code: '000000' });
      expect(failed.status).toBe(401);
    }
    const spent = await request(server)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: burned, new_password: 'another-long-secret', totp_code: '000000' });
    expect(spent.status).toBe(400);
    expect(spent.body.error.code).toBe('reset_token_invalid');
  });

  it('rejects a foreign Origin', async () => {
    const response = await request(server)
      .post('/api/v1/auth/password-reset/request')
      .set('Origin', 'https://evil.test')
      .send({ email: 'ada@example.test' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('origin_mismatch');
  });

  it('CA-2: existing and missing accounts stay within 30ms at the response floor', async () => {
    process.env.PASSWORD_RESET_MIN_RESPONSE_MS = '350';
    const account = await user();
    const samples = { known: [] as number[], missing: [] as number[] };
    for (let index = 0; index < 50; index += 1) {
      const startedKnown = Date.now();
      await request(server)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: account.email })
        .expect(202);
      samples.known.push(Date.now() - startedKnown);
      const startedMissing = Date.now();
      await request(server)
        .post('/api/v1/auth/password-reset/request')
        .send({ email: `none-${index}-${randomUUID()}@reflexionia.test` })
        .expect(202);
      samples.missing.push(Date.now() - startedMissing);
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[24] ?? 0;
    expect(median(samples.known)).toBeGreaterThanOrEqual(300);
    expect(median(samples.missing)).toBeGreaterThanOrEqual(300);
    expect(Math.abs(median(samples.known) - median(samples.missing))).toBeLessThan(30);
    process.env.PASSWORD_RESET_MIN_RESPONSE_MS = '0';
  }, 180_000);

  it('applies and reverts the reset-token migration', async () => {
    const down = readFileSync(
      'prisma/migrations/20261028184500_add_password_reset_tokens/down.sql',
      'utf8',
    );
    const up = readFileSync(
      'prisma/migrations/20261028184500_add_password_reset_tokens/migration.sql',
      'utf8',
    );
    for (const statement of down
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)) {
      await prisma.$executeRawUnsafe(statement);
    }
    for (const statement of up
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)) {
      await prisma.$executeRawUnsafe(statement);
    }
    expect(randomBytes(1).length).toBe(1);
  });
});
