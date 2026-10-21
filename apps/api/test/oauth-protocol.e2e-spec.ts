import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.AUTH_OAUTH_IP_LIMIT = '2';
process.env.AUTH_IP_LIMIT = '10';

const prisma = new PrismaClient();

describe('OAuth protocol error shape and isolated rate limit', () => {
  let app: INestApplication;
  let server: SuperTestApp;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('returns string error bodies on token/register/revoke and isolates OAuth 429', async () => {
    const email = `oauth-protocol-${randomUUID()}@reflexionia.test`;
    const user = await prisma.user.create({
      data: { email, displayName: 'OAuth protocol', timeZone: 'Europe/Madrid' },
    });

    try {
      const badRegister = await request(server)
        .post('/oauth/register')
        .send({ redirect_uris: ['https://evil.example/cb'], client_name: 'Nope' });
      expect(badRegister.status).toBe(400);
      expect(badRegister.body.error).toBe('invalid_redirect_uri');
      expect(typeof badRegister.body.error_description).toBe('string');

      const first = await request(server).post('/api/v1/oauth/token').send({
        grant_type: 'authorization_code',
        code: 'missing',
        redirect_uri: 'http://127.0.0.1:9/cb',
        client_id: 'unknown',
        code_verifier: 'a'.repeat(43),
      });
      expect(first.status).toBe(400);
      expect(first.body).toEqual({
        error: 'invalid_grant',
        error_description: expect.any(String),
      });

      const second = await request(server).post('/api/v1/oauth/token').send({
        grant_type: 'authorization_code',
        code: 'missing-2',
        redirect_uri: 'http://127.0.0.1:9/cb',
        client_id: 'unknown',
        code_verifier: 'a'.repeat(43),
      });
      expect(second.status).toBe(400);

      const blocked = await request(server).post('/api/v1/oauth/token').send({
        grant_type: 'authorization_code',
        code: 'missing-3',
        redirect_uri: 'http://127.0.0.1:9/cb',
        client_id: 'unknown',
        code_verifier: 'a'.repeat(43),
      });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
      expect(blocked.body).toEqual({
        error: 'temporarily_unavailable',
        error_description: 'Too many requests',
      });

      const revoke = await request(server).post('/api/v1/oauth/revoke').send({ token: 'x'.repeat(40) });
      expect(revoke.status).toBe(429);
      expect(typeof revoke.body.error).toBe('string');

      const loginShape = await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password-value' });
      expect(loginShape.status).toBeGreaterThanOrEqual(400);
      expect(loginShape.body.error).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      );
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });
});
