import { ApiError } from './errors';
import type { components } from './generated/schema';
import { resourceMethods, type ResourceClient } from './resources';

export type CreateTaskBody = components['schemas']['CreateTaskDto'];
export type CreatedTask = components['schemas']['CreateTaskResponseDto'];
export type Task = components['schemas']['TaskResponseDto'];
export type TaskPage = components['schemas']['TaskPageDto'];
export type CompleteTaskBody = components['schemas']['CompleteTaskDto'];

export interface PageQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

export interface ListTasksQuery {
  readonly limit?: number;
  readonly cursor?: string;
  readonly status?: 'active' | 'completed' | 'archived' | 'cancelled';
  readonly projectId?: string;
  readonly priority?: 'none' | 'low' | 'medium' | 'high';
  readonly tag?: string;
  readonly q?: string;
  readonly flat?: boolean;
  readonly overdue?: boolean;
  readonly dueBefore?: string;
  readonly dueAfter?: string;
  readonly listId?: string;
  readonly sort?: string;
}
export type Habit = components['schemas']['HabitResponseDto'];
export type HabitPage = components['schemas']['HabitPageDto'];
export type CreateHabitBody = components['schemas']['CreateHabitDto'];
export type UpdateHabitBody = components['schemas']['UpdateHabitDto'];
export type CheckInBody = components['schemas']['CheckInDto'];
export type CheckInResult = components['schemas']['CheckInResponseDto'];
export type HabitStats = components['schemas']['HabitStatsDto'];
export type ProjectPage = components['schemas']['ProjectPageDto'];
export type FilterRules = components['schemas']['FilterRulesDto'];
export type Filter = components['schemas']['FilterResponseDto'];
export type FilterPage = components['schemas']['FilterPageDto'];
export type CreateFilterBody = components['schemas']['CreateFilterDto'];
export type UpdateFilterBody = components['schemas']['UpdateFilterDto'];
export type PreviewFilterBody = components['schemas']['PreviewFilterDto'];
export type ViewPage = components['schemas']['ViewPageDto'];
export type SmartListPage = components['schemas']['SmartListPageDto'];
export type UpdateSmartListsBody = components['schemas']['UpdateSmartListsDto'];
export type SearchResponse = components['schemas']['SearchResponseDto'];
export type Token = components['schemas']['TokenDto'];
export type TokenPage = components['schemas']['TokenPageDto'];
export type CreatedToken = components['schemas']['TokenCreatedDto'];
export type CreateTokenBody = components['schemas']['CreateTokenDto'];
export type ActivityPage = components['schemas']['ActivityPageDto'];

export interface ViewOptions {
  readonly groupBy?: ViewPage['group_by'];
  readonly sort?: ViewPage['sort'];
  readonly limit?: number;
  readonly cursor?: string;
}

export { ApiError } from './errors';

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly devUserEmail?: string;
  readonly fetchImpl?: typeof fetch;
  readonly credentials?: 'include' | 'omit' | 'same-origin';
  readonly csrfToken?: string | (() => string | undefined);
}

export interface UpdateTaskBody {
  readonly title?: string;
  readonly content?: string;
  readonly repeat_rule?: string | null;
  readonly repeat_from?: 'due_date' | 'completion_date';
  readonly field_clocks?: Readonly<Record<string, string>>;
}

export interface SessionBody {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly csrf_token: string;
}

export interface SyncChange {
  readonly event_id: string;
  readonly type: string;
  readonly occurred_at: string;
  readonly op: 'upsert' | 'tombstone';
  readonly entity_type: string;
  readonly entity_id: string | null;
}

export interface SyncPage {
  readonly changes: readonly SyncChange[];
  readonly next_cursor: string | null;
}

