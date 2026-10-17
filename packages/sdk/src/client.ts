import type { components } from './generated/schema';

export type CreateTaskBody = components['schemas']['CreateTaskDto'];
export type CreatedTask = components['schemas']['CreateTaskResponseDto'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly devUserEmail?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface ApiClient {
  createTask(body: CreateTaskBody, idempotencyKey: string): Promise<CreatedTask>;
}

/** Thin client over the generated OpenAPI types. The web app does not call fetch itself. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const call = options.fetchImpl ?? fetch;
  return {
    createTask(body, idempotencyKey) {
      return send(call, options, body, idempotencyKey);
    },
  };
}

async function send(
  call: typeof fetch,
  options: ApiClientOptions,
  body: CreateTaskBody,
  idempotencyKey: string,
): Promise<CreatedTask> {
  const prefix = options.baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  if (options.devUserEmail !== undefined && options.devUserEmail.length > 0) {
    headers['X-Dev-User-Email'] = options.devUserEmail;
  }
  if (idempotencyKey.length > 0) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const response = await call(`${prefix}/api/v1/tasks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = readError(payload);
    throw new ApiError(response.status, error.code, error.message);
  }
  if (!isCreatedTask(payload)) {
    throw new ApiError(response.status, 'request_failed', 'Response is not a task');
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

function isCreatedTask(value: unknown): value is CreatedTask {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown; title?: unknown; warnings?: unknown };
  if (typeof row.id !== 'string' || typeof row.title !== 'string') {
    return false;
  }
  return row.warnings === undefined || Array.isArray(row.warnings);
}
