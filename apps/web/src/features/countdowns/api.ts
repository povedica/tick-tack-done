import { ApiError } from '@reflexionia/sdk';
import { apiOptions } from '../../api';

export type CountdownType = 'countdown' | 'anniversary' | 'birthday' | 'holiday';
export type CountdownKind = 'until' | 'since' | 'today';
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type DayMode = 'standard' | 'plus_one';
export type CountdownColor =
  | 'none'
  | 'blue'
  | 'teal'
  | 'green'
  | 'lime'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'navy'
  | 'brown'
  | 'black'
  | 'rainbow';

export interface Countdown {
  readonly id: string;
  readonly title: string;
  readonly type: CountdownType;
  readonly emoji: string | null;
  readonly targetDate: string;
  readonly repeatRule: RepeatRule;
  readonly dayMode: DayMode;
  readonly color: CountdownColor | null;
  readonly notes: string | null;
  readonly showInSidebar: boolean;
  readonly showInSmartList: boolean;
  readonly pinned: boolean;
  readonly archivedAt: string | null;
  readonly days: number;
  readonly kind: CountdownKind;
  readonly effectiveDate: string;
  readonly reminders: readonly { offsetDays: number; constant?: boolean }[];
}

export interface CountdownDraft {
  readonly title: string;
  readonly type: CountdownType;
  readonly emoji: string | null;
  readonly targetDate: string;
  readonly repeatRule: RepeatRule;
  readonly dayMode: DayMode;
  readonly color: CountdownColor | null;
  readonly notes: string | null;
  readonly showInSidebar: boolean;
  readonly showInSmartList: boolean;
  readonly reminders: readonly { offsetDays: number; constant?: boolean }[];
}

interface CountdownWire {
  readonly id: string;
  readonly title: string;
  readonly type: CountdownType;
  readonly emoji: string | null;
  readonly target_date: string;
  readonly repeat_rule: RepeatRule;
  readonly day_mode: DayMode;
  readonly color: CountdownColor | null;
  readonly notes: string | null;
  readonly show_in_sidebar: boolean;
  readonly show_in_smart_list: boolean;
  readonly pinned: boolean;
  readonly archived_at: string | null;
  readonly days: number;
  readonly kind: CountdownKind;
  readonly effective_date: string;
  readonly reminders: readonly { offset_days: number; constant?: boolean }[];
}

function query(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, String(value));
  });
  return params.size === 0 ? '' : `?${params.toString()}`;
}

async function request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const options = apiOptions();
  const csrf = typeof options.csrfToken === 'function' ? options.csrfToken() : options.csrfToken;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.devUserEmail) headers['X-Dev-User-Email'] = options.devUserEmail;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${options.baseUrl}/api/v1${path}`, {
    method,
    headers,
    credentials: options.credentials,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data as { error?: { code?: string; message?: string } };
    throw new ApiError(response.status, error.error?.code ?? 'request_failed', error.error?.message ?? 'Request failed');
  }
  return data as T;
}

export const countdownsApi = {
  async list(archived = false, dueWithinDays?: number): Promise<{ items: Countdown[] }> {
    const page = await request<{ items: CountdownWire[] }>('GET', `/countdowns${query({ archived, dueWithinDays })}`);
    return { items: page.items.map(fromWire) };
  },
  async create(body: CountdownDraft, idempotencyKey: string): Promise<Countdown> {
    return fromWire(await request<CountdownWire>('POST', '/countdowns', toWire(body), idempotencyKey));
  },
  async update(id: string, body: Partial<CountdownDraft> & { pinned?: boolean }): Promise<Countdown> {
    return fromWire(await request<CountdownWire>('PATCH', `/countdowns/${id}`, toWire(body), crypto.randomUUID()));
  },
  async archive(id: string): Promise<Countdown> {
    return fromWire(await request<CountdownWire>('POST', `/countdowns/${id}/archive`, undefined, crypto.randomUUID()));
  },
  async unarchive(id: string): Promise<Countdown> {
    return fromWire(await request<CountdownWire>('POST', `/countdowns/${id}/unarchive`, undefined, crypto.randomUUID()));
  },
  remove(id: string) {
    return request<void>('DELETE', `/countdowns/${id}`);
  },
};

function fromWire(value: CountdownWire): Countdown {
  return {
    id: value.id, title: value.title, type: value.type, emoji: value.emoji,
    targetDate: value.target_date, repeatRule: value.repeat_rule, dayMode: value.day_mode,
    color: value.color, notes: value.notes, showInSidebar: value.show_in_sidebar,
    showInSmartList: value.show_in_smart_list, pinned: value.pinned, archivedAt: value.archived_at,
    days: value.days, kind: value.kind, effectiveDate: value.effective_date,
    reminders: value.reminders.map((reminder) => ({ offsetDays: reminder.offset_days, constant: reminder.constant })),
  };
}

function toWire(value: Partial<CountdownDraft> & { pinned?: boolean }): Record<string, unknown> {
  return {
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.type === undefined ? {} : { type: value.type }),
    ...(value.emoji === undefined ? {} : { emoji: value.emoji }),
    ...(value.targetDate === undefined ? {} : { target_date: value.targetDate }),
    ...(value.repeatRule === undefined ? {} : { repeat_rule: value.repeatRule }),
    ...(value.dayMode === undefined ? {} : { day_mode: value.dayMode }),
    ...(value.color === undefined ? {} : { color: value.color }),
    ...(value.notes === undefined ? {} : { notes: value.notes }),
    ...(value.showInSidebar === undefined ? {} : { show_in_sidebar: value.showInSidebar }),
    ...(value.showInSmartList === undefined ? {} : { show_in_smart_list: value.showInSmartList }),
    ...(value.reminders === undefined ? {} : { reminders: value.reminders.map((reminder) => ({ offset_days: reminder.offsetDays, constant: reminder.constant })) }),
    ...(value.pinned === undefined ? {} : { pinned: value.pinned }),
  };
}