export interface ApiClient extends ResourceClient {
  createTask(body: CreateTaskBody, idempotencyKey: string): Promise<CreatedTask>;
  listTasks(query?: ListTasksQuery): Promise<TaskPage>;
  getTask(id: string): Promise<Task>;
  updateTask(id: string, body: UpdateTaskBody): Promise<Task>;
  completeTask(id: string, body: CompleteTaskBody, idempotencyKey: string): Promise<Task>;
  uncompleteTask(id: string, idempotencyKey: string): Promise<Task>;
  listHabits(): Promise<HabitPage>;
  createHabit(body: CreateHabitBody, idempotencyKey: string): Promise<Habit>;
  updateHabit(id: string, body: UpdateHabitBody): Promise<Habit>;
  deleteHabit(id: string): Promise<void>;
  checkInHabit(id: string, body: CheckInBody, idempotencyKey: string): Promise<CheckInResult>;
  habitStats(id: string, year?: number): Promise<HabitStats>;
  listProjects(query?: PageQuery): Promise<ProjectPage>;
  listSmartLists(): Promise<SmartListPage>;
  updateSmartLists(body: UpdateSmartListsBody): Promise<SmartListPage>;
  smartListTasks(key: string, options?: ViewOptions): Promise<ViewPage>;
  listFilters(): Promise<FilterPage>;
  createFilter(body: CreateFilterBody, idempotencyKey: string): Promise<Filter>;
  updateFilter(id: string, body: UpdateFilterBody): Promise<Filter>;
  deleteFilter(id: string): Promise<void>;
  previewFilter(body: PreviewFilterBody, options?: ViewOptions): Promise<ViewPage>;
  filterTasks(id: string, options?: ViewOptions): Promise<ViewPage>;
  search(q: string, types?: string): Promise<SearchResponse>;
  listTokens(): Promise<TokenPage>;
  createToken(body: CreateTokenBody): Promise<CreatedToken>;
  revokeToken(id: string): Promise<void>;
  tokenActivity(id: string): Promise<ActivityPage>;
  login(body: { email: string; password: string }): Promise<SessionBody>;
  register(body: { email: string; password: string; display_name: string }): Promise<SessionBody>;
  registrationOpen(): Promise<boolean>;
  currentSession(): Promise<SessionBody>;
  logout(): Promise<void>;
  sync(since?: string): Promise<SyncPage>;
  oauthConsent(body: OauthConsentBody): Promise<{ redirect_to: string }>;
}

export interface OauthConsentBody {
  readonly client_id: string;
  readonly redirect_uri: string;
  readonly scope: string;
  readonly state: string;
  readonly code_challenge: string;
  readonly code_challenge_method: string;
  readonly allow: boolean;
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
    updateTask(id, body) {
      return request(call, options, 'PATCH', `/api/v1/tasks/${id}`, body, undefined, isTask);
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
    listProjects(query) {
      return request(
        call,
        options,
        'GET',
        `/api/v1/projects${pageQuery(query)}`,
        undefined,
        undefined,
        isProjectPage,
      );
    },
    listSmartLists() {
      return request(
        call,
        options,
        'GET',
        '/api/v1/smart-lists',
        undefined,
        undefined,
        isSmartListPage,
      );
    },
    updateSmartLists(body) {
      return request(
        call,
        options,
        'PATCH',
        '/api/v1/smart-lists',
        body,
        undefined,
        isSmartListPage,
      );
    },
    smartListTasks(key, view) {
      return request(
        call,
        options,
        'GET',
        `/api/v1/smart-lists/${encodeURIComponent(key)}/tasks${viewQuery(view)}`,
        undefined,
        undefined,
        isViewPage,
      );
    },
    listFilters() {
      return request(call, options, 'GET', '/api/v1/filters', undefined, undefined, isFilterPage);
    },
    createFilter(body, idempotencyKey) {
      return request(call, options, 'POST', '/api/v1/filters', body, idempotencyKey, isFilter);
    },
    updateFilter(id, body) {
      return request(call, options, 'PATCH', `/api/v1/filters/${id}`, body, undefined, isFilter);
    },
    async deleteFilter(id) {
      await request(
        call,
        options,
        'DELETE',
        `/api/v1/filters/${id}`,
        undefined,
        undefined,
        isEmpty,
      );
    },
    previewFilter(body, view) {
      return request(
        call,
        options,
        'POST',
        `/api/v1/filters/preview${viewQuery(view)}`,
        body,
        undefined,
        isViewPage,
      );
    },
    filterTasks(id, view) {
      return request(
        call,
        options,
        'GET',
        `/api/v1/filters/${id}/tasks${viewQuery(view)}`,
        undefined,
        undefined,
        isViewPage,
      );
    },
    listTokens() {
      return request(call, options, 'GET', '/api/v1/me/tokens', undefined, undefined, isTokenPage);
    },
    createToken(body) {
      return request(call, options, 'POST', '/api/v1/me/tokens', body, undefined, isCreatedToken);
    },
    async revokeToken(id) {
      await request(
        call,
        options,
        'DELETE',
        `/api/v1/me/tokens/${id}`,
        undefined,
        undefined,
        isEmpty,
      );
    },
    tokenActivity(id) {
      return request(
        call,
        options,
        'GET',
        `/api/v1/me/tokens/${id}/activity`,
        undefined,
        undefined,
        isActivityPage,
      );
    },
    search(q, types) {
      const params = new URLSearchParams();
      if (q.length > 0) {
        params.set('q', q);
      }
      if (types !== undefined && types.length > 0) {
        params.set('types', types);
      }
      const query = params.toString();
      return request(
        call,
        options,
        'GET',
        `/api/v1/search${query.length === 0 ? '' : `?${query}`}`,
        undefined,
        undefined,
        isSearch,
      );
    },
    login(body) {
      return request(call, options, 'POST', '/api/v1/auth/login', body, undefined, isSession);
    },
    register(body) {
      return request(call, options, 'POST', '/api/v1/auth/register', body, undefined, isSession);
    },
    async registrationOpen() {
      const body = await request(
        call,
        options,
        'GET',
        '/api/v1/auth/registration',
        undefined,
        undefined,
        isRegistration,
      );
      return body.open;
    },
    currentSession() {
      return request(call, options, 'GET', '/api/v1/auth/session', undefined, undefined, isSession);
    },
    async logout() {
      await request(call, options, 'POST', '/api/v1/auth/logout', undefined, undefined, isEmpty);
    },
    sync(since) {
      const query =
        since === undefined || since.length === 0 ? '' : `?since=${encodeURIComponent(since)}`;
      return request(
        call,
        options,
        'GET',
        `/api/v1/sync${query}`,
        undefined,
        undefined,
        isSyncPage,
      );
    },
    oauthConsent(body) {
      return request(call, options, 'POST', '/api/v1/oauth/authorize', body, undefined, isRedirect);
    },
    ...resourceMethods({
      request: (method, path, body, idempotencyKey, parse) =>
        request(call, options, method, path, body, idempotencyKey, parse),
      call,
      options,
    }),
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
  const csrf = typeof options.csrfToken === 'function' ? options.csrfToken() : options.csrfToken;
  if (csrf !== undefined && csrf.length > 0) {
    headers['X-CSRF-Token'] = csrf;
  }
  if (idempotencyKey !== undefined && idempotencyKey.length > 0) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const init: RequestInit = { method, headers };
  if (options.credentials !== undefined) {
    init.credentials = options.credentials;
  }
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
  if (query.projectId !== undefined) {
    params.set('project_id', query.projectId);
  }
  if (query.priority !== undefined) {
    params.set('priority', query.priority);
  }
  if (query.tag !== undefined) {
    params.set('tag', query.tag);
  }
  if (query.q !== undefined && query.q.length > 0) {
    params.set('q', query.q);
  }
  if (query.flat === true) {
    params.set('flat', 'true');
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
  if (query.listId !== undefined) {
    params.set('list_id', query.listId);
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

function isRegistration(value: unknown): value is { open: boolean } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { open?: unknown }).open === 'boolean'
  );
}

function isSession(value: unknown): value is SessionBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as SessionBody;
  return (
    typeof row.id === 'string' &&
    typeof row.email === 'string' &&
    typeof row.display_name === 'string' &&
    typeof row.csrf_token === 'string'
  );
}

