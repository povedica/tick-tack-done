import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type { ProposalBody } from '@reflexionia/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { signTickyJwt } from '../src/modules/ticky/ticky-jwt.js';

const cross = process.env.TICKY_CROSS_SERVICE_URL;
const recovering = process.env.TICKY_CROSS_RECOVERY === '1';
const owner = '10000000-0000-4000-8000-000000000001';
const list = '10000000-0000-4000-8000-000000000002';
const token = 'rfx_pat_synthetic_cross_fixture_only';

// Explicit opt-in: requires the isolated Python HTTP fixture and disposable PostgreSQL/Redis.
describe.skipIf(cross === undefined)('APP-03 / TK-022/600 real HTTP compatibility', () => {
  let app: INestApplication | undefined;
  const prisma = new PrismaClient();
  let taskId: string;
  let threadId: string;
  beforeAll(async () => {
    if (process.env.DATABASE_URL?.includes('@postgres:5432/reflexionia') !== true) {
      throw new Error('Disposable cross-repository database required');
    }
    process.env.AUTH_MODE = 'dev';
    process.env.TICKY_SERVICE_URL = cross;
    process.env.TICKY_JWT_PRIVATE_KEY_PEM = readFileSync('/cross-keys/private.pem', 'utf8');
    process.env.TICKY_JWT_KID = 'synthetic-cross';
    process.env.TICKY_READ_ENABLED = 'true';
    process.env.TICKY_MODEL_ENABLED = 'false';
    process.env.TICKY_UI_ENABLED = 'true';
    process.env.TICKY_EXECUTION_ENABLED = 'true';
    process.env.TICKY_ROUTINES_ENABLED = 'true';
    if (!recovering) {
      await prisma.outboxEvent.deleteMany({ where: { ownerId: owner } });
      await prisma.activityLog.deleteMany({ where: { ownerId: owner } });
      await prisma.tickyClientMessage.deleteMany({ where: { ownerId: owner } });
      await prisma.personalAccessToken.deleteMany({ where: { ownerId: owner } });
      await prisma.task.deleteMany({ where: { ownerId: owner } });
      await prisma.project.deleteMany({ where: { ownerId: owner } });
      await prisma.user.deleteMany({ where: { id: owner } });
      await prisma.user.create({
        data: { id: owner, email: 'demo@reflexionia.test', displayName: 'Synthetic' },
      });
      await prisma.project.create({
        data: { id: list, ownerId: owner, name: 'Synthetic', isInbox: true },
      });
      await prisma.tickyAuthority.create({
        data: {
          ownerId: owner,
          version: 1,
          autonomy: 2,
          readEnabled: true,
          inboxListId: list,
          actionScopes: ['tasks:create', 'ticky:routines:write'],
          lists: { create: { listId: list } },
        },
      });
      await prisma.personalAccessToken.create({
        data: {
          ownerId: owner,
          name: 'synthetic reader',
          tokenHash: createHash('sha256').update(token).digest('hex'),
          tokenPrefix: token.slice(0, 16),
          scopes: ['tasks:read', 'lists:read'],
          listRestricted: true,
          listIds: [list],
        },
      });
      const task = await prisma.task.create({
        data: {
          ownerId: owner,
          projectId: list,
          title: 'Synthetic HTTP task',
          createdById: owner,
          dueDate: new Date(),
        },
      });
      taskId = task.id;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(3000, '0.0.0.0');
  });
  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it.skipIf(recovering)(
    'registers the canonical Python thread and reads real domain tasks without a model',
    async () => {
      if (app === undefined) {
        throw new Error('App not started');
      }
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const context = await request(server)
        .get('/api/v1/ticky/context')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(context.body.timezone).toBe('Europe/Madrid');
      expect(context.body.calendar).toBeNull();
      const newerContext = await request(server)
        .get('/api/v1/ticky/context')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      const previousRevision: unknown = context.body.source_revision;
      expect(typeof previousRevision).toBe('number');
      if (typeof previousRevision !== 'number') throw new Error('Missing context revision');
      expect(newerContext.body.source_revision).toBeGreaterThan(previousRevision);
      const capabilities = await request(server)
        .get('/api/v1/ticky/capabilities')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(capabilities.body.list_ids).toEqual([list]);
      const tasks = await request(server)
        .get('/api/v1/tasks')
        .query({ project_id: list, limit: 100, status: 'active' })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(tasks.body.items).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: taskId })]),
      );
      await request(server)
        .patch('/api/v1/ticky/authority')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({ action_scopes: ['tasks:create', 'ticky:routines:write'] })
        .expect(200);
      const opened = await request(server)
        .post('/api/v1/ticky/threads')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({})
        .expect(201);
      threadId = opened.body.id as string;
      const clientId = randomUUID();
      const admitted = await request(server)
        .post(`/api/v1/ticky/threads/${threadId}/messages`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({ client_message_id: clientId, text: 'Qué tengo hoy' })
        .expect(202);
      const replay = await request(server)
        .post(`/api/v1/ticky/threads/${threadId}/messages`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({ client_message_id: clientId, text: 'Qué tengo hoy' })
        .expect(202);
      expect(replay.body.run_id).toBe(admitted.body.run_id);
      const stream = await request(server)
        .get(`/api/v1/ticky/runs/${String(admitted.body.run_id)}/events`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(stream.text).toContain('run.completed');
      expect(stream.text).toContain(taskId);
      expect(stream.text).toContain('Synthetic HTTP task');
      expect(stream.text).toContain('"llm_calls":0');
      await request(server)
        .post('/api/v1/ticky/memories')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({ kind: 'help_style', value: 'breve', source_message_id: randomUUID() })
        .expect(403);
      const remembered = await request(server)
        .post('/api/v1/ticky/memories')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({ kind: 'help_style', value: 'breve', source_message_id: clientId })
        .expect(201);
      const memories = await request(server)
        .get('/api/v1/ticky/memories')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(memories.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            memory_id: remembered.body.id,
            kind: 'help_style',
            value: 'breve',
          }),
        ]),
      );
      await request(server)
        .delete(`/api/v1/ticky/memories/${String(remembered.body.id)}`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(204);
      const forgotten = await request(server)
        .get('/api/v1/ticky/memories')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(forgotten.body.items).toEqual([]);
      const routines = await request(server)
        .get('/api/v1/ticky/routines')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(routines.body.items).toEqual([]);
      const createdRoutine = await request(server)
        .post('/api/v1/ticky/routines')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({
          kind: 'daily_plan',
          timezone: 'Europe/Madrid',
          local_hour: '09:00',
          enabled: false,
          window_minutes: 15,
        })
        .expect(201);
      const routineId = createdRoutine.body.id as string;
      expect(createdRoutine.body.shadow).toBe(true);
      const updatedRoutine = await request(server)
        .put(`/api/v1/ticky/routines/${routineId}`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({
          kind: 'daily_plan',
          timezone: 'Europe/Madrid',
          local_hour: '09:15',
          enabled: true,
          window_minutes: 15,
          expected_version: 1,
        })
        .expect(200);
      expect(updatedRoutine.body.schedule_revision).toBe(2);
      await request(server)
        .put(`/api/v1/ticky/routines/${routineId}`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({
          kind: 'daily_plan',
          timezone: 'Europe/Madrid',
          local_hour: '09:30',
          enabled: true,
          window_minutes: 15,
          expected_version: 1,
        })
        .expect(409);
      const pausedRoutine = await request(server)
        .post(`/api/v1/ticky/routines/${routineId}/pause`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(pausedRoutine.body.enabled).toBe(false);
      const capture = await request(server)
        .post(`/api/v1/ticky/threads/${threadId}/messages`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({
          client_message_id: randomUUID(),
          text: 'Captura:\n- Synthetic approved capture\n- Synthetic unselected capture',
        })
        .expect(202);
      const captured = await request(server)
        .get(`/api/v1/ticky/runs/${String(capture.body.run_id)}/events`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      const completed = captured.text
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map(
          (line) =>
            JSON.parse(line.slice(5)) as { type: string; payload: { proposal?: ProposalBody } },
        )
        .find((event) => event.type === 'run.completed');
      const proposal = completed?.payload.proposal;
      if (proposal === undefined) throw new Error('Python did not prepare a capture proposal');
      expect(proposal.items).toHaveLength(2);
      expect(
        await prisma.task.count({
          where: { ownerId: owner, title: { startsWith: 'Synthetic approved' } },
        }),
      ).toBe(0);
      for (let replay = 0; replay < 2; replay += 1) {
        await request(server)
          .post('/api/v1/ticky/proposals')
          .set('X-Dev-User-Email', 'demo@reflexionia.test')
          .send({ document: JSON.stringify(proposal) })
          .expect(201);
      }
      const selected = proposal.items[0];
      if (selected === undefined) throw new Error('Missing capture item');
      for (let replay = 0; replay < 2; replay += 1) {
        await request(server)
          .post(`/api/v1/ticky/proposals/${proposal.proposal_id}/approve`)
          .set('X-Dev-User-Email', 'demo@reflexionia.test')
          .send({ digest: proposal.approval_digest, selected_actions: [selected.action_id] })
          .expect(200);
      }
      expect(
        await prisma.task.count({ where: { ownerId: owner, title: 'Synthetic approved capture' } }),
      ).toBe(1);
      expect(
        await prisma.task.count({
          where: { ownerId: owner, title: 'Synthetic unselected capture' },
        }),
      ).toBe(0);
      expect(
        await prisma.tickyActionLedger.count({
          where: { ownerId: owner, actionId: selected.action_id },
        }),
      ).toBe(1);
      const history = await request(server)
        .get(`/api/v1/ticky/threads/${threadId}/messages`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(JSON.stringify(history.body)).toContain(taskId);
      const deleted = await request(server)
        .delete(`/api/v1/ticky/threads/${threadId}`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(deleted.body.state).toBe('deleted');
      await request(server)
        .get(`/api/v1/ticky/threads/${threadId}/messages`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(404);
      const cached = await prisma.tickyClientMessage.findUniqueOrThrow({
        where: { ownerId_clientMessageId: { ownerId: owner, clientMessageId: clientId } },
      });
      expect(cached.response).toEqual({});
      if (process.env.TICKY_CROSS_BROWSER_WS !== undefined) {
        await promisify(execFile)(
          'pnpm',
          [
            '--filter',
            'web',
            'exec',
            'playwright',
            'test',
            '--config',
            'playwright.crossrepo.config.ts',
          ],
          { timeout: 120_000 },
        ).catch((error: unknown) => {
          if (
            error !== null &&
            typeof error === 'object' &&
            'stdout' in error &&
            typeof error.stdout === 'string'
          )
            throw new Error(error.stdout, { cause: error });
          throw error;
        });
      }
      await request(server)
        .patch('/api/v1/ticky/authority')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({ paused: true })
        .expect(200);
      await request(server)
        .get('/api/v1/ticky/capabilities')
        .set('Authorization', `Bearer ${token}`)
        .expect(503);
      await request(server)
        .post('/api/v1/ticky/threads')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({})
        .expect(403);
      writeFileSync(
        '/cross-proof/proof.json',
        JSON.stringify({
          actionId: selected.action_id,
          resourceId: selected.resource_id,
          threadId,
          clientId,
        }),
      );
    },
    150_000,
  );

  it.skipIf(!recovering)(
    'preserves ledger, revocation and erasure after restarting both services',
    async () => {
      if (app === undefined || cross === undefined) throw new Error('Cross services not started');
      const proof = JSON.parse(readFileSync('/cross-proof/proof.json', 'utf8')) as {
        actionId: string;
        resourceId: string;
        threadId: string;
        clientId: string;
      };
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const ledger = await request(server)
        .get(`/api/v1/ticky/actions/${proof.actionId}`)
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .expect(200);
      expect(ledger.body.status).toBe('applied');
      expect(await prisma.task.count({ where: { id: proof.resourceId, ownerId: owner } })).toBe(1);
      await request(server)
        .post('/api/v1/ticky/threads')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({})
        .expect(403);
      await request(server)
        .patch('/api/v1/ticky/authority')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({ paused: false })
        .expect(200);
      const authority = await prisma.tickyAuthority.findUniqueOrThrow({
        where: { ownerId: owner },
      });
      const jwt = signTickyJwt({
        audience: 'ticky-runs',
        subject: owner,
        authorityVersion: authority.version,
      });
      const replay = await fetch(new URL('/internal/v1/runs', cross), {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          thread_id: proof.threadId,
          client_message_id: proof.clientId,
          text: 'Qué tengo hoy',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      // Published erasure contract: admission rejects deleted threads with 403;
      // history uses 404. A fresh thread below proves this is not a stale pause.
      expect(replay.status).toBe(403);
      expect(await replay.json()).toEqual({ detail: 'Conversación no autorizada' });
      await request(server)
        .post('/api/v1/ticky/threads')
        .set('X-Dev-User-Email', 'demo@reflexionia.test')
        .send({})
        .expect(201);
      const history = await fetch(
        new URL(`/internal/v1/threads/${proof.threadId}/messages`, cross),
        {
          headers: { authorization: `Bearer ${jwt}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      expect(history.status).toBe(404);
      expect(
        await prisma.tickyActionLedger.count({
          where: { ownerId: owner, actionId: proof.actionId },
        }),
      ).toBe(1);
    },
  );
});
