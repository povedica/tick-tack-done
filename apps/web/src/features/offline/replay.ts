export interface PendingMutation {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly kind: 'create' | 'update' | 'complete';
  readonly localId: string;
  readonly body: Record<string, unknown>;
  readonly createdAt: string;
}

export interface MutationStore {
  list(): Promise<readonly PendingMutation[]>;
  put(item: PendingMutation): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface MutationWriter {
  createTask(body: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }>;
  updateTask(id: string, body: Record<string, unknown>): Promise<unknown>;
  completeTask(id: string, body: Record<string, unknown>, idempotencyKey: string): Promise<unknown>;
}

export interface ReplayResult {
  readonly applied: number;
  readonly stopped: boolean;
}

/** RF-13010. Replays the local queue in order. A repeated Idempotency-Key does not duplicate. */
export async function replayQueue(
  store: MutationStore,
  writer: MutationWriter,
): Promise<ReplayResult> {
  const pending = [...(await store.list())].sort((left, right) => {
    const byTime = left.createdAt.localeCompare(right.createdAt);
    return byTime === 0 ? left.id.localeCompare(right.id) : byTime;
  });
  const ids = new Map<string, string>();
  let applied = 0;
  for (const item of pending) {
    const taskId = ids.get(item.localId) ?? item.localId;
    try {
      if (item.kind === 'create') {
        const created = await writer.createTask(item.body, item.idempotencyKey);
        ids.set(item.localId, created.id);
      } else if (item.kind === 'update') {
        await writer.updateTask(taskId, item.body);
      } else {
        await writer.completeTask(taskId, item.body, item.idempotencyKey);
      }
      await store.remove(item.id);
      applied += 1;
    } catch (error) {
      if (isSettled(error)) {
        await store.remove(item.id);
        applied += 1;
        continue;
      }
      return { applied, stopped: true };
    }
  }
  return { applied, stopped: false };
}

export function memoryStore(seed: readonly PendingMutation[] = []): MutationStore {
  const items = [...seed];
  return {
    list() {
      return Promise.resolve([...items]);
    },
    put(item) {
      const index = items.findIndex((current) => current.id === item.id);
      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }
      return Promise.resolve();
    },
    remove(id) {
      const index = items.findIndex((current) => current.id === id);
      if (index >= 0) {
        items.splice(index, 1);
      }
      return Promise.resolve();
    },
  };
}

function isSettled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }
  const status = error.status;
  return status === 404 || status === 409;
}