function isRedirect(value: unknown): value is { redirect_to: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { redirect_to?: unknown }).redirect_to === 'string'
  );
}

function isSyncPage(value: unknown): value is SyncPage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const page = value as SyncPage;
  return (
    Array.isArray(page.changes) &&
    (page.next_cursor === null || typeof page.next_cursor === 'string')
  );
}

function isEmpty(value: unknown): value is void {
  return value === undefined;
}

function isProjectPage(value: unknown): value is ProjectPage {
  return hasItems(value);
}

function isSmartListPage(value: unknown): value is SmartListPage {
  return hasItems(value);
}

function isFilterPage(value: unknown): value is FilterPage {
  return hasItems(value);
}

function isFilter(value: unknown): value is Filter {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown; name?: unknown; task_count?: unknown };
  return (
    typeof row.id === 'string' && typeof row.name === 'string' && typeof row.task_count === 'number'
  );
}

function isViewPage(value: unknown): value is ViewPage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { count?: unknown; groups?: unknown };
  return typeof row.count === 'number' && Array.isArray(row.groups);
}

function isSearch(value: unknown): value is SearchResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { text?: unknown; groups?: unknown };
  return typeof row.text === 'string' && Array.isArray(row.groups);
}

function isTokenPage(value: unknown): value is TokenPage {
  return hasItems(value);
}

function isCreatedToken(value: unknown): value is CreatedToken {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as { id?: unknown; name?: unknown; token?: unknown };
  return (
    typeof row.id === 'string' && typeof row.name === 'string' && typeof row.token === 'string'
  );
}

function isActivityPage(value: unknown): value is ActivityPage {
  return hasItems(value);
}

function hasItems(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Array.isArray((value as { items?: unknown }).items);
}

function pageQuery(query: PageQuery | undefined): string {
  if (query === undefined) {
    return '';
  }
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }
  if (query.cursor !== undefined && query.cursor.length > 0) {
    params.set('cursor', query.cursor);
  }
  const text = params.toString();
  return text.length === 0 ? '' : `?${text}`;
}

function viewQuery(view: ViewOptions | undefined): string {
  const params = new URLSearchParams();
  if (view?.groupBy !== undefined) {
    params.set('group_by', view.groupBy);
  }
  if (view?.sort !== undefined) {
    params.set('sort', view.sort);
  }
  if (view?.limit !== undefined) {
    params.set('limit', String(view.limit));
  }
  if (view?.cursor !== undefined) {
    params.set('cursor', view.cursor);
  }
  const query = params.toString();
  return query.length === 0 ? '' : `?${query}`;
}
