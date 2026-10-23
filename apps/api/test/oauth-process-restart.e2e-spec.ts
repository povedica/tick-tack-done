import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { expect, it } from 'vitest';
import { newOauthRefreshToken, newPersonalAccessToken } from '../src/auth/token-secret.js';
import { loadRootEnv } from '../src/load-env.js';

loadRootEnv();

it('TTD-AUD-80 / RF-2001: HTTP OAuth and MCP survive a real API process restart', async () => {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (
    database.pathname !== '/ttd_r80' &&
    !(
      process.env.CI === 'true' &&
      database.pathname === '/reflexionia_test' &&
      ['localhost', '127.0.0.1'].includes(database.hostname)
    )
  )
    throw new Error('Only the isolated synthetic database is allowed');

  const db = new PrismaClient();
  const ownerId = randomUUID();
  let child: ChildProcess | undefined;
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => {
      if (error) reject(error);
      else resolve();
    }),
  );
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    VITEST: undefined,
    AUTH_MODE: '',
    PORT: String(port),
    AUTH_OAUTH_IP_LIMIT: '1000',
    APP_SECRET: randomBytes(32).toString('hex'),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    BUS_AUTOSTART: 'false',
    SCHEDULER_AUTOSTART: 'false',
  };
  async function start() {
    child = spawn(process.execPath, ['dist/main.js'], { env, stdio: 'ignore' });
    const state = { spawnFailed: false };
    child.once('error', () => {
      state.spawnFailed = true;
    });
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      if (state.spawnFailed || child.exitCode !== null)
        throw new Error('Synthetic API failed to start');
      try {
        const result = await fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(500) });
        if (result.ok) return;
      } catch {
        /* The child has not bound its port yet. */
      }
      await delay(100);
    }
    throw new Error('Synthetic API readiness timeout');
  }
  async function stop() {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const force = setTimeout(() => child?.kill('SIGKILL'), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(force);
    }
  }
  try {
    await db.user.create({
      data: {
        id: ownerId,
        email: `restart-${ownerId}@example.test`,
        displayName: 'Synthetic restart',
      },
    });
    const client = await db.oauthClient.create({
      data: {
        ownerId,
        name: 'Synthetic process restart',
        redirectUris: ['http://127.0.0.1/cb'],
      },
    });
    const access = newPersonalAccessToken();
    const pat = await db.personalAccessToken.create({
      data: {
        ownerId,
        oauthClientId: client.id,
        name: 'Synthetic restart',
        tokenHash: access.hash,
        tokenPrefix: access.prefix,
        scopes: ['profile:read'],
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const refresh = newOauthRefreshToken();
    const familyId = randomUUID();
    await db.oauthRefreshToken.create({
      data: {
        familyId,
        clientId: client.id,
        userId: ownerId,
        accessTokenId: pat.id,
        tokenHash: refresh.hash,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: client.id,
      refresh_token: refresh.token,
    });
    async function renew() {
      const response = await fetch(`${origin}/api/v1/oauth/token`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(5000),
      });
      if (response.status !== 200) {
        const error = (await response.json()) as { error?: string };
        const code =
          typeof error.error === 'string' && /^[a-z_]+$/.test(error.error)
            ? error.error
            : 'unknown';
        throw new Error(`Refresh HTTP ${response.status}: ${code}`);
      }
      return response.json() as Promise<{ access_token: string; refresh_token: string }>;
    }
    const headers = (token: string) => ({ Authorization: `Bearer ${token}` });
    await start();
    const [first, parallel] = await Promise.all([renew(), renew()]);
    // Boolean assertions prevent credentials appearing in failure diagnostics.
    expect(JSON.stringify(first) === JSON.stringify(parallel)).toBe(true);
    expect((await fetch(`${origin}/api/v1/me`, { headers: headers(access.token) })).status).toBe(
      200,
    );
    const firstPid = child?.pid;
    await stop();
    await start();
    expect(child?.pid !== firstPid).toBe(true);
    const replay = await renew();
    expect(JSON.stringify(replay) === JSON.stringify(first)).toBe(true);
    expect(
      (await fetch(`${origin}/api/v1/me`, { headers: headers(replay.access_token) })).status,
    ).toBe(200);
    expect((await fetch(`${origin}/api/v1/me`, { headers: headers(access.token) })).status).toBe(
      200,
    );
    const mcp = await fetch(`${origin}/api/v1/mcp`, {
      method: 'POST',
      headers: { ...headers(replay.access_token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'synthetic-restart', version: '1' },
        },
      }),
    });
    expect(mcp.status).toBe(200);
    expect(
      Boolean(((await mcp.json()) as { result?: { serverInfo?: unknown } }).result?.serverInfo),
    ).toBe(true);
    expect(
      await db.oauthRefreshToken.count({ where: { familyId, revokedAt: { not: null } } }),
    ).toBe(0);
  } finally {
    await stop();
    await db.activityLog.deleteMany({ where: { ownerId } });
    await db.outboxEvent.deleteMany({ where: { ownerId } });
    await db.oauthRefreshToken.deleteMany({ where: { userId: ownerId } });
    await db.personalAccessToken.deleteMany({ where: { ownerId } });
    await db.oauthClient.deleteMany({ where: { ownerId } });
    await db.user.deleteMany({ where: { id: ownerId } });
    await db.$disconnect();
  }
}, 65_000);
