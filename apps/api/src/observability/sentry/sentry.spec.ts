import {
  Body,
  Controller,
  Get,
  HttpException,
  type INestApplication,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { leaks, TRAP } from '../../../test/helpers/pii-trap.js';
import { fakeTransport } from '../../../test/helpers/sentry-transport.js';
import { configureApp } from '../../configure-app.js';
import { HealthModule } from '../../health/health.module.js';
import { closeSentry, flushThrottleSummary, initSentry } from './sentry.js';

type SuperTestApp = Parameters<typeof request>[0];

const USER_ID = '11111111-1111-4111-8111-111111111111';

class PrismaClientKnownRequestError extends Error {
  override name = 'PrismaClientKnownRequestError';
  readonly code = 'P2002';
  readonly meta = { modelName: 'Task', target: [TRAP.title] };
}

@Controller('trap')
class TrapController {
  @Post('public/lists/:token')
  boom(
    @Param('token') _token: string,
    @Body() body: unknown,
    @Req() req: { user?: unknown },
  ): never {
    req.user = { id: USER_ID, email: TRAP.email };
    Sentry.setTag('title', TRAP.title);
    Sentry.setExtra('body', body);
    Sentry.setContext('task', { title: TRAP.title, raw_text: TRAP.rawText });
    Sentry.addBreadcrumb({ message: TRAP.title, data: { email: TRAP.email } });
    throw new PrismaClientKnownRequestError(
      `Invalid \`prisma.task.create()\` invocation: title "${TRAP.title}" owner ${TRAP.email}`,
    );
  }

  @Get('status/:code')
  status(@Param('code') code: string): never {
    const status = Number(code);
    throw new HttpException(
      { code: status === 403 ? 'scope_missing' : 'trap', message: TRAP.title },
      status,
    );
  }

  @Get('plain')
  plain(): never {
    throw new Error('same failure every time');
  }
}

const ENABLED = {
  SENTRY_ENABLED: 'true',
  SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
  SENTRY_ENVIRONMENT: 'staging',
  GIT_COMMIT: 'abcdef1234567890',
};

let app: INestApplication | null = null;

async function startApp(): Promise<SuperTestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [HealthModule],
    controllers: [TrapController],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app.getHttpServer() as SuperTestApp;
}

afterEach(async () => {
  await app?.close();
  app = null;
  await closeSentry();
});

