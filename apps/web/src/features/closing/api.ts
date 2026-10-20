import { apiOptions } from '../../api';

export async function closingRequest<T>(
  path: string,
  method: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const options = apiOptions();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.devUserEmail !== undefined) {
    headers['X-Dev-User-Email'] = options.devUserEmail;
  }
  const csrf = typeof options.csrfToken === 'function' ? options.csrfToken() : options.csrfToken;
  if (csrf !== undefined && csrf.length > 0) {
    headers['X-CSRF-Token'] = csrf;
  }
  if (idempotencyKey !== undefined) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const init: RequestInit = {
    method,
    headers,
    ...(options.credentials === undefined ? {} : { credentials: options.credentials }),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export interface ClosingCard {
  readonly task_id: string;
  readonly title: string;
  readonly suggested: {
    readonly decision: string;
    readonly target_date: string | null;
    readonly reason: string;
  } | null;
}

export interface ClosingSession {
  readonly id: string;
  readonly revision: number;
  readonly kind: string;
  readonly queue?: { readonly cards: readonly ClosingCard[] };
  readonly review?: {
    readonly done_today: readonly { id: string; title: string }[];
    readonly focus_minutes: number;
  };
  readonly load?: {
    readonly today: {
      readonly status: string;
      readonly task_minutes: number;
      readonly available_minutes: number | null;
    };
    readonly tomorrow: { readonly status: string };
  };
  readonly decisions?: readonly { task_id: string; decision: string; target_date: string | null }[];
  readonly closed?: boolean;
  readonly summary?: Record<string, number>;
}
