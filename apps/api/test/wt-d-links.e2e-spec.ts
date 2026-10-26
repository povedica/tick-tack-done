import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { harness } from './wt-d-harness.js';
describe('TTD-AUD-112 RF-201 link counts', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });
  it('counts extracted URLs in create and keeps counts consistent after manual links', async () => {
    const extracted = await h.create({ content: 'https://example.com/a https://example.com/b' });
    expect(extracted.link_count).toBe(2);
    const task = await h.create();
    const links = [];
    for (const url of ['https://example.com/a', 'https://example.com/b'])
      links.push(
        (
          await h.api
            .post(`/api/v1/tasks/${task.id}/links`)
            .send({ url, title: 'Synthetic' })
            .expect(201)
        ).body,
      );
    const assertCount = async (count: number) => {
      expect((await h.api.get(`/api/v1/tasks/${task.id}`).expect(200)).body.link_count).toBe(count);
      expect(
        (
          await h.api
            .patch(`/api/v1/tasks/${task.id}`)
            .send({ title: `D ${count}` })
            .expect(200)
        ).body.link_count,
      ).toBe(count);
      expect(
        (await h.api.get(`/api/v1/tasks?project_id=${h.project.id}`).expect(200)).body.items.find(
          (row: { id: string }) => row.id === task.id,
        ).link_count,
      ).toBe(count);
    };
    await assertCount(2);
    await h.api.delete(`/api/v1/tasks/${task.id}/links/${links[0].id}`).expect(204);
    await assertCount(1);
  });
});
