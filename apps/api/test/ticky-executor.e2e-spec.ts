import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { proposalDigest, type ProposalBody } from '@reflexionia/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

describe('APP-04: transactional Ticky authority and list grants', () => {
  const db = new PrismaClient();
  const owner = randomUUID();
  const granted = randomUUID();
  const excluded = randomUUID();
  const email = `ticky-executor-${owner}@reflexionia.test`;
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? '').hostname;
    if (!['postgres', 'localhost', '127.0.0.1'].includes(hostname))
      throw new Error('Isolated local database required');
    process.env.AUTH_MODE = 'dev';
    process.env.TICKY_EXECUTION_ENABLED = 'true';
    process.env.TICKY_KILL_SWITCH = 'false';
    process.env.TICKY_SERVICE_URL = '';
    await db.user.create({ data: { id: owner, email, displayName: 'Synthetic executor' } });
    await db.project.createMany({
      data: [granted, excluded].map((id) => ({ id, ownerId: owner, name: 'Synthetic' })),
    });
    await db.tickyAuthority.create({
      data: {
        ownerId: owner,
        autonomy: 2,
        actionScopes: ['tasks:create', 'tasks:update'],
        lists: { create: { listId: granted } },
      },
    });
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });
  beforeEach(async () => {
    await db.tickyAuthority.update({
      where: { ownerId: owner },
      data: { revoked: false, paused: false, autonomy: 2, version: 1 },
    });
  });
  afterAll(async () => {
    await app.close();
    await db.outboxEvent.deleteMany({ where: { ownerId: owner } });
    await db.activityLog.deleteMany({ where: { ownerId: owner } });
    await db.task.deleteMany({ where: { ownerId: owner } });
    await db.project.deleteMany({ where: { ownerId: owner } });
    await db.user.delete({ where: { id: owner } });
    await db.$disconnect();
  });

  async function proposal(
    listId = granted,
    item?: ProposalBody['items'][number],
  ): Promise<ProposalBody> {
    const body: ProposalBody = {
      proposal_id: randomUUID(),
      owner_id: owner,
      run_id: randomUUID(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      timezone: 'Europe/Madrid',
      authority_version: 1,
      items: [
        item ?? {
          action_id: randomUUID(),
          resource_id: randomUUID(),
          tool: 'tasks.create',
          expected_version: 0,
          before: {},
          after: { title: 'Synthetic authorized create', project_id: listId },
          reason_code: 'CAPTURE',
        },
      ],
    };
    const signed = { ...body, approval_digest: await proposalDigest(body) };
    await request(server)
      .post('/api/v1/ticky/proposals')
      .set('X-Dev-User-Email', email)
      .send({ document: JSON.stringify(signed) })
      .expect(201);
    return signed;
  }
  function approve(body: ProposalBody) {
    return request(server)
      .post(`/api/v1/ticky/proposals/${body.proposal_id}/approve`)
      .set('X-Dev-User-Email', email)
      .send({
        digest: body.approval_digest,
        selected_actions: body.items.map((item) => item.action_id),
      });
  }
  async function noEffect(body: ProposalBody) {
    const id = body.items[0]?.resource_id;
    if (id === undefined) throw new Error('Missing proposal resource');
    expect(await db.task.count({ where: { id } })).toBe(0);
    expect(
      await db.tickyActionLedger.count({ where: { ownerId: owner, proposalId: body.proposal_id } }),
    ).toBe(0);
    expect(await db.activityLog.count({ where: { ownerId: owner, entityId: id } })).toBe(0);
    expect(
      await db.outboxEvent.count({ where: { ownerId: owner, data: { path: ['id'], equals: id } } }),
    ).toBe(0);
  }

  it('rejects an owned but ungranted destination without task, ledger, audit or outbox', async () => {
    const body = await proposal(excluded);
    await approve(body).expect(403);
    await noEffect(body);
  });

  it('serializes concurrent approvals and commits exactly one effect, audit and outbox', async () => {
    const body = await proposal();
    const responses = await Promise.all([approve(body), approve(body)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const id = body.items[0]?.resource_id;
    if (id === undefined) throw new Error('Missing proposal resource');
    expect(await db.task.count({ where: { id } })).toBe(1);
    expect(
      await db.tickyActionLedger.count({ where: { ownerId: owner, proposalId: body.proposal_id } }),
    ).toBe(1);
    expect(await db.activityLog.count({ where: { ownerId: owner, entityId: id } })).toBe(1);
    expect(
      await db.outboxEvent.count({ where: { ownerId: owner, data: { path: ['id'], equals: id } } }),
    ).toBe(1);
  });

  it('rejects one of two concurrent updates against the same CAS version without partial audit', async () => {
    const task = await db.task.create({
      data: { ownerId: owner, projectId: granted, title: 'Synthetic before', createdById: owner },
    });
    const update = (title: string): ProposalBody['items'][number] => ({
      action_id: randomUUID(),
      resource_id: task.id,
      tool: 'tasks.update',
      expected_version: task.version,
      before: { title: task.title },
      after: { title },
      reason_code: 'USER_REQUEST',
    });
    const first = await proposal(granted, update('Synthetic first'));
    const second = await proposal(granted, update('Synthetic second'));
    const responses = await Promise.all([approve(first), approve(second)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const saved = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(saved.version).toBe(task.version + 1);
    expect(['Synthetic first', 'Synthetic second']).toContain(saved.title);
    expect(
      await db.tickyActionLedger.count({
        where: { ownerId: owner, proposalId: { in: [first.proposal_id, second.proposal_id] } },
      }),
    ).toBe(1);
    expect(await db.activityLog.count({ where: { ownerId: owner, entityId: task.id } })).toBe(1);
    expect(
      await db.outboxEvent.count({
        where: { ownerId: owner, data: { path: ['id'], equals: task.id } },
      }),
    ).toBe(1);
  });

  it('revalidates authority after waiting for a concurrent revocation transaction', async () => {
    const body = await proposal();
    let release: () => void = () => {
      throw new Error('Revocation barrier not initialized');
    };
    let acquired: (pid: number) => void = () => {
      throw new Error('Lock barrier not initialized');
    };
    const ready = new Promise<number>((resolve) => {
      acquired = resolve;
    });
    const continueRevoke = new Promise<void>((resolve) => {
      release = resolve;
    });
    const revoking = db.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM ticky_authorities WHERE owner_id = ${owner}::uuid FOR UPDATE`,
        );
        const rows = await tx.$queryRaw<{ pid: number }[]>(
          Prisma.sql`SELECT pg_backend_pid() AS pid`,
        );
        acquired(rows[0]?.pid ?? 0);
        await continueRevoke;
        await tx.tickyAuthority.update({
          where: { ownerId: owner },
          data: { revoked: true, version: { increment: 1 } },
        });
      },
      { timeout: 10_000 },
    );
    const pid = await ready;
    const applying = approve(body).then((response) => response);
    let blocked = false;
    try {
      for (let attempt = 0; attempt < 100 && !blocked; attempt += 1) {
        const rows = await db.$queryRaw<{ blocked: boolean }[]>(
          Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`,
        );
        blocked = rows[0]?.blocked === true;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
    } finally {
      release();
    }
    await revoking;
    expect((await applying).status).toBe(409);
    await noEffect(body);
  });
});
