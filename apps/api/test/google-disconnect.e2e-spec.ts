import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { loadRootEnv } from '../src/load-env.js';

loadRootEnv();
process.env.AUTH_MODE = 'dev';
const prisma = new PrismaClient();
let app: INestApplication | undefined;
let ownerId: string;
let otherId: string;
let email: string;
let taskId: string;
let attachmentId: string;
const revoke = vi.fn();
beforeAll(async () => {
  const owner = await prisma.user.create({
    data: {
      email: `r80-disconnect-${randomUUID()}@example.test`,
      displayName:'Synthetic owner',
      googleRefreshToken: 'synthetic-owner-refresh',
      googleStatus: 'connected',
    },
  });
  const other = await prisma.user.create({
    data: {
      email: `r80-other-${randomUUID()}@example.test`,
      displayName:'Synthetic other',
      googleRefreshToken: 'synthetic-other-refresh',
    },
  });
  ownerId = owner.id;
  otherId = other.id;
  email = owner.email;
  for (const id of [ownerId, otherId])
    for (const provider of ['google', 'ical']) {
      const subscription = await prisma.calendarSubscription.create({
        data: {
          ownerId: id,
          provider,
          calendarId: provider === 'google' ? 'synthetic-calendar' : null,
        },
      });
      await prisma.externalEvent.create({
        data: {
          ownerId: id,
          subscriptionId: subscription.id,
          externalUid: randomUUID(),
          title: 'Synthetic imported event',
          startsAt: new Date('2026-10-22T10:00:00Z'),
        },
      });
    }
  const project = await prisma.project.create({ data: { ownerId, name: 'Synthetic' } });
  const task = await prisma.task.create({
    data: { ownerId, projectId: project.id, createdById: ownerId, title: 'Synthetic attachment' },
  });
  taskId = task.id;
  const attachment = await prisma.attachment.create({
    data: {
      ownerId,
      taskId,
      uploadedById: ownerId,
      fileName: 'test.txt',
      mimeType: 'text/plain',
      byteSize: 12,
      driveFileId: 'synthetic-file',
      webViewLink: 'https://drive.google.com/file/d/synthetic-file/view',
      source: 'picker',
    },
  });
  attachmentId = attachment.id;
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configureApp(app);
  await app.init();
  revoke.mockImplementation(() => Promise.resolve(new Response('', { status: 200 })));
  vi.stubGlobal('fetch', revoke);
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await app?.close();
  const ownerFilter = { in: [ownerId, otherId].filter((id) => typeof id === 'string') };
  await prisma.activityLog.deleteMany({ where: { ownerId: ownerFilter } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: ownerFilter } });
  await prisma.attachment.deleteMany({ where: { ownerId: ownerFilter } });
  await prisma.task.deleteMany({ where: { ownerId: ownerFilter } });
  await prisma.project.deleteMany({ where: { ownerId: ownerFilter } });
  await prisma.externalEvent.deleteMany({ where: { ownerId: ownerFilter } });
  await prisma.calendarSubscription.deleteMany({ where: { ownerId: ownerFilter } });
  await prisma.user.deleteMany({ where: { id: ownerFilter } });
  await prisma.$disconnect();
});
function api() {
  if(!app) throw new Error('Synthetic app was not initialized');
  return request(app.getHttpServer() as Parameters<typeof request>[0]);
}
it('TTD-AUD-97: default disconnect keeps imported events and Drive links, revokes only its owner', async () => {
  await api().delete('/api/v1/integrations/google').set('X-Dev-User-Email', email).expect(204);
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).googleRefreshToken,
  ).toBeNull();
  expect((await prisma.user.findUniqueOrThrow({ where: { id: otherId } })).googleRefreshToken).toBe(
    'synthetic-other-refresh',
  );
  expect(await prisma.externalEvent.count({ where: { ownerId, deletedAt: null } })).toBe(2);
  await api()
    .get(`/api/v1/tasks/${taskId}/attachments/${attachmentId}`)
    .set('X-Dev-User-Email', email)
    .expect(302)
    .expect('Location', 'https://drive.google.com/file/d/synthetic-file/view');
  expect(revoke).toHaveBeenCalledTimes(1);
});
it('TTD-AUD-97: explicit event removal is owner/provider-scoped and invalid booleans fail before revocation', async () => {
  await prisma.user.update({
    where: { id: ownerId },
    data: { googleRefreshToken: 'synthetic-owner-refresh-2' },
  });
  await api()
    .delete('/api/v1/integrations/google?remove_imported_events=invalid')
    .set('X-Dev-User-Email', email)
    .expect(400);
  expect(revoke).toHaveBeenCalledTimes(1);
  await api()
    .delete('/api/v1/integrations/google?remove_imported_events=true')
    .set('X-Dev-User-Email', email)
    .expect(204);
  expect(
    await prisma.externalEvent.count({
      where: { ownerId, deletedAt: null, subscription: { provider: 'google' } },
    }),
  ).toBe(0);
  expect(
    await prisma.externalEvent.count({
      where: { ownerId, deletedAt: null, subscription: { provider: 'ical' } },
    }),
  ).toBe(1);
  expect(await prisma.externalEvent.count({ where: { ownerId: otherId, deletedAt: null } })).toBe(
    2,
  );
  expect(await prisma.attachment.count({ where: { ownerId, deletedAt: null } })).toBe(1);
  expect(revoke).toHaveBeenCalledTimes(2);
});
