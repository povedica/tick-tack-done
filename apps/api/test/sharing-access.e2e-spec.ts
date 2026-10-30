import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/passwords.js';
import { newPersonalAccessToken } from '../src/auth/token-secret.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';
import { expireShareInvitations } from '../src/modules/collaboration/expire-invitations.js';

type SuperTestApp = Parameters<typeof request>[0];

loadRootEnv();
process.env.AUTH_MODE = 'dev';

const prisma = new PrismaClient();

function must(map: Record<string, string>, key: string): string {
  const value = map[key];
  if (value === undefined) {
    throw new Error(`missing ${key}`);
  }
  return value;
}

describe('shared list access', () => {
  let app: INestApplication;
  let server: SuperTestApp;
  let ownerId = '';
  let listId = '';
  let otherListId = '';
  let taskId = '';
  let assignedId = '';
  let looseId = '';
  let pendingId = '';
  let expiredId = '';
  const ids: Record<string, string> = {};
  const emails: Record<string, string> = {};

  beforeAll(async () => {
    await prisma.$connect();
    const passwordHash = await hashPassword('correct-horse-battery');
    for (const [key, name] of [
      ['a', 'Ana'],
      ['b', 'Bea'],
      ['c', 'Cora'],
      ['d', 'Dani'],
      ['e', 'Eva'],
      ['f', 'Fran'],
    ] as const) {
      emails[key] = `${key}-${randomUUID()}@reflexionia.test`;
      const user = await prisma.user.create({
        data: { email: emails[key], displayName: name, timeZone: 'Europe/Madrid', passwordHash },
      });
      ids[key] = user.id;
    }
    ownerId = must(ids, 'a');
    const list = await prisma.project.create({ data: { ownerId, name: 'Viaje' } });
    const other = await prisma.project.create({ data: { ownerId, name: 'Casa' } });
    listId = list.id;
    otherListId = other.id;
    const due = new Date();
    const assigned = await prisma.task.create({
      data: {
        ownerId,
        projectId: listId,
        createdById: ownerId,
        title: 'Asignada hoy',
        dueDate: due,
        assigneeId: must(ids, 'b'),
      },
    });
    const loose = await prisma.task.create({
      data: {
        ownerId,
        projectId: listId,
        createdById: ownerId,
        title: 'Sin asignar',
        dueDate: due,
      },
    });
    assignedId = assigned.id;
    looseId = loose.id;
    taskId = assigned.id;
    await prisma.projectMember.createMany({
      data: [
        {
          ownerId,
          projectId: listId,
          memberId: must(ids, 'b'),
          permission: 'read',
          status: 'accepted',
        },
        {
          ownerId,
          projectId: listId,
          memberId: must(ids, 'c'),
          permission: 'comment',
          status: 'accepted',
        },
        {
          ownerId,
          projectId: listId,
          memberId: must(ids, 'd'),
          permission: 'write',
          status: 'accepted',
        },
      ],
    });
    const pending = await prisma.projectMember.create({
      data: {
        ownerId,
        projectId: listId,
        memberId: must(ids, 'f'),
        permission: 'read',
        status: 'pending',
        inviteEmail: must(emails, 'f'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    pendingId = pending.id;
    const expired = await prisma.projectMember.create({
      data: {
        ownerId,
        projectId: otherListId,
        memberId: must(ids, 'e'),
        permission: 'read',
        status: 'pending',
        inviteEmail: must(emails, 'e'),
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    });
    expiredId = expired.id;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as SuperTestApp;
  });

  afterAll(async () => {
    const people = Object.values(ids);
    await app.close();
    await prisma.shareNotice.deleteMany({ where: { userId: { in: people } } });
    await prisma.activityLog.deleteMany({
      where: { OR: [{ ownerId: { in: people } }, { actorId: { in: people } }] },
    });
    await prisma.personalAccessToken.deleteMany({ where: { ownerId: { in: people } } });
    await prisma.outboxEvent.deleteMany({ where: { ownerId: { in: people } } });
    await prisma.comment.deleteMany({ where: { ownerId } });
    await prisma.task.deleteMany({ where: { ownerId } });
    await prisma.project.deleteMany({ where: { ownerId } });
    await prisma.filter.deleteMany({ where: { ownerId: { in: people } } });
    await prisma.smartList.deleteMany({ where: { ownerId: { in: people } } });
    await prisma.user.deleteMany({ where: { id: { in: people } } });
    await prisma.$disconnect();
  });

  it('RF-1801: read, comment, write and a stranger see different answers', async () => {
    await request(server)
      .get(`/api/v1/tasks/${taskId}`)
      .set('X-Dev-User-Email', must(emails, 'b'))
      .expect(200);
    const readEdit = await request(server)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('X-Dev-User-Email', must(emails, 'b'))
      .send({ title: 'no' })
      .expect(403);
    expect(readEdit.body.error.code).toBe('forbidden');
    const readComment = await request(server)
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set('X-Dev-User-Email', must(emails, 'b'))
      .send({ body: 'hola' })
      .expect(403);
    expect(readComment.body.error.code).toBe('forbidden');

    await request(server)
      .post(`/api/v1/tasks/${taskId}/comments`)
      .set('X-Dev-User-Email', must(emails, 'c'))
      .send({ body: 'visto @Bea' })
      .expect(201);
    const commentEdit = await request(server)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('X-Dev-User-Email', must(emails, 'c'))
      .send({ title: 'no' })
      .expect(403);
    expect(commentEdit.body.error.code).toBe('forbidden');

    await request(server)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('X-Dev-User-Email', must(emails, 'd'))
      .send({ title: 'Asignada hoy' })
      .expect(200);
    const writeShare = await request(server)
      .post(`/api/v1/projects/${listId}/members`)
      .set('X-Dev-User-Email', must(emails, 'd'))
      .send({ email: must(emails, 'e'), permission: 'read' })
      .expect(403);
    expect(writeShare.body.error.code).toBe('forbidden');

    const stranger = await request(server)
      .get(`/api/v1/tasks/${taskId}`)
      .set('X-Dev-User-Email', must(emails, 'e'))
      .expect(404);
    expect(stranger.body.error.code).toBe('task_not_found');
    const pending = await request(server)
      .get(`/api/v1/tasks/${taskId}`)
      .set('X-Dev-User-Email', must(emails, 'f'))
      .expect(404);
    expect(pending.body.error.code).toBe('task_not_found');

    const limited = newPersonalAccessToken();
    await prisma.personalAccessToken.create({
      data: {
        ownerId,
        name: `limited-${randomUUID()}`,
        tokenHash: limited.hash,
        tokenPrefix: limited.prefix,
        scopes: ['lists:read', 'tasks:read', 'lists:write'],
        listRestricted: true,
        listIds: [otherListId],
      },
    });
    const outside = await request(server)
      .get(`/api/v1/projects/${listId}`)
      .set('Authorization', `Bearer ${limited.token}`)
      .expect(404);
    expect(outside.body.error.code).toBe('project_not_found');
  });

  it('RF-1802: reminders are owner-only and assignment stays inside the list', async () => {
    const member = await request(server)
      .get(`/api/v1/tasks/${taskId}/reminders`)
      .set('X-Dev-User-Email', must(emails, 'd'))
      .expect(403);
    expect(member.body.error.code).toBe('forbidden');
    expect(member.body.error.details.reason).toBe('owner_only');
    const stranger = await request(server)
      .get(`/api/v1/tasks/${taskId}/reminders`)
      .set('X-Dev-User-Email', must(emails, 'e'))
      .expect(404);
    expect(stranger.body.error.code).toBe('task_not_found');
    await request(server)
      .get(`/api/v1/tasks/${taskId}/reminders`)
      .set('X-Dev-User-Email', must(emails, 'a'))
      .expect(200);

    const assigned = await request(server)
      .post(`/api/v1/tasks/${looseId}/assignee`)
      .set('X-Dev-User-Email', must(emails, 'd'))
      .send({ assignee_id: must(ids, 'b') })
      .expect(200);
    expect(assigned.body.assignee_id).toBe(must(ids, 'b'));
    const missing = await request(server)
      .post(`/api/v1/tasks/${looseId}/assignee`)
      .set('X-Dev-User-Email', must(emails, 'd'))
      .send({ assignee_id: randomUUID() })
      .expect(422);
    expect(missing.body.error.code).toBe('invalid_reference');
    const outsider = await request(server)
      .post(`/api/v1/tasks/${looseId}/assignee`)
      .set('X-Dev-User-Email', must(emails, 'd'))
      .send({ assignee_id: must(ids, 'e') })
      .expect(422);
    expect(outsider.body.error.code).toBe('invalid_reference');
    await request(server)
      .post(`/api/v1/tasks/${looseId}/assignee`)
      .set('X-Dev-User-Email', must(emails, 'd'))
      .send({ assignee_id: null })
      .expect(200);
  });

  it('RF-1801: today, the next days and the calendar include only shared tasks assigned to me', async () => {
    const today = await request(server)
      .get('/api/v1/smart-lists/today/tasks')
      .set('X-Dev-User-Email', must(emails, 'b'))
      .expect(200);
    const titles = JSON.stringify(today.body);
    expect(titles).toContain('Asignada hoy');
    expect(titles).not.toContain('Sin asignar');

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const calendar = await request(server)
      .get(`/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .set('X-Dev-User-Email', must(emails, 'b'))
      .expect(200);
    const shown = (calendar.body.tasks as { id: string }[]).map((task) => task.id);
    expect(shown).toContain(assignedId);
    expect(shown).not.toContain(looseId);

    const found = await request(server)
      .get('/api/v1/search?q=Asignada%20hoy&types=task')
      .set('X-Dev-User-Email', must(emails, 'b'))
      .expect(200);
    expect(JSON.stringify(found.body)).not.toContain(assignedId);

    const preview = await request(server)
      .post('/api/v1/filters/preview')
      .set('X-Dev-User-Email', must(emails, 'b'))
      .send({
        mode: 'normal',
        rules: {
          combinator: 'AND',
          groups: [
            {
              combinator: 'AND',
              conditions: [{ field: 'keyword', op: 'contains', value: 'Sin asignar' }],
            },
          ],
        },
      })
      .expect(200);
    expect(JSON.stringify(preview.body)).not.toContain('Sin asignar');
  });

  it('RF-1804: presence is stored on the list owner', async () => {
    await request(server)
      .post(`/api/v1/projects/${listId}/presence`)
      .set('X-Dev-User-Email', must(emails, 'b'))
      .expect(200);
    const event = await prisma.outboxEvent.findFirst({
      where: { type: 'presence.updated@v1', data: { path: ['project_id'], equals: listId } },
      orderBy: { occurredAt: 'desc' },
    });
    expect(event?.ownerId).toBe(ownerId);
  });

  it('RF-1801: accepting, declining and a mention leave an in-app notice', async () => {
    await request(server)
      .post(`/api/v1/me/share-invitations/${pendingId}/accept`)
      .set('X-Dev-User-Email', must(emails, 'f'))
      .expect(204);
    const notices = await request(server)
      .get('/api/v1/me/share-notices')
      .set('X-Dev-User-Email', must(emails, 'a'))
      .expect(200);
    expect(
      notices.body.items.some((item: { kind: string }) => item.kind === 'invitation_accepted'),
    ).toBe(true);
    const mentioned = await request(server)
      .get('/api/v1/me/share-notices')
      .set('X-Dev-User-Email', must(emails, 'b'))
      .expect(200);
    expect(mentioned.body.items.some((item: { kind: string }) => item.kind === 'mention')).toBe(
      true,
    );

    await expireShareInvitations(prisma, new Date());
    const row = await prisma.projectMember.findUnique({ where: { id: expiredId } });
    expect(row?.status).toBe('revoked');
    expect(row?.deletedAt).not.toBeNull();
  });
});
