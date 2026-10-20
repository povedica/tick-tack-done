import { DEV_USER_EMAIL } from '../../config';
import { sessionMode } from '../../api';
import { readCsrfToken } from '../auth/session';

async function tickyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = tickyHeaders();
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
  models: () => tickyFetch<{ items: { id: string; label: string }[] }>('/models'),
  flags: () => tickyFetch<TickyFlags>('/flags'),
  listThreads: () => tickyFetch<{ items: TickyThread[] }>('/threads'),
  openThread: () => tickyFetch<TickyThread>('/threads', { method: 'POST', body: '{}' }),
  postMessage: (threadId: string, clientMessageId: string, text: string, modelId?: string) =>
    tickyFetch<Record<string, unknown>>(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        client_message_id: clientMessageId,
        text,
        ...(modelId === undefined ? {} : { model_id: modelId }),
      }),
    }),
  approve: (proposalId: string, digest: string, selected: readonly string[]) =>
    tickyFetch<Record<string, unknown>>(`/proposals/${proposalId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ digest, selected_actions: selected }),
    }),
  actionStatus: (actionId: string) => tickyFetch<Record<string, unknown>>(`/actions/${actionId}`),
};

function tickyHeaders(): Record<string, string> {
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
  return headers;
}

/** Reconnect only the event stream. Never resubmit a message after uncertain admission. */
export async function waitForTickyRun(
  runId: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  let cursor = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix = cursor.length > 0 ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const response = await fetch(
      `/api/v1/ticky/runs/${encodeURIComponent(runId)}/events${suffix}`,
      {
        credentials: sessionMode ? 'include' : 'same-origin',
        headers: {
          ...tickyHeaders(),
          accept: 'text/event-stream',
          ...(cursor.length > 0 ? { 'Last-Event-ID': cursor } : {}),
        },
        signal,
      },
    );
    if (!response.ok || response.body === null) {
      throw new Error(
        response.status === 409
          ? 'El historial cambió. Consúltalo antes de repetir el mensaje.'
          : 'No se ha podido recuperar la respuesta. Revisa el historial antes de repetir.',
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        if (buffer.length > 1_000_000) {
          throw new Error('La respuesta es demasiado grande. Revisa el historial.');
        }
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = frame.split('\n');
          const id = lines
            .find((line) => line.startsWith('id:'))
            ?.slice(3)
            .trim();
          if (id !== undefined) {
            cursor = id;
          }
          const data = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (data.length > 0) {
            const value: unknown = JSON.parse(data);
            if (value === null || typeof value !== 'object') {
              throw new Error('Respuesta de Ticky no válida.');
            }
            const event = value as Record<string, unknown>;
            if (event.run_id !== runId) {
              throw new Error('Respuesta de Ticky no válida.');
            }
            if (event.type === 'run.completed') {
              if (
                event.payload === null ||
                typeof event.payload !== 'object' ||
                Array.isArray(event.payload)
              ) {
                throw new Error('Respuesta de Ticky no válida.');
              }
              return event.payload as Record<string, unknown>;
            }
            if (event.type === 'run.failed') {
              throw new Error('La consulta no terminó. Revisa el historial antes de repetir.');
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
  throw new Error('Se interrumpió la conexión. Revisa el historial antes de repetir el mensaje.');
}
