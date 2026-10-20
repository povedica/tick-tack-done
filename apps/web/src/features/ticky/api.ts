import { DEV_USER_EMAIL } from '../../config';
import { sessionMode } from '../../api';
import { readCsrfToken } from '../auth/session';

async function tickyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (sessionMode) {
    const csrf = readCsrfToken() ?? '';
    if (csrf.length > 0) {
      headers['x-csrf-token'] = csrf;
    }
  } else if (DEV_USER_EMAIL.length > 0) {
    headers['x-dev-user-email'] = DEV_USER_EMAIL;
  }
  const response = await fetch(`/api/v1/ticky${path}`, {
    ...init,
    credentials: sessionMode ? 'include' : 'same-origin',
    headers: {
      ...headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
    throw new Error(body.message ?? body.code ?? `ticky_${String(response.status)}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export interface TickyFlags {
  readonly ui: boolean;
  readonly read: boolean;
  readonly model: boolean;
  readonly execution: boolean;
  readonly routines: boolean;
  readonly telegram: boolean;
  readonly kill: boolean;
}

export interface TickyThread {
  readonly id: string;
}

export interface GuidanceBody {
  readonly type: 'guidance';
  readonly status: string;
  readonly message: string;
}

export const tickyApi = {
  flags: () => tickyFetch<TickyFlags>('/flags'),
  listThreads: () => tickyFetch<{ items: TickyThread[] }>('/threads'),
  openThread: () => tickyFetch<TickyThread>('/threads', { method: 'POST', body: '{}' }),
  postMessage: (threadId: string, clientMessageId: string, text: string) =>
    tickyFetch<GuidanceBody | Record<string, unknown>>(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ client_message_id: clientMessageId, text }),
    }),
  approve: (proposalId: string, digest: string, selected: readonly string[]) =>
    tickyFetch<Record<string, unknown>>(`/proposals/${proposalId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ digest, selected_actions: selected }),
    }),
  actionStatus: (actionId: string) => tickyFetch<Record<string, unknown>>(`/actions/${actionId}`),
};
