import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SchedulerService } from '../src/scheduler/scheduler.service.js';
import { harness, prisma } from './wt-d-harness.js';
describe('TTD-AUD-116 request source', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });
  it('records MCP link operations and updates without inheriting task capture source', async () => {
    const task = await h.create();
    await prisma.task.update({ where: { id: task.id }, data: { source: 'automation' } });
    const link = await h.call('add_task_link', {
      task_id: task.id,
      url: 'https://example.com',
      title: 'Synthetic',
    });
    expect(link.isError).toBe(false);
    await h.call('remove_task_link', { task_id: task.id, link_id: link.value.id });
    await h.call('update_task', { id: task.id, title: 'MCP changed' });
    const detail = await h.call('get_task', { id: task.id });
    expect(
      detail.value.activity.slice(0, 3).map((entry: { source: string }) => entry.source),
    ).toEqual(['mcp', 'mcp', 'mcp']);
  });
  it('ignores spoofed MCP headers on personal-token REST requests even over loopback', async () => {
    const token = await h.api
      .post('/api/v1/me/tokens')
      .send({ name: 'D synthetic', scopes: ['tasks:read', 'tasks:write'] })
      .expect(201);
    const task = await h.create();
    await request(h.server)
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token.body.token}`)
      .set('X-TTD-Source', 'mcp')
      .send({ title: 'Spoof attempt' })
      .expect(200);
    const event = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: task.id, tokenId: token.body.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(event.changes)).toContain('"source":"api"');
  });
  it('attributes the detached parent rule update to MCP', async () => {
    const created = await h.call('create_task', {
      title: 'D detach',
      project_id: h.project.id,
      due_date: '2030-02-01',
      recurrence: { freq: 'daily' },
    });
    const detached = await h.call('detach_occurrence', {
      id: created.value.id,
      due_date: created.value.due_date,
      title: 'Detached',
    });
    expect(detached.isError).toBe(false);
    const parent = await h.call('get_task', { id: created.value.id });
    expect(parent.value.activity[0]?.source).toBe('mcp');
  });
  it('keeps cron-created occurrences attributed to automation', async () => {
    const task = await h.create({
      title: 'D cron source',
      due_date: '2020-01-01',
      repeat_rule: 'RRULE:FREQ=DAILY',
    });
    await h.api.post(`/api/v1/tasks/${task.id}/complete`).send({}).expect(200);
    await h.app.get(SchedulerService).run(new Date(), false);
    const next = await prisma.task.findFirstOrThrow({
      where: { ownerId: h.user.id, title: 'D cron source', status: 'active' },
    });
    const detail = await h.call('get_task', { id: next.id });
    expect(detail.value.activity[0]?.source).toBe('automation');
  });
  it('attributes immediately materialized successors to MCP', async () => {
    const created = await h.call('create_task', {
      title: 'D recurring',
      project_id: h.project.id,
      due_date: '2030-01-01',
      recurrence: { freq: 'daily' },
    });
    const completed = await h.call('complete_task', {
      id: created.value.id,
      materialize_next: true,
    });
    expect(completed.isError).toBe(false);
    const next = await prisma.task.findFirstOrThrow({
      where: { seriesId: created.value.series_id, status: 'active' },
    });
    expect(next.source).toBe('mcp');
  });
});
