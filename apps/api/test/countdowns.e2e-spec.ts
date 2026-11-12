import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

loadRootEnv();
process.env.AUTH_MODE = 'dev';
const prisma = new PrismaClient();
describe('RF-2431/2440 countdown API parity', () => {
  let app: INestApplication;
  const email = `countdown-${randomUUID()}@example.test`;
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({
      data: { email, displayName: 'Countdown test', timeZone: 'Europe/Madrid' },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  it('RF-2401/2404/2405: paginates ordered records and round-trips edits, archive and restore', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const headers = { 'X-Dev-User-Email': email };
    const ids: string[] = [];
    for (const [title, target_date] of [
      ['Later', '2099-12-31'],
      ['Near', '2099-01-01'],
      ['Pinned', '2099-06-01'],
    ]) {
      const created = await request(server)
        .post('/api/v1/countdowns')
        .set(headers)
        .set('Idempotency-Key', randomUUID())
        .send({ title, target_date })
        .expect(201);
      ids.push(created.body.id as string);
    }
    await request(server)
      .patch(`/api/v1/countdowns/${ids[2]}`)
      .set(headers)
      .send({
        pinned: true,
        emoji: '✈️',
        color: 'blue',
        repeat_rule: 'yearly',
        day_mode: 'plus_one',
        reminders: [{ offset_days: 0, constant: true }],
        notes: 'Test notes',
        show_in_sidebar: false,
        show_in_smart_list: false,
      })
      .expect(200);
    const first = await request(server).get('/api/v1/countdowns?limit=2').set(headers).expect(200);
    expect(first.body.items.map((item: { title: string }) => item.title)).toEqual([
      'Pinned',
      'Near',
    ]);
    expect(first.body.items[0]).toMatchObject({
      emoji: '✈️',
      color: 'blue',
      notes: 'Test notes',
      reminders: [{ offset_days: 0, constant: true }],
      show_in_sidebar: false,
    });
    const second = await request(server)
      .get('/api/v1/countdowns')
      .query({ limit: 2, cursor: first.body.next_cursor })
      .set(headers)
      .expect(200);
    expect(second.body.items.map((item: { title: string }) => item.title)).toEqual(['Later']);
    expect(second.body.next_cursor).toBeNull();
    await request(server).get('/api/v1/countdowns?limit=0').set(headers).expect(400);
    await request(server).get('/api/v1/countdowns?cursor=bad').set(headers).expect(400);
    await request(server).post(`/api/v1/countdowns/${ids[2]}/archive`).set(headers).expect(200);
    expect(
      (await request(server).get('/api/v1/countdowns?archived=true').set(headers)).body.items,
    ).toHaveLength(1);
    await request(server).post(`/api/v1/countdowns/${ids[2]}/unarchive`).set(headers).expect(200);
    await request(server).delete(`/api/v1/countdowns/${ids[2]}`).set(headers).expect(204);
    const restored = await request(server)
      .post(`/api/v1/countdowns/${ids[2]}/restore`)
      .set(headers)
      .expect(200);
    expect(restored.body).toMatchObject({ id: ids[2], emoji: '✈️', pinned: true });
  });
});
