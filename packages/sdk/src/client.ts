import type { components } from './generated/schema';

export type CreateTaskBody = components['schemas']['CreateTaskDto'];
export type CreatedTask = components['schemas']['CreateTaskResponseDto'];
export type Task = components['schemas']['TaskResponseDto'];
export type TaskPage = components['schemas']['TaskPageDto'];
export type CompleteTaskBody = components['schemas']['CompleteTaskDto'];

export interface ListTasksQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly status?: 'active' | 'completed' | 'archived';
  readonly overdue?: boolean;
  readonly dueBefore?: string;
  readonly dueAfter?: string;
  readonly sort?: string;
}
export type Habit = components['schemas']['HabitResponseDto'];
export type HabitPage = components['schemas']['HabitPageDto'];
export type CreateHabitBody = components['schemas']['CreateHabitDto'];
export type UpdateHabitBody = components['schemas']['UpdateHabitDto'];
export type CheckInBody = components['schemas']['CheckInDto'];
export type CheckInResult = components['schemas']['CheckInResponseDto'];
export type HabitStats = components['schemas']['HabitStatsDto'];

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
  listTasks(query?: ListTasksQuery): Promise<TaskPage>;
  getTask(id: string): Promise<Task>;
  completeTask(id: string, body: CompleteTaskBody, idempotencyKey: string): Promise<Task>;
  uncompleteTask(id: string, idempotencyKey: string): Promise<Task>;
  listHabits(): Promise<HabitPage>;
  createHabit(body: CreateHabitBody, idempotencyKey: string): Promise<Habit>;
  updateHabit(id: string, body: UpdateHabitBody): Promise<Habit>;
  deleteHabit(id: string): Promise<void>;
  checkInHabit(id: string, body: CheckInBody, idempotencyKey: string): Promise<CheckInResult>;
  habitStats(id: string, year?: number): Promise<HabitStats>;
}

/** Thin client over the generated OpenAPI types. The web app does not call fetch itself. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const call = options.fetchImpl ?? fetch;
  return {
    createTask(body, idempotencyKey) {
      return request(call, options, 'POST', '/api/v1/tasks', body, idempotencyKey, isCreatedTask);
    },
    listTasks(query) {
      return request(
        call,
        options,
        'GET',
        `/api/v1/tasks${taskQuery(query)}`,
        undefined,
        undefined,
        isTaskPage,
      );
    },
    getTask(id) {
      return request(call, options, 'GET', `/api/v1/tasks/${id}`, undefined, undefined, isTask);
    },
    completeTask(id, body, idempotencyKey) {
      return request(
        call,
        options,
        'POST',
        `/api/v1/tasks/${id}/complete`,
        body,
        idempotencyKey,
        isTask,
      );
    },
    uncompleteTask(id, idempotencyKey) {
      return request(
        call,
        options,
        'POST',
        `/api/v1/tasks/${id}/uncomplete`,
        undefined,
        idempotencyKey,
        isTask,
      );
    },
    listHabits() {
      return request(call, options, 'GET', '/api/v1/habits', undefined, undefined, isHabitPage);
    },
    createHabit(body, idempotencyKey) {
      return request(call, options, 'POST', '/api/v1/habits', body, idempotencyKey, isHabit);
    },
    updateHabit(id, body) {
      return request(call, options, 'PATCH', `/api/v1/habits/${id}`, body, undefined, isHabit);
    },
    async deleteHabit(id) {
      await request(call, options, 'DELETE', `/api/v1/habits/${id}`, undefined, undefined, isEmpty);
    },
    checkInHabit(id, body, idempotencyKey) {
      return request(
        call,
        options,
        'POST',
        `/api/v1/habits/${id}/checkins`,
        body,
        idempotencyKey,
        isCheckIn,
      );
    },
    habitStats(id, year) {
      const query = year === undefined ? '' : `?year=${String(year)}`;
      return request(
        call,
        options,
        'GET',
        `/api/v1/habits/${id}/stats${query}`,
        undefined,
        undefined,
        isHabitStats,
      );
    },
  };
}

async function request<T>(
  call: typeof fetch,
  options: ApiClientOptions,
  method: string,
  path: string,
  body: unknown,
  idempotencyKey: string | undefined,
  parse: (value: unknown) => value is T,
): Promise<T> {
  const prefix = options.baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.devUserEmail !== undefined && options.devUserEmail.length > 0) {
    headers['X-Dev-User-Email'] = options.devUserEmail;
  }
  if (idempotencyKey !== undefined && idempotencyKey.length > 0) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await call(`${prefix}${path}`, init);
  if (response.status === 204) {
    if (parse(undefined)) {
      return undefined as T;
    }
    throw new ApiError(response.status, 'request_failed', 'Response is empty');
  }
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = readError(payload);
    throw new ApiError(response.status, error.code, error.message);
  }
  if (!parse(payload)) {
    throw new ApiError(response.status, 'request_failed', 'Response does not match the API');
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

function taskQuery(query: ListTasksQuery | undefined): string {
  if (query === undefined) {
    return '';
  }
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  if (query.cursor !== undefined) {
    params.set('cursor', query.cursor);
  }
  if (query.status !== undefined) {
    params.set('status', query.status);
  }
  if (query.overdue === true) {
    params.set('overdue', 'true');
  }
  if (query.dueBefore !== undefined) {
    params.set('due_before', query.dueBefore);
  }
  if (query.dueAfter !== undefined) {
    params.set('due_after', query.dueAfter);
  }
  if (query.sort !== undefined) {
    params.set('sort', query.sort);
  }
  const text = params.toString();
  return text.length === 0 ? '' : `?${text}`;
}

function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown; title?: unknown; status?: unknown };
  return (
    typeof row.id === 'string' && typeof row.title === 'string' && typeof row.status === 'string'
  );
}

function isTaskPage(value: unknown): value is TaskPage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { items?: unknown; next_cursor?: unknown };
  return (
    Array.isArray(row.items) &&
    row.items.every(isTask) &&
    (row.next_cursor === null || typeof row.next_cursor === 'string')
  );
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

function isHabit(value: unknown): value is Habit {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown; name?: unknown; today?: unknown };
  return typeof row.id === 'string' && typeof row.name === 'string' && row.today !== undefined;
}

function isHabitPage(value: unknown): value is HabitPage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { items?: unknown };
  return Array.isArray(row.items);
}

function isCheckIn(value: unknown): value is CheckInResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown; habit_id?: unknown; count?: unknown };
  return (
    typeof row.id === 'string' && typeof row.habit_id === 'string' && typeof row.count === 'number'
  );
}

function isHabitStats(value: unknown): value is HabitStats {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { streak_current?: unknown; heatmap?: unknown };
  return typeof row.streak_current === 'number' && Array.isArray(row.heatmap);
}

function isEmpty(value: unknown): value is void {
  return value === undefined;
}
