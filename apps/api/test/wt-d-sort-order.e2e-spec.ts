import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { harness, prisma } from './wt-d-harness.js';
describe('TTD-AUD-122 concurrent order', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });
  it('assigns ten distinct increasing orders on concurrent creates', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => h.create({ title: `Parallel ${i}` })),
    );
    expect(new Set(responses.map((row) => row.sort_order)).size).toBe(10);
    const rows = await prisma.task.findMany({
      where: { projectId: h.project.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(rows.map((row) => row.sortOrder)).toEqual(
      Array.from({ length: 10 }, (_, i) => BigInt((i + 1) * 65536)),
    );
  });
});
