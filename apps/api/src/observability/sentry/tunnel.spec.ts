import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Controller, HttpCode, type INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TRAP } from '../../../test/helpers/pii-trap.js';
import { configureApp } from '../../configure-app.js';
import { SentryTunnelController } from './tunnel.controller.js';
import { SentryTunnel, TUNNEL_MAX_BYTES, tunnelSettings } from './tunnel.js';

type SuperTestApp = Parameters<typeof request>[0];

interface Received {
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

@Controller('oauth/token')
class OAuthTokenStub {
  @Post()
  @HttpCode(200)
  token(): { ok: true } {
    return { ok: true };
  }
}

let app: INestApplication | null = null;
let ingest: Server | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
  await new Promise<void>((resolve) => {
    if (ingest === null) {
      resolve();
      return;
    }
    ingest.close(() => {
      resolve();
    });
  });
  ingest = null;
});

async function fakeSentry(): Promise<{ dsn: string; received: Received[] }> {
  const received: Received[] = [];
  ingest = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      received.push({ url: req.url ?? '', headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"id":"0123456789abcdef0123456789abcdef"}');
    });
  });
  await new Promise<void>((resolve) => ingest?.listen(0, '127.0.0.1', resolve));
  const { port } = ingest.address() as AddressInfo;
  return { dsn: `http://webkey@127.0.0.1:${String(port)}/42`, received };
}

async function startApp(
  env: Record<string, string>,
  limits?: { readonly global?: number },
): Promise<SuperTestApp> {
  const moduleRef = await Test.createTestingModule({
    controllers: [SentryTunnelController, OAuthTokenStub],
    providers: [{ provide: SentryTunnel, useValue: new SentryTunnel(env, Date.now, limits) }],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app.getHttpServer() as SuperTestApp;
}

function envelope(dsn: string, message = 'boom'): string {
  return [
    JSON.stringify({ event_id: '0123456789abcdef0123456789abcdef', dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ message }),
  ].join('\n');
}

function post(server: SuperTestApp, body: string) {
  return request(server)
    .post('/api/v1/sentry-tunnel')
    .set('content-type', 'text/plain;charset=UTF-8')
    .set('origin', 'https://todo.example.test')
    .set('referer', `https://todo.example.test/public/lists/${TRAP.publicListToken}`)
    .set('x-forwarded-for', '203.0.113.9')
    .set('cookie', TRAP.session)
    .send(body);
}

describe('Sentry tunnel (#209)', () => {
  it('needs SENTRY_TUNNEL_ENABLED=true and the web DSN', () => {
    expect(tunnelSettings({})).toBeNull();
    expect(tunnelSettings({ SENTRY_WEB_DSN: 'http://k@h/1' })).toBeNull();
    expect(tunnelSettings({ SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: ' ' })).toBeNull();
    expect(
      tunnelSettings({ SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: 'http://k@h/1' }),
    ).toEqual({ webDsn: 'http://k@h/1' });
  });

  it('CA-09: without a web DSN it answers 204 and opens no connection', async () => {
    const sentry = await fakeSentry();
    const server = await startApp({ SENTRY_TUNNEL_ENABLED: 'true' });
    await post(server, envelope(sentry.dsn)).expect(204);
    expect(sentry.received).toHaveLength(0);
  });

  it('kill switch: SENTRY_TUNNEL_ENABLED=false drops the envelope with 204', async () => {
    const sentry = await fakeSentry();
    const server = await startApp({ SENTRY_TUNNEL_ENABLED: 'false', SENTRY_WEB_DSN: sentry.dsn });
    await post(server, envelope(sentry.dsn)).expect(204);
    expect(sentry.received).toHaveLength(0);
  });

  it('forwards the ttd-web envelope without client IP, cookies or referer', async () => {
    const sentry = await fakeSentry();
    const server = await startApp({ SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: sentry.dsn });
    const body = envelope(sentry.dsn);
    const response = await post(server, body).expect(200);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(sentry.received).toHaveLength(1);
    const [forwarded] = sentry.received;
    expect(forwarded?.url).toMatch(/^\/api\/42\/envelope\/\?.*sentry_key=webkey/);
    expect(forwarded?.body).toBe(body);
    const headers = JSON.stringify(forwarded?.headers);
    expect(headers).not.toContain('203.0.113.9');
    expect(headers).not.toContain('rfx_session');
    expect(headers).not.toContain(TRAP.publicListToken);
    expect(forwarded?.headers['x-forwarded-for']).toBeUndefined();
    expect(forwarded?.headers.cookie).toBeUndefined();
    expect(forwarded?.headers.referer).toBeUndefined();
    expect(forwarded?.headers.origin).toBe('https://todo.example.test');
  });

  it('allowedDsns: any other DSN gets 403 and is not forwarded', async () => {
    const sentry = await fakeSentry();
    const server = await startApp({ SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: sentry.dsn });
    await post(server, envelope(sentry.dsn.replace('webkey', 'apikey'))).expect(403);
    await post(server, 'not an envelope').expect(403);
    expect(sentry.received).toHaveLength(0);
  });

  it('rejects bodies over the limit with 413', async () => {
    const sentry = await fakeSentry();
    const server = await startApp({ SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: sentry.dsn });
    await post(server, envelope(sentry.dsn, 'x'.repeat(TUNNEL_MAX_BYTES))).expect(413);
    expect(sentry.received).toHaveLength(0);
  });

  it('rate limits per IP', async () => {
    const sentry = await fakeSentry();
    const server = await startApp({ SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: sentry.dsn });
    for (let index = 0; index < 30; index += 1) {
      await post(server, envelope(sentry.dsn)).expect(200);
    }
    const limited = await post(server, envelope(sentry.dsn)).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(sentry.received).toHaveLength(30);
  });

  it('rate limits the tunnel globally as well as per IP', async () => {
    const sentry = await fakeSentry();
    const server = await startApp(
      { SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: sentry.dsn },
      { global: 2 },
    );
    await post(server, envelope(sentry.dsn)).expect(200);
    await post(server, envelope(sentry.dsn)).expect(200);
    await post(server, envelope(sentry.dsn)).expect(429);
    expect(sentry.received).toHaveLength(2);
  });

  it('leaves oauthEdgeMiddleware aliases and ChatGPT CORS intact', async () => {
    const sentry = await fakeSentry();
    const server = await startApp({ SENTRY_TUNNEL_ENABLED: 'true', SENTRY_WEB_DSN: sentry.dsn });
    await request(server).post('/oauth/token').send({}).expect(200, { ok: true });
    const preflight = await request(server)
      .options('/oauth/token')
      .set('origin', 'https://chatgpt.com')
      .expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://chatgpt.com');
    await post(server, envelope(sentry.dsn)).expect(200);
  });
});
