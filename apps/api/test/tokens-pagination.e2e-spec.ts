import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import type { AuthUser } from '../src/auth/auth-user.js';
import { TokenAudit } from '../src/auth/token-audit.js';
import { TokensService } from '../src/auth/tokens.service.js';
import { EventRecorder } from '../src/events/event-recorder.js';
import { loadRootEnv } from '../src/load-env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

loadRootEnv();
const db = new PrismaService();
const service = new TokensService(db, new EventRecorder(), new TokenAudit(db));
afterAll(() => db.$disconnect());

it('TTD-AUD-35 RF-2002: active pagination survives 80 rotations and revoked count excludes them', async () => {
  const owner = await db.user.create({
    data: { email: `pagination-${randomUUID()}@reflexionia.test`, displayName: 'Pagination' },
  });
  const client = await db.oauthClient.create({
    data: { ownerId: owner.id, name: 'ChatGPT', redirectUris: ['http://127.0.0.1/cb'] },
  });
  const user: AuthUser = {
    id: owner.id,
    email: owner.email,
    timeZone: 'Europe/Madrid',
    completeChildren: 'ask',
    scopes: [],
    tokenId: null,
    sessionId: null,
    listIds: null,
  };
  const now = new Date();
  const token = (name: string) => ({
    id: randomUUID(),
    ownerId: owner.id,
    name,
    tokenHash: randomUUID(),
    tokenPrefix: 'test',
    scopes: ['tasks:read'],
  });
  const active = Array.from({ length: 56 }, (_, i) => ({
    ...token(`manual-${i}`),
    expiresAt: i === 0 ? new Date('2026-01-02T00:00:00.000Z') : null,
    oauthClientId: i === 0 ? client.id : null,
    createdAt: new Date('2026-01-01'),
  }));
  const rotations = Array.from({ length: 80 }, (_, i) => ({
    ...token(`rotation-${i}`),
    oauthClientId: client.id,
    revokedAt: now,
  }));
  const revoked = Array.from({ length: 3 }, (_, i) => ({
    ...token(`revoked-${i}`),
    revokedAt: now,
  }));
  try {
    await db.personalAccessToken.createMany({ data: [...active, ...rotations, ...revoked] });
    await db.oauthRefreshToken.createMany({
      data: rotations.map((row) => ({
        familyId: randomUUID(),
        clientId: client.id,
        userId: owner.id,
        accessTokenId: row.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3_600_000),
        rotatedAt: now,
      })),
    });
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(user, '10', cursor, 'active');
      expect(page.total).toBe(56);
      expect(page.items.every((item) => item.revoked_at === null)).toBe(true);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.next_cursor ?? undefined;
    } while (cursor !== undefined);
    const expired = await service.list(user, '100', undefined, 'active');
    expect(expired.items.find((item) => item.id === active[0]?.id)?.expires_at).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    expect(new Set(ids)).toEqual(new Set(active.map((item) => item.id)));
    const removed = await service.list(user, '2', undefined, 'revoked');
    expect(removed.total).toBe(3);
    expect(removed.items).toHaveLength(2);
    expect(removed.next_cursor).not.toBeNull();
    expect(removed.items.every((item) => revoked.some((row) => row.id === item.id))).toBe(true);
  } finally {
    await db.personalAccessToken.deleteMany({ where: { ownerId: owner.id } });
    await db.oauthClient.delete({ where: { id: client.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});

it('TTD-AUD-79 RF-2002: expiry and whole-application revocation preserve owner boundaries', async () => {
  const owner = await db.user.create({
    data: { email: `grants-${randomUUID()}@reflexionia.test`, displayName: 'Grants' },
  });
  const client = await db.oauthClient.create({
    data: { ownerId: owner.id, name: 'Claude', redirectUris: ['http://127.0.0.1/cb'] },
  });
  const user: AuthUser = {
    id: owner.id,
    email: owner.email,
    timeZone: 'Europe/Madrid',
    completeChildren: 'ask',
    scopes: [],
    tokenId: null,
    sessionId: 'browser',
    listIds: null,
  };
  try {
    const before = Date.now();
    const pat = await service.create(user, 'expiry', ['tasks:read'], 30);
    expect(Date.parse(pat.expires_at ?? '') - before).toBeGreaterThanOrEqual(30 * 86_400_000);
    await expect(service.create(user, 'bad', ['tasks:read'], 31)).rejects.toThrow();
    const access = await db.personalAccessToken.create({
      data: {
        ownerId: owner.id,
        name: 'oauth',
        tokenHash: randomUUID(),
        tokenPrefix: 'test',
        scopes: ['tasks:read'],
        oauthClientId: client.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await db.oauthRefreshToken.create({
      data: {
        userId: owner.id,
        clientId: client.id,
        accessTokenId: access.id,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect((await service.grants(user)).items[0]).toMatchObject({
      client_id: client.id,
      active_access_tokens: 1,
      active_refresh_families: 1,
    });
    await expect(service.revokeGrant({ ...user, id: randomUUID() }, client.id)).rejects.toThrow();
    await expect(service.grants({ ...user, tokenId: pat.id })).rejects.toThrow();
    await service.revokeGrant(user, client.id);
    await service.revokeGrant(user, client.id);
    expect((await service.grants(user)).items).toEqual([]);
    expect(await db.oauthRefreshToken.count({ where: { userId: owner.id, revokedAt: null } })).toBe(
      0,
    );
    expect(
      await db.personalAccessToken.count({
        where: { ownerId: owner.id, oauthClientId: client.id, revokedAt: null },
      }),
    ).toBe(0);
    expect((await service.grantActivity(user, client.id, '1', undefined)).items).toHaveLength(1);
  } finally {
    await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
    await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
    await db.personalAccessToken.deleteMany({ where: { ownerId: owner.id } });
    await db.oauthClient.delete({ where: { id: client.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