describe('Sentry in the API', () => {
  it('CA-05/CA-01: a 500 sends 1 event with release, environment, tags, user.id and no PII', async () => {
    const { transport, captured } = fakeTransport();
    expect(initSentry(ENABLED, { transport, processHandlers: false })).toBe(true);
    const server = await startApp();

    const response = await request(server)
      .post(`/api/v1/trap/public/lists/${TRAP.publicListToken}?${TRAP.query}&email=${TRAP.email}`)
      .set('Authorization', `Bearer ${TRAP.pat}`)
      .set('Cookie', `${TRAP.session}; other=${TRAP.oauthRefresh}`)
      .set('X-Request-Id', 'req-trap-0001')
      .send({ title: TRAP.title, raw_text: TRAP.rawText, email: TRAP.email });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error', details: null },
    });
    await Sentry.flush(2_000);
    const events = captured.events();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toMatchObject({
      environment: 'staging',
      release: 'ttd-api@0.3.0+abcdef1',
      level: 'error',
      user: { id: USER_ID },
      tags: {
        component: 'api',
        deploy_sha: 'abcdef1',
        request_id: 'req-trap-0001',
        route: 'POST /api/v1/trap/public/lists/:token',
      },
    });
    expect(event).not.toHaveProperty('request');
    expect(event).not.toHaveProperty('extra');
    expect(event).not.toHaveProperty('contexts');
    expect(event).not.toHaveProperty('server_name');
    expect(JSON.stringify(event)).toContain('PrismaError P2002 Task.create');
    expect(leaks(captured.raw.join('\n'))).toEqual([]);
  });

  it('CA-06: 400, 401, 403 scope_missing, 404, 409, 413 and 429 send 0 events', async () => {
    const { transport, captured } = fakeTransport();
    initSentry(ENABLED, { transport, processHandlers: false });
    const server = await startApp();
    for (const code of [400, 401, 403, 404, 409, 413, 429]) {
      await request(server)
        .get(`/api/v1/trap/status/${String(code)}`)
        .expect(code);
    }
    await request(server).get('/api/v1/does-not-exist').expect(404);
    await Sentry.flush(2_000);
    expect(captured.raw).toEqual([]);
  });

  it('CA-11: 360 health checks send 0 events and 0 transactions', async () => {
    const { transport, captured } = fakeTransport();
    initSentry(ENABLED, { transport, processHandlers: false });
    const server = await startApp();
    for (let index = 0; index < 360; index += 1) {
      await request(server).get('/api/v1/health').expect(200);
    }
    await Sentry.flush(2_000);
    expect(captured.raw).toEqual([]);
  });

  it.each([
    ['SENTRY_ENABLED unset', { ...ENABLED, SENTRY_ENABLED: undefined }],
    ['SENTRY_ENABLED=false', { ...ENABLED, SENTRY_ENABLED: 'false' }],
    ['empty DSN', { ...ENABLED, SENTRY_DSN: '' }],
    ['inside Vitest', { ...ENABLED, VITEST: 'true' }],
  ])('CA-09/CA-12: %s keeps Sentry inert and the 500 body unchanged', async (_label, env) => {
    const { transport, captured } = fakeTransport();
    expect(initSentry(env, { transport, processHandlers: false })).toBe(false);
    expect(Sentry.getClient()?.getOptions().enabled ?? false).not.toBe(true);
    const server = await startApp();
    const response = await request(server).get('/api/v1/trap/plain').expect(500);
    expect(response.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error', details: null },
    });
    expect(captured.raw).toEqual([]);
  });

  it('CA-09: an unreachable Sentry does not change or block the response', async () => {
    const { transport } = fakeTransport(true);
    initSentry(ENABLED, { transport, processHandlers: false });
    const server = await startApp();
    const response = await request(server).get('/api/v1/trap/plain').expect(500);
    expect(response.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error', details: null },
    });
    await expect(Sentry.flush(2_000)).resolves.toBeTypeOf('boolean');
  });

  it('throttles staging to 3 per fingerprint and sums up the rest in 1 message', async () => {
    const { transport, captured } = fakeTransport();
    initSentry(ENABLED, { transport, processHandlers: false });
    const server = await startApp();
    for (let index = 0; index < 8; index += 1) {
      await request(server).get('/api/v1/trap/plain').expect(500);
    }
    flushThrottleSummary();
    await Sentry.flush(2_000);
    const events = captured.events();
    expect(events.filter((event) => event.exception !== undefined)).toHaveLength(3);
    expect(events.filter((event) => event.message !== undefined)).toEqual([
      expect.objectContaining({
        message: 'Sentry: suprimidos 5 eventos por el throttling',
        level: 'warning',
      }),
    ]);
  });

  it('production allows 10 per fingerprint', async () => {
    const { transport, captured } = fakeTransport();
    initSentry(
      { ...ENABLED, SENTRY_ENVIRONMENT: 'production' },
      { transport, processHandlers: false },
    );
    const server = await startApp();
    for (let index = 0; index < 12; index += 1) {
      await request(server).get('/api/v1/trap/plain').expect(500);
    }
    await Sentry.flush(2_000);
    expect(captured.events()).toHaveLength(10);
  });

  it('the suppressed summary spends a cap slot and is dropped when the cap is full', async () => {
    const { transport, captured } = fakeTransport();
    initSentry(
      { ...ENABLED, SENTRY_ENVIRONMENT: 'production' },
      { transport, processHandlers: false },
    );
    for (let index = 0; index < 11; index += 1) {
      Sentry.captureException(new Error('repeated failure'));
    }
    for (let index = 0; index < 49; index += 1) {
      Sentry.captureException(new Error(`other ${String(index)}`));
    }
    // 10 + 49 admitted, 1 suppressed, one hourly slot left. The summary takes it.
    flushThrottleSummary();
    Sentry.captureException(new Error('after the summary'));
    await Sentry.flush(2_000);
    const events = captured.events();
    expect(events.filter((event) => event.exception !== undefined)).toHaveLength(59);
    expect(events.filter((event) => event.message !== undefined)).toEqual([
      expect.objectContaining({
        message: 'Sentry: suprimidos 1 eventos por el throttling',
        level: 'warning',
      }),
    ]);

    flushThrottleSummary();
    await Sentry.flush(2_000);
    expect(captured.events().filter((event) => event.message !== undefined)).toHaveLength(1);
  });
});
