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
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';
process.env.REGISTRATION_OPEN = 'true';

const TIMING =
  /auth;dur=\d+(?:\.\d+)?, db;dur=\d+(?:\.\d+)?;desc="\d+ q", app;dur=\d+(?:\.\d+)?, total;dur=\d+(?:\.\d+)?/;

const prisma = new PrismaClient();

describe('Server-Timing', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let userId: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    if (userId !== undefined) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.activityLog.deleteMany({ where: { ownerId: userId } });
      await prisma.outboxEvent.deleteMany({ where: { ownerId: userId } });
      await prisma.project.deleteMany({ where: { ownerId: userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it('adds Server-Timing to every /api response, including a 401', async () => {
    const health = await request(server).get('/api/v1/health').expect(200);
    expect(health.headers['server-timing']).toMatch(TIMING);
    expect(health.headers['x-request-id']).toEqual(expect.any(String));

    const missing = await request(server).get('/api/v1/projects').expect(401);
    expect(missing.headers['server-timing']).toMatch(TIMING);
  });

  it('counts queries on a request that touches Postgres', async () => {
    const email = `timing-${randomUUID()}@reflexionia.test`;
    const created = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct-horse', display_name: 'Timing' })
      .expect(201);
    userId = created.body.id as string;
    const header = String(created.headers['server-timing']);
    expect(header).toMatch(TIMING);
    const count = /desc="(\d+) q"/.exec(header);
    expect(Number(count?.[1] ?? '0')).toBeGreaterThan(0);
  });
});
