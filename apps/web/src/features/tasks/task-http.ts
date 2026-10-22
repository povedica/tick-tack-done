import { ApiError } from '@reflexionia/sdk';
import { apiOptions } from '../../api';

export interface TaskComment {
  readonly id: string;
  readonly body: string;
  readonly authorId: string;
  readonly createdAt: string | null;
}

export async function listComments(taskId: string): Promise<readonly TaskComment[]> {
  const payload = await taskFetch('GET', `/api/v1/tasks/${taskId}/comments`);
  if (typeof payload !== 'object' || payload === null || !('items' in payload)) {
    return [];
  }
  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const row = item as { id?: unknown; body?: unknown; author_id?: unknown; created_at?: unknown };
    if (typeof row.id !== 'string' || typeof row.body !== 'string') {
      return [];
    }
    return [
      {
        id: row.id,
        body: row.body,
        authorId: typeof row.author_id === 'string' ? row.author_id : '',
        createdAt: typeof row.created_at === 'string' ? row.created_at : null,
      },
    ];
  });
}

export async function createComment(taskId: string, body: string): Promise<void> {
  await taskFetch('POST', `/api/v1/tasks/${taskId}/comments`, { body });
}

export async function patchChecklistItem(
  taskId: string,
  itemId: string,
  body: { title?: string; before_id?: string | null },
): Promise<void> {
  await taskFetch('PATCH', `/api/v1/tasks/${taskId}/items/${itemId}`, body);
}

export async function deleteAttachment(
  taskId: string,
  attachmentId: string,
  trashInDrive = false,
): Promise<void> {
  await taskFetch(
    'DELETE',
    `/api/v1/tasks/${taskId}/attachments/${attachmentId}?trash_in_drive=${String(trashInDrive)}`,
  );
}

export function attachmentHref(taskId: string, attachmentId: string): string {
  return `/api/v1/tasks/${taskId}/attachments/${attachmentId}`;
}

export async function taskFetch(method: string, path: string, body?: unknown): Promise<unknown> {
  const options = apiOptions();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.devUserEmail !== undefined && options.devUserEmail.length > 0) {
    headers['X-Dev-User-Email'] = options.devUserEmail;
  }
  const csrf = typeof options.csrfToken === 'function' ? options.csrfToken() : options.csrfToken;
  if (csrf !== undefined && csrf.length > 0) {
    headers['X-CSRF-Token'] = csrf;
  }
  const init: RequestInit = { method, headers };
  if (options.credentials !== undefined) {
    init.credentials = options.credentials;
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  if (response.status === 204) {
    return undefined;
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = readError(payload);
    throw new ApiError(response.status, error.code, error.message);
  }
  return payload;
}

function readError(value: unknown): { code: string; message: string } {
  if (typeof value !== 'object' || value === null) {
    return { code: 'request_failed', message: 'Request failed' };
  }
  const error = (value as { error?: { code?: unknown; message?: unknown } }).error;
  return {
    code: typeof error?.code === 'string' ? error.code : 'request_failed',
    message: typeof error?.message === 'string' ? error.message : 'Request failed',
  };
}
