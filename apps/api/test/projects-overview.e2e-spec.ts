import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';
process.env.SCHEDULER_AUTOSTART = 'false';
process.env.BUS_AUTOSTART = 'false';

const prisma = new PrismaClient();

describe('project overview, garden card and weekly review', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let ownerId: string;
  let fullToken: string;
  let tasksOnlyToken: string;

  beforeAll(async () => {
    await prisma.$connect();
    const owner = await prisma.user.create({
      data: {
        email: `overview-${randomUUID()}@reflexionia.test`,
        displayName: 'Proyectos',
        timeZone: 'Europe/Madrid',
      },
    });
    ownerId = owner.id;
    await prisma.project.create({ data: { ownerId, name: 'Bandeja', isInbox: true } });
    const full = newPersonalAccessToken();
    const tasksOnly = newPersonalAccessToken();
    fullToken = full.token;
    tasksOnlyToken = tasksOnly.token;
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: 'overview-full',
        tokenHash: full.hash,
        tokenPrefix: full.prefix,
        scopes: ['lists:read', 'lists:write', 'tasks:read', 'tasks:write'],
      },
    });
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: 'overview-tasks',
        tokenHash: tasksOnly.hash,
        tokenPrefix: tasksOnly.prefix,
        scopes: ['tasks:read'],
      },
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.idempotencyRecord.deleteMany({ where: { ownerId } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId } });
    await prisma.activityLog.deleteMany({ where: { ownerId } });
    await prisma.personalAccessToken.deleteMany({ where: { ownerId } });
    await prisma.task.updateMany({ where: { ownerId }, data: { parentId: null } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.column.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  function authed(token = fullToken) {
    const headers = { Authorization: `Bearer ${token}` };
    return {
      get: (url: string) => request(server).get(url).set(headers),
      post: (url: string) => request(server).post(url).set(headers),
    };
  }

  async function tool(name: string, args: Record<string, unknown> = {}) {
    const response = await request(server)
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${fullToken}`)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      .expect(200);
    const text = String(response.body.result.content[0].text);
    return {
      isError: response.body.result.isError === true,
      text,
      value:
        response.body.result.isError === true ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
  }

  it('orders the board, reviews projects, and keeps /projects/:id working', async () => {
    const api = authed();
    async function project(name: string) {
      const created = await api
        .post('/api/v1/projects')
        .send({
          name,
          is_project: true,
          outcome: name === 'alfa' ? 'Tener un siguiente paso' : null,
        })
        .expect(201);
      return String(created.body.id);
    }
    const alfa = await project('alfa');
    const beta = await project('beta');
    const gamma = await project('gamma');
    const delta = await project('delta');
    const epsilon = await project('epsilon');
    const zeta = await project('zeta');

    const overdue = await api
      .post('/api/v1/tasks')
      .send({
        project_id: alfa,
        title: 'Paso vencido',
        due_date: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        is_all_day: true,
      })
      .expect(201);
    await api
      .post('/api/v1/tasks')
      .send({
        project_id: alfa,
        parent_id: String(overdue.body.id),
        title: 'Subtarea más vencida',
        due_date: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        is_all_day: true,
      })
      .expect(201);
    await api
      .post('/api/v1/tasks')
      .send({
        project_id: alfa,
        title: 'Algún día',
        someday: true,
        due_date: new Date(Date.now() - 20 * 86_400_000).toISOString(),
        is_all_day: true,
      })
      .expect(201);
    const done = await api
      .post('/api/v1/tasks')
      .send({ project_id: alfa, title: 'Ya hecha' })
      .expect(201);
    await prisma.task.update({
      where: { id: String(done.body.id) },
      data: { status: 'completed', completedAt: new Date() },
    });
    await api
      .post('/api/v1/tasks')
      .send({
        project_id: beta,
        title: 'Paso futuro',
        due_date: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        is_all_day: true,
      })
      .expect(201);
    await prisma.$executeRawUnsafe(
      'UPDATE tasks SET updated_at = $1 WHERE project_id = $2::uuid',
      new Date(Date.now() - 20 * 86_400_000),
      beta,
    );

    await api.post(`/api/v1/projects/${delta}/state`).send({ state: 'paused' }).expect(200);
    await api.post(`/api/v1/projects/${epsilon}/state`).send({ state: 'archived' }).expect(200);
    await api.post(`/api/v1/projects/${zeta}/state`).send({ state: 'archived' }).expect(200);

    const overview = await api.get('/api/v1/projects/overview').expect(200);
    expect(overview.body.counts).toEqual({ active: 3, paused: 1, archived: 2 });
    const names = (overview.body.items as { name: string; state: string }[])
      .filter((item) => item.state === 'active')
      .map((item) => item.name);
    expect(names).toEqual(['alfa', 'beta', 'gamma']);
    const alfaItem = (overview.body.items as Record<string, unknown>[]).find(
      (item) => item.name === 'alfa',
    );
    expect(alfaItem).toMatchObject({
      done_count: 1,
      open_count: 2,
      total_count: 3,
      attention: null,
    });
    expect(alfaItem?.next_action).toMatchObject({ title: 'Paso vencido' });
    const betaItem = (overview.body.items as { name: string; attention: string }[]).find(
      (item) => item.name === 'beta',
    );
    const gammaItem = (
      overview.body.items as { name: string; attention: string; id: string }[]
    ).find((item) => item.name === 'gamma');
    expect(betaItem?.attention).toBe('stale');
    expect(gammaItem?.attention).toBe('no_next_action');
    const archived = (overview.body.items as { name: string; state: string }[])
      .filter((item) => item.state === 'archived')
      .map((item) => item.name);
    expect(archived).toEqual(['zeta', 'epsilon']);

    const paused = await api.get('/api/v1/projects/overview?state=paused').expect(200);
    expect(paused.body.items).toHaveLength(1);
    expect(paused.body.items[0].name).toBe('delta');
    expect(paused.body.counts).toEqual({ active: 3, paused: 1, archived: 2 });
    await api.get('/api/v1/projects/overview?state=nope').expect(400);

    const one = await api.get(`/api/v1/projects/${alfa}`).expect(200);
    expect(one.body.id).toBe(alfa);
    await api.get('/api/v1/projects/not-a-uuid').expect(400);

    const reviewed = await api.post(`/api/v1/projects/${gamma}/review`).expect(200);
    expect(reviewed.body.reviewed).toBe(1);
    const again = await api.post(`/api/v1/projects/${gamma}/review`).expect(200);
    expect(again.body.reviewed).toBe(1);
    const batch = await api
      .post('/api/v1/projects/review')
      .send({ ids: [alfa, beta] })
      .expect(200);
    expect(batch.body.reviewed).toBe(2);
    await api.post('/api/v1/projects/review').send({ ids: [] }).expect(400);
    await api.post(`/api/v1/projects/${randomUUID()}/review`).expect(404);
    const stored = await prisma.project.findUniqueOrThrow({ where: { id: gamma } });
    expect(stored.projectReviewedAt).not.toBeNull();

    const dashboard = await api.get('/api/v1/dashboard/data').expect(200);
    expect(dashboard.body.widgets.in_flight_projects.counts.active).toBe(3);
    expect(dashboard.body.widgets.in_flight_projects.items[0].name).toBe('alfa');
    expect(dashboard.body.widgets.in_flight_projects.items.length).toBeLessThanOrEqual(4);
    expect(dashboard.body.widgets.in_flight_projects.no_next_action_count).toBe(1);
    const hidden = await authed(tasksOnlyToken).get('/api/v1/dashboard/data').expect(200);
    expect(hidden.body.widgets.in_flight_projects).toBeNull();

    const weekly = await api.get('/api/v1/review/weekly').expect(200);
    expect(weekly.body.projects_scope).toBe('granted');
    expect(weekly.body.projects.ok.map((item: { name: string }) => item.name)).toContain('alfa');
    expect(weekly.body.projects.attention.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(['beta', 'gamma']),
    );
    expect(weekly.body.projects.paused.map((item: { name: string }) => item.name)).toEqual([
      'delta',
    ]);
    const weeklyHidden = await authed(tasksOnlyToken).get('/api/v1/review/weekly').expect(200);
    expect(weeklyHidden.body.projects).toBeNull();
    expect(weeklyHidden.body.projects_scope).toBe('missing');

    const fresh = await api.get('/api/v1/projects/overview').expect(200);
    const viaTool = await tool('list_project_overview');
    expect(viaTool.isError).toBe(false);
    expect(viaTool.value).toEqual(fresh.body);
    const marked = await tool('mark_project_reviewed', { ids: [delta] });
    expect(marked.isError).toBe(false);
    expect(marked.value).toEqual({ reviewed: 1 });
    await authed(tasksOnlyToken).get('/api/v1/projects/overview').expect(403);
  });
});
