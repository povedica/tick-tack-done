import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { harness, prisma } from './wt-d-harness.js';
describe('TTD-AUD-113 replan', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });
  it('rejects future dates without creating a session', async () => {
    const before = await prisma.planSession.count({ where: { ownerId: h.user.id } });
    const response = await h.call('replan_day', { date: '2999-01-01' });
    expect(response.isError).toBe(true);
    expect(response.data.status).toBe(400);
    expect(await prisma.planSession.count({ where: { ownerId: h.user.id } })).toBe(before);
  });
  it('includes only overdue tasks and discards without changing tasks', async () => {
    for (const due_date of ['2020-01-01', '2020-01-02', '2999-01-01']) await h.create({ due_date });
    const response = await h.call('replan_day');
    expect(response.isError).toBe(false);
    expect(response.value.decisions).toHaveLength(2);
    const discarded = await h.call('discard_replan', { session_id: response.value.id });
    expect(discarded.isError).toBe(false);
    expect(discarded.value.discarded).toBe(true);
  });
});
