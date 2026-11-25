/** Client for POST /api/v1/tasks. The server parses raw_text (RF-102). */

export const CREATE_TASK_TIMEOUT_MS = 10_000;

const DEFAULT_BASE_URL = 'https://todo.reflexionia.com';

export interface CreateTaskInput {
  readonly baseUrl: string;
  readonly token: string;
  readonly rawText: string;
  readonly idempotencyKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

export type CreateTaskResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: 'validation' }
  | { readonly ok: false; readonly kind: 'offline' }
  | { readonly ok: false; readonly kind: 'config'; readonly message: string }
  | {
      readonly ok: false;
      readonly kind: 'api';
      readonly status: number;
      readonly code: string;
      readonly message: string;
    };

export async function createTask(input: CreateTaskInput): Promise<CreateTaskResult> {
  if (input.rawText.trim() === '') {
    return { ok: false, kind: 'validation' };
  }
  const token = input.token.trim();
  if (token === '') {
    return { ok: false, kind: 'config', message: 'Falta el token' };
  }
  const endpoint = taskEndpoint(input.baseUrl);
  if (endpoint === null) {
    return { ok: false, kind: 'config', message: 'URL del servidor no válida' };
  }
  const timeoutMs = input.timeoutMs ?? CREATE_TASK_TIMEOUT_MS;
  try {
    const response = await (input.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({ raw_text: input.rawText }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 200 || response.status === 201) {
      return { ok: true };
    }
    const error = await readApiError(response);
    return {
      ok: false,
      kind: 'api',
      status: response.status,
      code: redact(error.code, token),
      message: redact(error.message, token),
    };
  } catch {
    return { ok: false, kind: 'offline' };
  }
}

function taskEndpoint(baseUrl: string): string | null {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const value = trimmed === '' ? DEFAULT_BASE_URL : trimmed;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}/api/v1/tasks`;
}

async function readApiError(response: Response): Promise<{ code: string; message: string }> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const code =
    typeof error?.code === 'string' && error.code !== '' ? error.code : String(response.status);
  const message = typeof error?.message === 'string' ? error.message : '';
  return { code, message };
}

function redact(value: string, secret: string): string {
  if (secret.length < 4 || !value.includes(secret)) {
    return value;
  }
  return value.split(secret).join('…');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
