import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { newOauthRefreshToken, newPersonalAccessToken } from '../src/auth/token-secret.js';
import { openField } from '../src/security/field-cipher.js';

process.env.AUTH_MODE = 'dev';
process.env.AUTH_OAUTH_IP_LIMIT = '100';

describe('TTD-AUD-80 / RF-2001 durable OAuth refresh', () => {
  let app: INestApplication;
  let db: PrismaService;
  type Server = Parameters<typeof request>[0];
  let server: Server;
  const owners: string[] = [];
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    for (const ownerId of owners) {
      await db.activityLog.deleteMany({ where: { ownerId } });
      await db.outboxEvent.deleteMany({ where: { ownerId } });
      await db.oauthRefreshToken.deleteMany({ where: { userId: ownerId } });
      await db.personalAccessToken.deleteMany({ where: { ownerId } });
      await db.oauthClient.deleteMany({ where: { ownerId } });
      await db.user.delete({ where: { id: ownerId } });
    }
    await app.close();
  });
  async function seed() {
    const owner = await db.user.create({
      data: {
        email: `r80-${randomUUID()}@example.test`,
        displayName: 'Synthetic refresh',
        timeZone: 'Europe/Madrid',
      },
    });
    owners.push(owner.id);
    const client = await db.oauthClient.create({
      data: {
        ownerId: owner.id,
        name: 'R80 test',
        redirectUris: ['http://127.0.0.1/cb'],
      },
    });
    const access = newPersonalAccessToken();
    const pat = await db.personalAccessToken.create({
      data: {
        ownerId: owner.id,
        oauthClientId: client.id,
        name: randomUUID(),
        tokenHash: access.hash,
        tokenPrefix: access.prefix,
        scopes: ['profile:read'],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const refresh = newOauthRefreshToken();
    const row = await db.oauthRefreshToken.create({
      data: {
        familyId: randomUUID(),
        clientId: client.id,
        userId: owner.id,
        accessTokenId: pat.id,
        tokenHash: refresh.hash,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const body = {
      grant_type: 'refresh_token',
      client_id: client.id,
      refresh_token: refresh.token,
    };
    return { owner, client, access, pat, row, body };
  }
  const renew = (body: Record<string, unknown>) =>
    request(server).post('/api/v1/oauth/token').send(body);

  it('serializes parallel renewals and durably replays the same encrypted pair', async () => {
    const data = await seed();
    const responses = await Promise.all([renew(data.body), renew(data.body)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(responses[1].body).toEqual(responses[0].body);
    const replay = await renew(data.body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(responses[0].body);
    const stored = await db.oauthRefreshToken.findUniqueOrThrow({ where: { id: data.row.id } });
    expect(stored.replacementPair).toMatch(/^enc1:/);
    expect(JSON.parse(openField(stored.replacementPair ?? ''))).toEqual(replay.body);
    expect(
      await db.oauthRefreshToken.count({
        where: { familyId: data.row.familyId, revokedAt: { not: null } },
      }),
    ).toBe(0);
    expect(await db.oauthRefreshToken.count({ where: { familyId: data.row.familyId } })).toBe(2);
  });
  it('keeps the previous access valid for 120 seconds and expires it thereafter', async () => {
    const data = await seed();
    const start = Date.now();
    expect((await renew(data.body)).status).toBe(200);
    const old = await db.personalAccessToken.findUniqueOrThrow({ where: { id: data.pat.id } });
    expect(old.revokedAt).toBeNull();
    if (old.expiresAt === null) throw new Error('Expected bounded access expiry');
    expect(old.expiresAt.getTime() - start).toBeGreaterThanOrEqual(120_000);
    expect(old.expiresAt.getTime() - start).toBeLessThanOrEqual(121_000);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(old.expiresAt.getTime() - 1000);
      expect(
        (await request(server).get('/api/v1/me').auth(data.access.token, { type: 'bearer' }))
          .status,
      ).toBe(200);
      vi.setSystemTime(old.expiresAt.getTime() + 1);
      expect(
        (await request(server).get('/api/v1/me').auth(data.access.token, { type: 'bearer' }))
          .status,
      ).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });
  it('preserves an earlier expiry rather than extending the old access token', async () => {
    const data = await seed();
    const expiresAt = new Date(Date.now() + 30_000);
    await db.personalAccessToken.update({ where: { id: data.pat.id }, data: { expiresAt } });
    expect((await renew(data.body)).status).toBe(200);
    expect(
      (await db.personalAccessToken.findUniqueOrThrow({ where: { id: data.pat.id } })).expiresAt,
    ).toEqual(expiresAt);
  });
  it('revokes a spent family after 61 seconds and records reuse without secrets', async () => {
    const data = await seed();
    expect((await renew(data.body)).status).toBe(200);
    await db.oauthRefreshToken.update({
      where: { id: data.row.id },
      data: { rotatedAt: new Date(Date.now() - 61_000) },
    });
    const response = await renew(data.body);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_grant');
    expect(
      await db.oauthRefreshToken.count({ where: { familyId: data.row.familyId, revokedAt: null } }),
    ).toBe(0);
    const event = await db.outboxEvent.findFirstOrThrow({
      where: { ownerId: data.owner.id, type: 'oauth.refresh_reused@v1' },
    });
    expect(event.data).toMatchObject({ client_id: data.client.id, familyId: data.row.familyId });
    expect(JSON.stringify(event.data)).not.toContain(data.body.refresh_token);
  });
  it('never replays for another client or after explicit family revocation', async () => {
    const data = await seed();
    expect((await renew(data.body)).status).toBe(200);
    expect((await renew({ ...data.body, client_id: randomUUID() })).status).toBe(400);
    await db.oauthRefreshToken.updateMany({
      where: { familyId: data.row.familyId },
      data: { revokedAt: new Date() },
    });
    expect((await renew(data.body)).status).toBe(400);
  });
  it('maps a transient database failure to retryable RFC 6749 503', async () => {
    const data = await seed();
    const transaction = db.$transaction.bind(db);
    const spy = vi
      .spyOn(db, '$transaction')
      .mockImplementation(transaction)
      .mockRejectedValueOnce(new Error('temporary database outage'));
    try {
      const response = await renew(data.body);
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('temporarily_unavailable');
      expect(response.headers['retry-after']).toBe('2');
      expect((await renew(data.body)).status).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });
});
