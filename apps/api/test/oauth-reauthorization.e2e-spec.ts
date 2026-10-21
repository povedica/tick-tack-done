import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { AuthUser } from '../src/auth/auth-user.js';
import { TokenAudit } from '../src/auth/token-audit.js';
import { TokensService } from '../src/auth/tokens.service.js';
import { EventRecorder } from '../src/events/event-recorder.js';
import { loadRootEnv } from '../src/load-env.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

loadRootEnv();
const db = new PrismaService();
const tokens = new TokensService(db, new EventRecorder(), new TokenAudit(db));
afterAll(() => db.$disconnect());

describe('TTD-AUD-37 OAuth reauthorization on real PostgreSQL transactions', () => {
  it.each([false, true])(
    'RF-2002: repeated authorization succeeds with manual collision=%s',
    async (manual) => {
      const owner = await db.user.create({
        data: {
          email: `oauth-reauth-${randomUUID()}@reflexionia.test`,
          displayName: 'OAuth reauthorization',
        },
      });
      const client = await db.oauthClient.create({
        data: { ownerId: owner.id, name: 'ChatGPT', redirectUris: ['http://127.0.0.1/cb'] },
      });
      const user: AuthUser = {
        id: owner.id,
        email: owner.email,
        timeZone: 'Europe/Madrid',
        completeChildren: 'ask',
        scopes: ['tasks:read'],
        tokenId: null,
        sessionId: null,
        listIds: null,
      };
      try {
        if (manual) {
          await db.personalAccessToken.create({
            data: {
              ownerId: owner.id,
              name: 'ChatGPT',
              tokenHash: randomUUID(),
              tokenPrefix: 'test-prefix',
              scopes: ['tasks:read'],
            },
          });
        }
        const issue = () =>
          db.$transaction((tx) =>
            tokens.issueOauthAccess(tx, {
              user,
              name: 'ChatGPT',
              scopes: ['tasks:read'],
              clientId: client.id,
              expiresAt: new Date(Date.now() + 3_600_000),
            }),
          );
        const first = await issue();
        const second = await issue();
        expect(second.id).not.toBe(first.id);
        expect(second.token).not.toBe(first.token);
        const rows = await db.personalAccessToken.findMany({
          where: { ownerId: owner.id, oauthClientId: client.id },
        });
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.name.length <= 80)).toBe(true);
        expect(new Set(rows.map((row) => row.name)).size).toBe(2);
        expect(
          await db.outboxEvent.count({ where: { ownerId: owner.id, type: 'token.created@v1' } }),
        ).toBe(2);
        if (manual)
          expect(
            await db.personalAccessToken.count({
              where: { ownerId: owner.id, name: 'ChatGPT', oauthClientId: null, revokedAt: null },
            }),
          ).toBe(1);
      } finally {
        await db.activityLog.deleteMany({ where: { ownerId: owner.id } });
        await db.outboxEvent.deleteMany({ where: { ownerId: owner.id } });
        await db.personalAccessToken.deleteMany({ where: { ownerId: owner.id } });
        await db.oauthClient.delete({ where: { id: client.id } });
        await db.user.delete({ where: { id: owner.id } });
      }
    },
  );
});
