import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
interface SyntheticTask {
  id: string;
  sort_order: string;
  due_date: string;
  link_count: number;
  series_id: string;
  decisions: unknown[];
  discarded: boolean;
  byte_size: number;
  activity: { type: string; source: string }[];
}
interface ToolResult {
  isError: boolean;
  data: { status: number };
  content: { text: string }[];
}
export const prisma = new PrismaClient();
async function removeOwner(id: string): Promise<void> {
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: id } });
  await prisma.outboxEvent.deleteMany({ where: { ownerId: id } });
  await prisma.activityLog.deleteMany({ where: { ownerId: id } });
  await prisma.attachment.deleteMany({ where: { ownerId: id } });
  await prisma.checklistItem.deleteMany({ where: { ownerId: id } });
  await prisma.task.updateMany({
    where: { ownerId: id },
    data: { parentId: null, columnId: null },
  });
  await prisma.taskTag.deleteMany({ where: { task: { ownerId: id } } });
  await prisma.personalAccessToken.deleteMany({ where: { ownerId: id } });
  await prisma.planDecision.deleteMany({ where: { session: { ownerId: id } } });
  await prisma.planSession.deleteMany({ where: { ownerId: id } });
  await prisma.dayPlan.deleteMany({ where: { ownerId: id } });
  await prisma.task.deleteMany({ where: { ownerId: id } });
  await prisma.column.deleteMany({ where: { ownerId: id } });
  await prisma.project.deleteMany({ where: { ownerId: id } });
  await prisma.folder.deleteMany({ where: { ownerId: id } });
  await prisma.tag.deleteMany({ where: { ownerId: id } });
  await prisma.user.delete({ where: { id } });
}

export async function harness() {
  process.env.AUTH_MODE = 'dev';
  const user = await prisma.user.create({
    data: {
      email: `wt-d-${randomUUID()}@reflexionia.test`,
      displayName: 'D synthetic',
      timeZone: 'Europe/Madrid',
    },
  });
  const project = await prisma.project.create({
    data: { ownerId: user.id, name: 'D', isInbox: true },
  });
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const previousPort = process.env.PORT;
  process.env.PORT = String((app.getHttpServer().address() as AddressInfo).port);
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  const headers = { 'X-Dev-User-Email': user.email };
  const api = {
    get: (url: string) => request(server).get(url).set(headers),
    post: (url: string) => request(server).post(url).set(headers),
    patch: (url: string) => request(server).patch(url).set(headers),
    delete: (url: string) => request(server).delete(url).set(headers),
  };
  const create = async (data: Record<string, unknown> = {}) =>
    (
      await api
        .post('/api/v1/tasks')
        .send({ project_id: project.id, title: 'D synthetic', ...data })
        .expect(201)
    ).body as SyntheticTask;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const response = await api
      .post('/api/v1/mcp')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      .expect(200);
    const result = response.body.result as ToolResult;
    return {
      ...result,
      value: (result.isError
        ? result.content[0]?.text
        : JSON.parse(result.content[0]?.text ?? '{}')) as SyntheticTask,
    };
  };
  return {
    app,
    server,
    api,
    call,
    create,
    user,
    project,
    close: async () => {
      await app.close();
      if (previousPort === undefined) delete process.env.PORT;
      else process.env.PORT = previousPort;
      await removeOwner(user.id);
      await prisma.$disconnect();
    },
  };
}
