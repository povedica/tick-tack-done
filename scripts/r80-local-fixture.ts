import { PrismaClient } from '../apps/api/node_modules/@prisma/client/index.js';
async function main(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.pathname !== '/ttd_r80' && url.pathname !== '/ttd_wt_f')
    throw new Error('Only the isolated ttd_r80 database is allowed');
  const db = new PrismaClient();
  try {
    const email = 'r80-live@example.test';
    const user = await db.user.upsert({
      where: { email },
      create: { email, displayName: 'R80 synthetic user', timeZone: 'Europe/Madrid' },
      update: {},
    });
    let project = await db.project.findFirst({ where: { ownerId: user.id, isInbox: true } });
    project ??= await db.project.create({
      data: { ownerId: user.id, isInbox: true, name: 'Bandeja' },
    });
    let task = await db.task.findFirst({
      where: { ownerId: user.id, title: 'R80 MCP focus task' },
    });
    task ??= await db.task.create({
      data: {
        ownerId: user.id,
        projectId: project.id,
        createdById: user.id,
        title: 'R80 MCP focus task',
      },
    });
    console.log(JSON.stringify({ id: user.id, email, projectId: project.id, taskId: task.id }));
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error('Local fixture setup failed');
  process.exitCode = 1;
});
