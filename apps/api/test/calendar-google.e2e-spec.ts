import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();

describe('Google calendar subscriptions', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let email: string;
  let ownerId: string;

  beforeAll(async () => {
    await prisma.$connect();
    email = `gcal-${randomUUID()}@reflexionia.test`;
    const user = await prisma.user.create({
      data: { email, displayName: 'gcal', timeZone: 'Europe/Madrid' },
    });
    ownerId = user.id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    await app.close();
    await prisma.externalEvent.deleteMany({ where: { ownerId } });
    await prisma.calendarSubscription.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId } });
    await prisma.activityLog.deleteMany({ where: { ownerId } });
    await prisma.idempotencyRecord.deleteMany({ where: { ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  function authed() {
    const header = { 'X-Dev-User-Email': email };
    return {
      get: (url: string) => request(server).get(url).set(header),
      post: (url: string) => request(server).post(url).set(header),
      patch: (url: string) => request(server).patch(url).set(header),
      delete: (url: string) => request(server).delete(url).set(header),
    };
  }

  it('RF-1103: an existing iCal subscription still lists the new fields', async () => {
    const row = await prisma.calendarSubscription.create({
      data: {
        ownerId,
        provider: 'ical',
        url: 'https://example.com/cal.ics',
        color: '#112233',
      },
    });
    const list = await authed().get('/api/v1/calendar/subscriptions').expect(200);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: row.id,
          provider: 'ical',
          visible: true,
          event_count: 0,
          last_error: null,
          calendar_id: null,
        }),
      ]),
    );
  });

  it('RF-2502: subscribing twice to the same Google calendar is idempotent', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    await prisma.user.update({
      where: { id: ownerId },
      data: {
        googleRefreshToken: 'stored-refresh',
        googleGrantedScopes: [
          'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/drive.file',
        ],
        googleCalendarEnabled: true,
        googleDriveEnabled: true,
      },
    });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string | URL) => {
      const url = String(input);
      if (url.includes('tokeninfo')) {
        return new Response(JSON.stringify({ scope: 'https://www.googleapis.com/auth/calendar' }), {
          status: 200,
        });
      }
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'access' }), { status: 200 });
      }
      if (url.includes('calendarList')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'ada@gmail.com',
                summary: 'Personal',
                primary: true,
                backgroundColor: '#4772FA',
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'evt-1',
              summary: 'Reunión',
              start: { dateTime: '2026-10-20T09:00:00+02:00', timeZone: 'Europe/Madrid' },
              end: { dateTime: '2026-10-20T10:00:00+02:00', timeZone: 'Europe/Madrid' },
            },
          ],
          nextSyncToken: 'sync-1',
        }),
        { status: 200 },
      );
    });
    try {
      const first = await authed()
        .post('/api/v1/calendar/subscriptions')
        .send({ provider: 'google', calendar_id: 'ada@gmail.com', color: '#4772FA' })
        .expect(201);
      expect(first.body.imported).toBe(1);
      const second = await authed()
        .post('/api/v1/calendar/subscriptions')
        .send({ provider: 'google', calendar_id: 'ada@gmail.com' })
        .expect(201);
      expect(second.body.id).toBe(first.body.id);
      const hidden = await authed()
        .patch(`/api/v1/calendar/subscriptions/${first.body.id as string}`)
        .send({ visible: false })
        .expect(200);
      expect(hidden.body.visible).toBe(false);
      const events = await authed()
        .get('/api/v1/calendar/events')
        .query({ from: '2026-10-20T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' })
        .expect(200);
      expect(events.body.external).toEqual([]);
      await authed()
        .patch(`/api/v1/calendar/subscriptions/${first.body.id as string}`)
        .send({ visible: true })
        .expect(200);
      const shown = await authed()
        .get('/api/v1/calendar/events')
        .query({ from: '2026-10-20T00:00:00.000Z', to: '2026-10-21T00:00:00.000Z' })
        .expect(200);
      expect(shown.body.external).toEqual([
        expect.objectContaining({
          title: 'Reunión',
          editable: false,
          calendar_id: 'ada@gmail.com',
          subscription_id: first.body.id as string,
          status: 'confirmed',
        }),
      ]);
    } finally {
      globalThis.fetch = original;
      vi.unstubAllGlobals();
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });
});
