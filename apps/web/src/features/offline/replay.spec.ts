import { describe, expect, it } from 'vitest';
import { memoryStore, replayQueue, type MutationWriter, type PendingMutation } from './replay';

function mutation(
  partial: Pick<PendingMutation, 'kind' | 'localId' | 'createdAt'> & { id?: string },
): PendingMutation {
  return {
    id: partial.id ?? partial.localId,
    idempotencyKey: `key-${partial.localId}`,
    kind: partial.kind,
    localId: partial.localId,
    body: partial.kind === 'create' ? { raw_text: 'leche' } : { title: 'leche fría' },
    createdAt: partial.createdAt,
  };
}

describe('offline replay', () => {
  it('RF-13010: replays create, edit and complete in order and a second pass does not duplicate', async () => {
    const calls: string[] = [];
    const writer: MutationWriter = {
      createTask(_body, key) {
        calls.push(`create:${key}`);
        return Promise.resolve({ id: 'server-1' });
      },
      updateTask(id) {
        calls.push(`update:${id}`);
        return Promise.resolve({});
      },
      completeTask(id, _body, key) {
        calls.push(`complete:${id}:${key}`);
        return Promise.resolve({});
      },
    };
    const store = memoryStore([
      mutation({ kind: 'complete', localId: 'local-1', createdAt: '2026-10-18T10:02:00.000Z' }),
      mutation({ kind: 'create', localId: 'local-1', createdAt: '2026-10-18T10:00:00.000Z' }),
      mutation({ kind: 'update', localId: 'local-1', createdAt: '2026-10-18T10:01:00.000Z' }),
    ]);
    const first = await replayQueue(store, writer);
    expect(first).toEqual({ applied: 3, stopped: false });
    expect(calls).toEqual([
      'create:key-local-1',
      'update:server-1',
      'complete:server-1:key-local-1',
    ]);
    const second = await replayQueue(store, writer);
    expect(second).toEqual({ applied: 0, stopped: false });
    expect(calls).toHaveLength(3);
  });

  it('RF-13010: stops on a network failure and keeps the mutation', async () => {
    const store = memoryStore([
      mutation({ kind: 'create', localId: 'local-2', createdAt: '2026-10-18T10:00:00.000Z' }),
    ]);
    const writer: MutationWriter = {
      createTask() {
        return Promise.reject(new TypeError('offline'));
      },
      updateTask() {
        return Promise.resolve({});
      },
      completeTask() {
        return Promise.resolve({});
      },
    };
    const result = await replayQueue(store, writer);
    expect(result).toEqual({ applied: 0, stopped: true });
    expect(await store.list()).toHaveLength(1);
  });
});
