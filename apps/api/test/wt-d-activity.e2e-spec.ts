import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { harness } from './wt-d-harness.js';
describe('TTD-AUD-117 current mutation activity', () => {
  let h: Awaited<ReturnType<typeof harness>>;
  beforeAll(async () => {
    h = await harness();
  });
  afterAll(async () => {
    await h.close();
  });
  it.each(['rest', 'mcp'] as const)('returns each latest event through %s', async (transport) => {
    const task = await h.create();
    const invoke = async (
      tool: string,
      path: string,
      args: Record<string, unknown>,
      expected: string,
      patch = false,
    ) => {
      const body =
        transport === 'mcp'
          ? (await h.call(tool, { id: task.id, ...args })).value
          : (await (patch ? h.api.patch(path) : h.api.post(path)).send(args).expect(200)).body;
      expect(body.activity[0].type).toBe(expected);
    };
    await invoke('complete_task', `/api/v1/tasks/${task.id}/complete`, {}, 'task.completed');
    await invoke('reopen_task', `/api/v1/tasks/${task.id}/uncomplete`, {}, 'task.reopened');
    await invoke('cancel_task', `/api/v1/tasks/${task.id}/cancel`, {}, 'task.cancelled');
    await invoke('reopen_task', `/api/v1/tasks/${task.id}/uncomplete`, {}, 'task.reopened');
    await invoke(
      'update_task',
      `/api/v1/tasks/${task.id}`,
      { title: 'Changed' },
      'task.updated',
      true,
    );
    await invoke(
      'move_task',
      `/api/v1/tasks/${task.id}/move`,
      { project_id: h.project.id },
      'task.moved',
    );
    await h.api.delete(`/api/v1/tasks/${task.id}`).expect(204);
    await invoke('restore_task', `/api/v1/tasks/trash/${task.id}/restore`, {}, 'task.restored');
  });
});
