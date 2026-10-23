import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { statSync, unlinkSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { afterAll, expect, it } from 'vitest';
import { loadRootEnv } from '../src/load-env.js';
loadRootEnv();
const db = new PrismaClient();
const backups: string[] = [];
afterAll(() => db.$disconnect());
const run = (script: string, args: string[]) =>
  JSON.parse(
    execFileSync('pnpm', ['exec', 'tsx', `../../scripts/${script}.ts`, ...args], {
      encoding: 'utf8',
      env: process.env,
    })
      .trim()
      .split('\n')
      .find((line) => line.startsWith('{')) ?? '{}',
  ) as { count: number };
it('TTD-AUD-81/85: actual scripts dry-run, backup, apply and second apply are idempotent on synthetic data', async () => {
  if (
    !(() => {
      const url = new URL(process.env.DATABASE_URL ?? '');
      return (
        url.pathname === '/ttd_r80' ||
        (process.env.CI === 'true' &&
          url.pathname === '/reflexionia_test' &&
          ['localhost', '127.0.0.1'].includes(url.hostname))
      );
    })()
  )
    throw new Error('Only isolated synthetic database is allowed');
  const owner = await db.user.create({
    data: { displayName: 'Synthetic', email: `maintenance-${randomUUID()}@example.test` },
  });
  const other = await db.user.create({
    data: { displayName: 'Synthetic', email: `maintenance-other-${randomUUID()}@example.test` },
  });
  try {
    const project = await db.project.create({ data: { ownerId: owner.id, name: 'Synthetic' } });
    const otherProject = await db.project.create({
      data: { ownerId: other.id, name: 'Synthetic' },
    });
    const series = randomUUID();
    const task = await db.task.create({
      data: {
        ownerId: owner.id,
        createdById: owner.id,
        projectId: project.id,
        title: 'Synthetic orphan',
        seriesId: series,
        recurrenceOpen: true,
        isAllDay: true,
        timeZone: 'Europe/Madrid',
        dueDate: new Date('2026-10-22T00:00:00Z'),
      },
    });
    const foreign = await db.task.create({
      data: {
        ownerId: other.id,
        createdById: other.id,
        projectId: otherProject.id,
        title: 'Foreign series',
        recurrenceOpen: false,
      },
    });
    const advance = await db.seriesAdvance.create({
      data: {
        ownerId: other.id,
        seriesId: series,
        sourceTaskId: foreign.id,
        repeatRule: 'FREQ=DAILY',
        repeatFrom: 'due_date',
        timeZone: 'Europe/Madrid',
        isAllDay: true,
      },
    });
    const preview = run('close-orphan-series', ['--dry-run']);
    expect(preview.count).toBeGreaterThanOrEqual(1);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).recurrenceOpen).toBe(true);
    for (const script of ['close-orphan-series', 'repair-allday-utc']) {
      const backup = `/tmp/r80-synthetic-${randomUUID()}.dump`;
      backups.push(backup);
      run(script, ['--apply', '--backup', backup]);
      expect(statSync(backup).size).toBeGreaterThan(0);
      expect(statSync(backup).mode & 0o777).toBe(0o600);
    }
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).recurrenceOpen).toBe(
      false,
    );
    expect(
      (await db.seriesAdvance.findUniqueOrThrow({ where: { id: advance.id } })).processedAt,
    ).toBeNull();
    expect(
      await db.outboxEvent.count({ where: { ownerId: owner.id, type: 'series.closed@v1' } }),
    ).toBe(1);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } })).dueDate?.toISOString(),
    ).toBe('2026-10-21T22:00:00.000Z');
    expect(run('close-orphan-series', ['--dry-run']).count).toBe(0);
    expect(run('repair-allday-utc', ['--dry-run']).count).toBe(0);
    const second = `/tmp/r80-synthetic-${randomUUID()}.dump`;
    backups.push(second);
    run('close-orphan-series', ['--apply', '--backup', second]);
    expect(
      await db.outboxEvent.count({ where: { ownerId: owner.id, type: 'series.closed@v1' } }),
    ).toBe(1);
  } finally {
    for (const id of [owner.id, other.id]) {
      await db.seriesAdvance.deleteMany({ where: { ownerId: id } });
      await db.outboxEvent.deleteMany({ where: { ownerId: id } });
      await db.activityLog.deleteMany({ where: { ownerId: id } });
      await db.task.deleteMany({ where: { ownerId: id } });
      await db.project.deleteMany({ where: { ownerId: id } });
      await db.user.delete({ where: { id } });
    }
    for (const backup of backups) unlinkSync(backup);
  }
}, 60000);
