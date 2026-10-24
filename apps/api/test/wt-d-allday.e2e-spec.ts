import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { harness, prisma } from './wt-d-harness.js';
describe('TTD-AUD-123 all-day writes', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });
  it('dry-run reports a synthetic non-midnight all-day row without updating it', async () => {
    const row = await prisma.task.create({
      data: {
        ownerId: h.user.id,
        projectId: h.project.id,
        createdById: h.user.id,
        title: 'Synthetic all-day anomaly',
        isAllDay: true,
        dueDate: new Date('2026-10-19T13:35:00Z'),
        timeZone: 'Europe/Madrid',
      },
    });
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', '../../scripts/repair-allday-utc.ts', '--dry-run'],
      { encoding: 'utf8', env: process.env },
    );
    const report = JSON.parse(output);
    expect(report.dry_run).toBe(true);
    expect(report.changes).toContainEqual(
      expect.objectContaining({ id: row.id, proposed_due: '2026-10-18T22:00:00.000Z' }),
    );
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: row.id } })).dueDate?.toISOString(),
    ).toBe('2026-10-19T13:35:00.000Z');
    console.log('D123 synthetic dry-run', output.trim());
  }, 30000);
  it('normalizes create/update dates to capture-zone midnight', async () => {
    const task = await h.create({
      is_all_day: true,
      due_date: '2026-10-19T15:35:00+02:00',
      time_zone: 'Europe/Madrid',
    });
    expect(task.due_date).toBe('2026-10-18T22:00:00.000Z');
    const changed = await h.api
      .patch(`/api/v1/tasks/${task.id}`)
      .send({
        is_all_day: true,
        due_date: '2026-10-20T15:35:00+02:00',
        start_date: '2026-10-20T12:00:00+02:00',
      })
      .expect(200);
    expect(changed.body.due_date).toBe('2026-10-19T22:00:00.000Z');
    expect(changed.body.start_date).toBe('2026-10-19T22:00:00.000Z');
  });
});
