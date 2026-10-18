import {
  ApiError,
  type CompleteTaskBody,
  type CreateTaskBody,
  type UpdateTaskBody,
} from '@reflexionia/sdk';
import { tasksApi } from '../today/api';
import { replayQueue, type PendingMutation } from './replay';
import { offlineStore } from './store';

export function newMutation(
  kind: PendingMutation['kind'],
  localId: string,
  body: Record<string, unknown>,
): PendingMutation {
  return {
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    kind,
    localId,
    body,
    createdAt: new Date().toISOString(),
  };
}

export async function runOrQueue<T>(
  mutation: PendingMutation,
  run: (idempotencyKey: string) => Promise<T>,
): Promise<{ queued: boolean; result: T | null }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await offlineStore.put(mutation);
    return { queued: true, result: null };
  }
  try {
    const result = await run(mutation.idempotencyKey);
    return { queued: false, result };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    await offlineStore.put(mutation);
    return { queued: true, result: null };
  }
}

export async function flushOfflineQueue(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }
  await replayQueue(offlineStore, {
    createTask(body, idempotencyKey) {
      return tasksApi.createTask(body as CreateTaskBody, idempotencyKey);
    },
    updateTask(id, body) {
      return tasksApi.updateTask(id, body as UpdateTaskBody);
    },
    completeTask(id, body, idempotencyKey) {
      return tasksApi.completeTask(id, body as CompleteTaskBody, idempotencyKey);
    },
  });
}
