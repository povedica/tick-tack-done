import { ApiError } from './errors';
import type { components, operations } from './generated/schema';
import type { ApiClientOptions, PageQuery, Task } from './client';

export type Me = components['schemas']['MeResponseDto'];
export interface UpdateMeBody {
  readonly capture_settings?: components['schemas']['CaptureSettingsDto'];
  readonly telegram_enabled?: boolean;
  readonly display_name?: string;
  readonly time_zone?: string;
  readonly task_complete_children?: 'ask' | 'complete' | 'leave';
  readonly daily_reminder_time?: string | null;
  readonly locale?: 'auto' | 'es' | 'en';
  readonly week_start?: 'monday' | 'sunday';
  readonly theme?: 'light' | 'dark' | 'auto';
  readonly nlp_language?: 'auto' | 'es' | 'en';
  readonly density?: 'comfortable' | 'compact';
  readonly accent?: 'indigo' | 'violet' | 'teal' | 'amber' | 'rose' | 'slate';
  readonly default_reminder_trigger?: string | null;
  readonly shutdown_reminder_time?: string | null;
  readonly work_day_start?: string | null;
  readonly work_day_end?: string | null;
  readonly default_task_duration_minutes?: number;
  readonly deadline_soon_days?: number;
  readonly evening_start?: string;
  readonly work_days?: readonly string[];
  readonly work_folder_ids?: readonly string[];
  readonly work_project_ids?: readonly string[];
  readonly work_tag_ids?: readonly string[];
  readonly hide_work_outside_hours?: boolean;
  readonly show_work?: boolean;
  readonly features?: {
    readonly navigation_order?: readonly string[];
    readonly countdowns?: boolean;
    readonly focus?: boolean;
    readonly matrix?: boolean;
    readonly when_deadline?: boolean;
    readonly day_load?: boolean;
    readonly day_closing?: boolean;
    readonly day_replan?: boolean;
  };
}
export type InboundEmailStatus = components['schemas']['InboundEmailStatusDto'];
export type InboundEmailAddress = components['schemas']['InboundEmailAddressDto'];
export type Tag = components['schemas']['TagResponseDto'];
export type TagPage = components['schemas']['TagPageDto'];
export type Folder = components['schemas']['FolderResponseDto'];
export type FolderPage = components['schemas']['FolderPageDto'];
export type Project = components['schemas']['ProjectResponseDto'];
export type Column = components['schemas']['ColumnResponseDto'];
export type ColumnPage = components['schemas']['ColumnPageDto'];

export interface NamedWrite {
  readonly name: string;
  readonly color?: string | null;
  readonly parent_id?: string | null;
  readonly folder_id?: string | null;
  readonly view_mode?: 'list' | 'kanban' | 'timeline';
  readonly kind?: 'TASK' | 'NOTE';
  readonly is_project?: boolean;
  readonly project_status?: 'active' | 'paused';
  readonly outcome?: string | null;
}

export interface DeletionImpact {
  readonly project_id: string;
  readonly name: string;
  readonly is_project: boolean;
  readonly closed: boolean;
  readonly task_count: number;
  readonly completed_count: number;
  readonly open_count: number;
  readonly subtask_count: number;
}

export interface ProjectNextAction {
  readonly task_id: string;
  readonly title: string;
  readonly due_date: string | null;
  readonly start_date: string | null;
  readonly is_all_day: boolean;
}

export interface ProjectOverviewItem {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly folder_id: string | null;
  readonly outcome: string | null;
  readonly state: 'active' | 'paused' | 'archived';
  readonly project_status_changed_at: string | null;
  readonly closed_at: string | null;
  readonly created_at: string;
  readonly project_reviewed_at: string | null;
  readonly done_count: number;
  readonly total_count: number;
  readonly open_count: number;
  readonly next_action: ProjectNextAction | null;
  readonly last_activity_at: string | null;
  readonly attention: 'no_next_action' | 'stale' | null;
}

export interface ProjectOverview {
  readonly items: readonly ProjectOverviewItem[];
  readonly counts: { readonly active: number; readonly paused: number; readonly archived: number };
  readonly next_cursor: null;
}

export interface ProjectReviewResult {
  readonly reviewed: number;
}

export interface ProjectDataTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly column_id: string | null;
  readonly parent_id: string | null;
  readonly sort_order: string;
  readonly tag_ids: string[];
  readonly checklist_progress: { readonly completed: number; readonly total: number };
}

export interface ProjectData {
  readonly project: Project;
  readonly columns: readonly Column[];
  readonly tasks: readonly ProjectDataTask[];
}

export interface TaskPatch {
  readonly title?: string;
  readonly content?: string;
  readonly kind?: 'task' | 'note';
  readonly priority?: Task['priority'];
  readonly is_all_day?: boolean;
  readonly start_date?: string | null;
  readonly due_date?: string | null;
  readonly time_zone?: string;
  readonly duration_minutes?: number | null;
  readonly repeat_rule?: string | null;
  readonly repeat_from?: 'due_date' | 'completion_date';
  readonly tag_ids?: readonly string[];
  readonly column_id?: string | null;
  readonly extract_checklist?: boolean;
  readonly before_id?: string | null;
}

export interface ChecklistItem {
  readonly id: string;
  readonly task_id: string;
  readonly title: string;
  readonly status: 'active' | 'completed';
  readonly sort_order: string;
  readonly due_date: string | null;
}

export interface ActivityEntry {
  readonly id: string;
  readonly action: string;
  readonly created_at: string;
  readonly actor_id: string;
  readonly actor_kind?: string | null;
  readonly token_id?: string | null;
  readonly token_name?: string | null;
  readonly oauth_client_id?: string | null;
}

export interface TaskDetail extends Task {
  readonly items: readonly ChecklistItem[];
  readonly subtasks: readonly Task[];
  readonly activity: readonly ActivityEntry[];
}

export interface Reminder {
  readonly id: string;
  readonly task_id: string;
  readonly trigger: string;
  readonly type: 'relative' | 'absolute' | 'location' | 'daily_digest';
  readonly absolute_at: string | null;
  readonly channel: 'push' | 'email' | 'both';
  readonly constant: boolean;
}

export interface ReminderWrite {
  readonly trigger: string;
  readonly type: Reminder['type'];
  readonly absolute_at?: string | null;
  readonly channel?: Reminder['channel'];
  readonly constant?: boolean;
}

export interface OccurrencePage {
  readonly occurrences: readonly {
    readonly due_date: string;
    readonly start_date: string | null;
  }[];
}

export interface Attachment {
  readonly id: string;
  readonly file_name: string;
  readonly mime_type: string;
  readonly byte_size: number;
  readonly drive_file_id: string;
  readonly web_view_link: string;
  readonly icon_link: string | null;
  readonly source: string;
  readonly drive_state: 'ok' | 'missing' | 'unknown';
}

export interface TaskLink {
  readonly id: string;
  readonly task_id: string;
  readonly url: string;
  readonly title: string | null;
  readonly source: string;
  readonly created_at: string;
  readonly updated_at: string;
}
export interface TaskLinkPage {
  readonly items: readonly TaskLink[];
  readonly next_cursor: string | null;
}
export interface AttachmentPage {
  readonly items: readonly Attachment[];
}

export interface BatchBody {
  readonly action: 'complete' | 'move' | 'tag' | 'priority' | 'due' | 'delete';
  readonly ids: readonly string[];
  readonly project_id?: string;
  readonly column_id?: string | null;
  readonly tag_ids?: readonly string[];
  readonly priority?: Task['priority'];
  readonly due_date?: string | null;
  readonly complete_children?: 'complete' | 'leave';
}

export interface CountResult {
  readonly deleted?: number;
  readonly updated?: number;
  readonly archived?: number;
}

interface Http {
  request<T>(
    method: string,
    path: string,
    body: unknown,
    idempotencyKey: string | undefined,
    parse: (value: unknown) => value is T,
  ): Promise<T>;
  call: typeof fetch;
  options: ApiClientOptions;
}

export type JsonObject = Readonly<Record<string, unknown>>;

export type WorkDayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface WorkContext {
  readonly work_day_start: string | null;
  readonly work_day_end: string | null;
  readonly work_days: readonly WorkDayCode[];
  readonly work_folder_ids: readonly string[];
  readonly work_project_ids: readonly string[];
  readonly work_tag_ids: readonly string[];
  readonly hide_work_outside_hours: boolean;
  readonly show_work_until: string | null;
  readonly is_work_time_now: boolean;
  readonly work_hidden_now: boolean;
  readonly next_work_start: string | null;
  readonly counts: { readonly lists: number; readonly tags: number; readonly active_tasks: number };
}

export interface UpdateWorkContextBody {
  readonly work_days?: readonly WorkDayCode[];
  readonly work_folder_ids?: readonly string[];
  readonly work_project_ids?: readonly string[];
  readonly work_tag_ids?: readonly string[];
  readonly hide_work_outside_hours?: boolean;
  readonly show_work?: boolean;
}

export interface ResourceClient {
  getMe(): Promise<Me>;
  getWorkContext(): Promise<WorkContext>;
  updateWorkContext(body: UpdateWorkContextBody): Promise<WorkContext>;
  notificationHealth(): Promise<JsonObject>;
  updateMe(body: UpdateMeBody): Promise<Me>;
  inboundEmail(): Promise<InboundEmailStatus>;
  rotateInboundEmail(): Promise<InboundEmailAddress>;
  revokeInboundEmail(): Promise<void>;
  listTags(query?: PageQuery): Promise<TagPage>;
  createTag(body: NamedWrite, idempotencyKey: string): Promise<Tag>;
  updateTag(
    id: string,
    body: Partial<NamedWrite> & { before_id?: string | null; move_to_end?: boolean },
  ): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  mergeTags(sourceId: string, targetId: string): Promise<Tag>;
  listFolders(): Promise<FolderPage>;
  createFolder(body: NamedWrite, idempotencyKey: string): Promise<Folder>;
  updateFolder(id: string, body: Partial<NamedWrite>): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
  getProject(id: string): Promise<Project>;
  createProject(body: NamedWrite, idempotencyKey: string): Promise<Project>;
  updateProject(
    id: string,
    body: Partial<NamedWrite> & {
      default_reminder_trigger?: string | null;
      before_id?: string | null;
      move_to_end?: boolean;
    },
  ): Promise<Project>;
  deleteProject(id: string, options?: { readonly expectedTaskCount?: number }): Promise<void>;
  setProjectState(
    id: string,
    state: 'active' | 'paused' | 'archived',
    idempotencyKey?: string,
  ): Promise<Project>;
  projectOverview(state?: 'active' | 'paused' | 'archived'): Promise<ProjectOverview>;
  reviewProject(id: string): Promise<ProjectReviewResult>;
  reviewProjects(ids: readonly string[]): Promise<ProjectReviewResult>;
  getProjectDeletionImpact(id: string): Promise<DeletionImpact>;
  archiveProject(id: string, idempotencyKey: string): Promise<Project>;
  unarchiveProject(id: string, idempotencyKey: string): Promise<Project>;
  archiveCompleted(id: string, idempotencyKey: string): Promise<CountResult>;
  listColumns(projectId: string): Promise<ColumnPage>;
  createColumn(projectId: string, name: string, idempotencyKey: string): Promise<Column>;
  updateColumn(
    projectId: string,
    columnId: string,
    body: { name?: string; collapsed?: boolean; wip_limit?: number | null },
  ): Promise<Column>;
  deleteColumn(projectId: string, columnId: string): Promise<void>;
  projectData(id: string): Promise<ProjectData>;
  taskDetail(id: string): Promise<TaskDetail>;
  patchTask(id: string, body: TaskPatch): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  moveTask(id: string, projectId: string, columnId?: string | null): Promise<Task>;
  duplicateTask(id: string, idempotencyKey: string): Promise<Task>;
  cancelTask(id: string): Promise<Task>;
  batchTasks(body: BatchBody): Promise<CountResult>;
  listTrash(): Promise<{ items: Task[]; next_cursor: string | null }>;
  emptyTrash(): Promise<CountResult>;
  restoreTask(id: string): Promise<Task>;
  purgeTask(id: string): Promise<void>;
  snoozeTask(
    id: string,
    preset: 'tomorrow' | 'next_week' | 'date',
    date?: string | null,
  ): Promise<Task>;
  detachOccurrence(id: string, dueDate: string): Promise<Task>;
  occurrences(id: string): Promise<OccurrencePage>;
  listReminders(id: string): Promise<readonly Reminder[]>;
  createReminder(id: string, body: ReminderWrite, idempotencyKey: string): Promise<Reminder>;
  deleteReminder(id: string, reminderId: string): Promise<void>;
  createChecklistItem(id: string, title: string, idempotencyKey: string): Promise<ChecklistItem>;
  completeChecklistItem(id: string, itemId: string): Promise<ChecklistItem>;
  deleteChecklistItem(id: string, itemId: string): Promise<void>;
  listTaskLinks(id: string): Promise<TaskLinkPage>;
  addTaskLink(id: string, body: { url: string; title?: string }): Promise<TaskLink>;
  removeTaskLink(id: string, linkId: string): Promise<void>;
  listAttachments(id: string): Promise<AttachmentPage>;
  uploadAttachment(id: string, file: Blob, fileName: string): Promise<Attachment>;
  dashboardData(): Promise<JsonObject>;
  dashboardLayout(): Promise<JsonObject>;
  saveDashboardLayout(body: {
    name: string;
    is_default: boolean;
    widgets: readonly { widget_key: string; position: number; size: string; config: JsonObject }[];
  }): Promise<JsonObject>;
  statsOverview(query: string): Promise<StatsOverview>;
  statsTasks(query: string): Promise<StatsTasks>;
  statsFocus(query: string): Promise<StatsFocus>;
  statsHabits(query: string): Promise<StatsHabits>;
  statsAchievement(): Promise<StatsAchievement>;
  statsExport(query: string): Promise<Blob>;
  weeklyReports(): Promise<JsonObject>;
  weeklyReport(week: string): Promise<JsonObject>;
  buildWeeklyReport(): Promise<JsonObject>;
  reviewDaily(): Promise<JsonObject>;
  reviewWeekly(): Promise<JsonObject>;
  startPlan(body: JsonObject): Promise<JsonObject>;
  planSession(id: string): Promise<JsonObject>;
  decidePlan(id: string, taskId: string, body: JsonObject): Promise<JsonObject>;
  clearPlanDecision(id: string, taskId: string): Promise<JsonObject>;
  applyPlan(id: string, body: JsonObject, idempotencyKey: string): Promise<JsonObject>;
  dayPlan(date: string, timeZone: string): Promise<JsonObject>;
  calendarEvents(
    from: string,
    to: string,
    context?: 'all' | 'work' | 'personal' | 'auto',
  ): Promise<JsonObject>;
  listGoogleCalendars(): Promise<readonly JsonObject[]>;
  listCalendarSubscriptions(): Promise<JsonObject>;
  createCalendarSubscription(body: JsonObject): Promise<JsonObject>;
  updateCalendarSubscription(id: string, body: JsonObject): Promise<JsonObject>;
  refreshCalendarSubscription(id: string): Promise<JsonObject>;
  deleteCalendarSubscription(id: string): Promise<void>;
  syncCalendars(): Promise<JsonObject>;
  matrixRules(): Promise<JsonObject>;
  saveMatrixRule(body: JsonObject): Promise<JsonObject>;
  getViewPreferences(key: string): Promise<JsonObject>;
  putViewPreferences(key: string, body: JsonObject): Promise<JsonObject>;
  oauthRenewals(): Promise<JsonObject>;
  oauthGrants(): Promise<JsonObject>;
  revokeOauthGrant(id: string): Promise<void>;
  oauthGrantActivity(id: string, cursor?: string): Promise<JsonObject>;
  startFocus(body?: JsonObject): Promise<JsonObject>;
  listFocusSessions(
    status?: 'active' | 'completed' | 'aborted',
    cursor?: string,
  ): Promise<JsonObject>;
  focusStats(): Promise<JsonObject>;
  pauseFocus(id: string): Promise<JsonObject>;
  resumeFocus(id: string): Promise<JsonObject>;
  finishFocus(id: string): Promise<JsonObject>;
  abortFocus(id: string): Promise<JsonObject>;
  registerPushSubscription(body: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }): Promise<JsonObject>;
  notificationAction(
    id: string,
    body: { action: 'complete' | 'snooze' | 'open'; token: string },
  ): Promise<JsonObject>;
  getNotificationSettings(): Promise<JsonObject>;
  updateNotificationSettings(body: JsonObject): Promise<JsonObject>;
  testNotification(channel: 'push' | 'email' | 'telegram'): Promise<JsonObject>;
  notificationDeliveries(cursor?: string): Promise<JsonObject>;
  getHealth(): Promise<JsonObject>;
  getFocusSettings(): Promise<JsonObject>;
  updateFocusSettings(body: JsonObject): Promise<JsonObject>;
  listNotes(): Promise<JsonObject>;
  listStickies(): Promise<JsonObject>;
  createSticky(text: string): Promise<JsonObject>;
  integrationStatus(kind: 'telegram' | 'drive' | 'google'): Promise<JsonObject>;
  configureTelegram(token: string, force?: boolean): Promise<JsonObject>;
  removeTelegramBot(): Promise<void>;
  retryTelegramWebhook(): Promise<JsonObject>;
  createTelegramPairing(): Promise<JsonObject>;
  setGoogleService(service: 'calendar' | 'drive', enabled: boolean): Promise<JsonObject>;
  googleConnect(service?: 'calendar' | 'drive' | 'all'): Promise<JsonObject>;
  listWebhooks(): Promise<JsonObject>;
  createWebhook(body: JsonObject): Promise<JsonObject>;
  updateWebhook(id: string, body: { active: boolean }): Promise<JsonObject>;
  rotateWebhook(id: string): Promise<JsonObject>;
  pingWebhook(id: string): Promise<JsonObject>;
  deleteWebhook(id: string): Promise<void>;
  listAutomations(): Promise<JsonObject>;
  createAutomation(body: JsonObject): Promise<JsonObject>;
  updateAutomation(id: string, body: { enabled: boolean }): Promise<JsonObject>;
  deleteAutomation(id: string): Promise<void>;
  listPlugins(): Promise<JsonObject>;
  deleteAccount(confirmation: string): Promise<void>;
  exportJson(): Promise<JsonObject>;
  listBackups(): Promise<JsonObject>;
  restoreBackup(stamp: string): Promise<JsonObject>;
  achievements(): Promise<JsonObject>;
  setAchievements(enabled: boolean): Promise<JsonObject>;
  beginTotp(): Promise<JsonObject>;
  totpStatus(): Promise<{ enabled: boolean }>;
  confirmTotp(code: string): Promise<JsonObject>;
  cancelTotp(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  reportLocation(lat: number, lon: number): Promise<JsonObject>;
  createCalendarFeed(projectId: string): Promise<JsonObject>;
  listCalendarFeeds(): Promise<JsonObject>;
  rotateCalendarFeed(id: string): Promise<JsonObject>;
  revokeCalendarFeed(id: string): Promise<void>;
  disconnectGoogle(options?: { readonly removeImportedEvents?: boolean }): Promise<void>;
  recheckTelegram(): Promise<JsonObject>;
  disconnectTelegram(): Promise<void>;
  listMembers(projectId: string): Promise<JsonObject>;
  addMember(
    projectId: string,
    email: string,
    permission: 'read' | 'comment' | 'write',
  ): Promise<JsonObject>;
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

export function resourceMethods(http: Http): ResourceClient {
  const ask = http.request.bind(http);
  return {
    getMe: () => ask('GET', '/api/v1/me', undefined, undefined, isMe),
    notificationHealth: () =>
      ask('GET', '/api/v1/me/notifications/health', undefined, undefined, isJsonObject),
    updateMe: (body) => ask('PATCH', '/api/v1/me', body, undefined, isMe),
    getWorkContext: () =>
      ask('GET', '/api/v1/me/work-context', undefined, undefined, isWorkContext),
    updateWorkContext: (body) =>
      ask('PATCH', '/api/v1/me/work-context', body, undefined, isWorkContext),
    inboundEmail: () =>
      ask('GET', '/api/v1/me/inbound-email', undefined, undefined, isInboundStatus),
    rotateInboundEmail: () =>
      ask('POST', '/api/v1/me/inbound-email', undefined, undefined, isInboundAddress),
    async revokeInboundEmail() {
      await ask('DELETE', '/api/v1/me/inbound-email', undefined, undefined, isEmpty);
    },
    listTags: (query) =>
      ask('GET', `/api/v1/tags${pageQuery(query)}`, undefined, undefined, isTagPage),
    createTag: (body, key) => ask('POST', '/api/v1/tags', body, key, isTag),
    updateTag: (id, body) => ask('PATCH', `/api/v1/tags/${id}`, body, undefined, isTag),
    async deleteTag(id) {
      await ask('DELETE', `/api/v1/tags/${id}`, undefined, undefined, isEmpty);
    },
    mergeTags: (sourceId, targetId) =>
      ask(
        'POST',
        '/api/v1/tags/merge',
        { source_id: sourceId, target_id: targetId },
        undefined,
        isTag,
      ),
    listFolders: () => ask('GET', '/api/v1/folders', undefined, undefined, isFolderPage),
    createFolder: (body, key) => ask('POST', '/api/v1/folders', body, key, isFolder),
    updateFolder: (id, body) => ask('PATCH', `/api/v1/folders/${id}`, body, undefined, isFolder),
    async deleteFolder(id) {
      await ask('DELETE', `/api/v1/folders/${id}`, undefined, undefined, isEmpty);
    },
    getProject: (id) => ask('GET', `/api/v1/projects/${id}`, undefined, undefined, isProject),
    createProject: (body, key) => ask('POST', '/api/v1/projects', body, key, isProject),
    updateProject: (id, body) => ask('PATCH', `/api/v1/projects/${id}`, body, undefined, isProject),
    async deleteProject(id, options) {
      const params = new URLSearchParams();
      if (options?.expectedTaskCount !== undefined) {
        params.set('expected_task_count', String(options.expectedTaskCount));
      }
      const query = params.toString();
      await ask(
        'DELETE',
        `/api/v1/projects/${id}${query.length === 0 ? '' : `?${query}`}`,
        undefined,
        undefined,
        isEmpty,
      );
    },
    setProjectState: (id, state, key) =>
      ask('POST', `/api/v1/projects/${id}/state`, { state }, key, isProject),
    projectOverview: (state) =>
      ask(
        'GET',
        `/api/v1/projects/overview${state === undefined ? '' : `?state=${state}`}`,
        undefined,
        undefined,
        isProjectOverview,
      ),
    reviewProject: (id) =>
      ask('POST', `/api/v1/projects/${id}/review`, undefined, undefined, isProjectReview),
    reviewProjects: (ids) =>
      ask('POST', '/api/v1/projects/review', { ids }, undefined, isProjectReview),
    getProjectDeletionImpact: (id) =>
      ask('GET', `/api/v1/projects/${id}/deletion-impact`, undefined, undefined, isDeletionImpact),
    archiveProject: (id, key) =>
      ask('POST', `/api/v1/projects/${id}/archive`, undefined, key, isProject),
    unarchiveProject: (id, key) =>
      ask('POST', `/api/v1/projects/${id}/unarchive`, undefined, key, isProject),
    archiveCompleted: (id, key) =>
      ask('POST', `/api/v1/projects/${id}/archive-completed`, undefined, key, isCount),
    listColumns: (projectId) =>
      ask('GET', `/api/v1/projects/${projectId}/columns`, undefined, undefined, isColumnPage),
    createColumn: (projectId, name, key) =>
      ask('POST', `/api/v1/projects/${projectId}/columns`, { name }, key, isColumn),
    updateColumn: (projectId, columnId, body) =>
      ask('PATCH', `/api/v1/projects/${projectId}/columns/${columnId}`, body, undefined, isColumn),
    async deleteColumn(projectId, columnId) {
      await ask(
        'DELETE',
        `/api/v1/projects/${projectId}/columns/${columnId}`,
        undefined,
        undefined,
        isEmpty,
      );
    },
    projectData: (id) =>
      ask('GET', `/api/v1/projects/${id}/data`, undefined, undefined, isProjectData),
    taskDetail: (id) => ask('GET', `/api/v1/tasks/${id}`, undefined, undefined, isTaskDetail),
    patchTask: (id, body) => ask('PATCH', `/api/v1/tasks/${id}`, body, undefined, isTask),
    async deleteTask(id) {
      await ask('DELETE', `/api/v1/tasks/${id}`, undefined, undefined, isEmpty);
    },
    moveTask: (id, projectId, columnId) =>
      ask(
        'POST',
        `/api/v1/tasks/${id}/move`,
        { project_id: projectId, ...(columnId === undefined ? {} : { column_id: columnId }) },
        undefined,
        isTask,
      ),
    duplicateTask: (id, key) =>
      ask('POST', `/api/v1/tasks/${id}/duplicate`, undefined, key, isTask),
    cancelTask: (id) => ask('POST', `/api/v1/tasks/${id}/cancel`, undefined, undefined, isTask),
    batchTasks: (body) => ask('POST', '/api/v1/tasks/batch', body, undefined, isCount),
    listTrash: () => ask('GET', '/api/v1/tasks/trash', undefined, undefined, isTaskPage),
    emptyTrash: () => ask('DELETE', '/api/v1/tasks/trash', undefined, undefined, isCount),
    async purgeTask(id) {
      await ask('DELETE', `/api/v1/tasks/trash/${id}`, undefined, undefined, isEmpty);
    },
    restoreTask: (id) =>
      ask('POST', `/api/v1/tasks/trash/${id}/restore`, undefined, undefined, isTask),
    snoozeTask: (id, preset, date) =>
      ask(
        'POST',
        `/api/v1/tasks/${id}/snooze`,
        { preset, ...(date === undefined ? {} : { date }) },
        undefined,
        isTask,
      ),
    detachOccurrence: (id, dueDate) =>
      ask(
        'POST',
        `/api/v1/tasks/${id}/occurrences/detach`,
        { due_date: dueDate },
        undefined,
        isTask,
      ),
    occurrences: (id) =>
      ask('GET', `/api/v1/tasks/${id}/occurrences`, undefined, undefined, isOccurrencePage),
    listReminders: (id) =>
      ask('GET', `/api/v1/tasks/${id}/reminders`, undefined, undefined, isReminderList),
    createReminder: (id, body, key) =>
      ask('POST', `/api/v1/tasks/${id}/reminders`, body, key, isReminder),
    async deleteReminder(id, reminderId) {
      await ask(
        'DELETE',
        `/api/v1/tasks/${id}/reminders/${reminderId}`,
        undefined,
        undefined,
        isEmpty,
      );
    },
    createChecklistItem: (id, title, key) =>
      ask('POST', `/api/v1/tasks/${id}/items`, { title }, key, isChecklistItem),
    completeChecklistItem: (id, itemId) =>
      ask(
        'POST',
        `/api/v1/tasks/${id}/items/${itemId}/complete`,
        undefined,
        undefined,
        isChecklistItem,
      ),
    async deleteChecklistItem(id, itemId) {
      await ask('DELETE', `/api/v1/tasks/${id}/items/${itemId}`, undefined, undefined, isEmpty);
    },
    listTaskLinks: (id) =>
      ask('GET', `/api/v1/tasks/${id}/links`, undefined, undefined, isTaskLinkPage),
    addTaskLink: (id, body) =>
      ask('POST', `/api/v1/tasks/${id}/links`, body, undefined, isTaskLink),
    async removeTaskLink(id, linkId) {
      await ask('DELETE', `/api/v1/tasks/${id}/links/${linkId}`, undefined, undefined, isEmpty);
    },
    listAttachments: (id) =>
      ask('GET', `/api/v1/tasks/${id}/attachments`, undefined, undefined, isAttachmentPage),
    uploadAttachment: (id, file, fileName) => upload(http, id, file, fileName),
    dashboardData: () => ask('GET', '/api/v1/dashboard/data', undefined, undefined, isJsonObject),
    dashboardLayout: () => ask('GET', '/api/v1/me/dashboard', undefined, undefined, isJsonObject),
    saveDashboardLayout: (body) =>
      ask('PATCH', '/api/v1/me/dashboard', body, undefined, isJsonObject),
    statsOverview: (query) =>
      ask('GET', `/api/v1/stats/overview?${query}`, undefined, undefined, isStatsOverview),
    statsTasks: (query) =>
      ask('GET', `/api/v1/stats/tasks?${query}`, undefined, undefined, isStatsTasks),
    statsFocus: (query) =>
      ask('GET', `/api/v1/stats/focus?${query}`, undefined, undefined, isStatsFocus),
    statsHabits: (query) =>
      ask('GET', `/api/v1/stats/habits?${query}`, undefined, undefined, isStatsHabits),
    statsExport: (query) => downloadStatistics(http, query),
    statsAchievement: () =>
      ask('GET', '/api/v1/stats/achievement', undefined, undefined, isStatsAchievement),
    weeklyReports: () => ask('GET', '/api/v1/reports/weekly', undefined, undefined, isJsonObject),
    weeklyReport: (week) =>
      ask(
        'GET',
        `/api/v1/reports/weekly/${encodeURIComponent(week)}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    buildWeeklyReport: () =>
      ask('POST', '/api/v1/reports/weekly', undefined, undefined, isJsonObject),
    reviewDaily: () => ask('GET', '/api/v1/review/daily', undefined, undefined, isJsonObject),
    reviewWeekly: () => ask('GET', '/api/v1/review/weekly', undefined, undefined, isJsonObject),
    startPlan: (body) => ask('POST', '/api/v1/planning/sessions', body, undefined, isJsonObject),
    planSession: (id) =>
      ask('GET', `/api/v1/planning/sessions/${id}`, undefined, undefined, isJsonObject),
    decidePlan: (id, taskId, body) =>
      ask(
        'PUT',
        `/api/v1/planning/sessions/${id}/decisions/${taskId}`,
        body,
        undefined,
        isJsonObject,
      ),
    clearPlanDecision: (id, taskId) =>
      ask(
        'DELETE',
        `/api/v1/planning/sessions/${id}/decisions/${taskId}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    applyPlan: (id, body, key) =>
      ask('POST', `/api/v1/planning/sessions/${id}/apply`, body, key, isJsonObject),
    dayPlan: (date, timeZone) =>
      ask(
        'GET',
        `/api/v1/plans?date=${encodeURIComponent(date)}&time_zone=${encodeURIComponent(timeZone)}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    calendarEvents: (from, to, context) =>
      ask(
        'GET',
        `/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${context === undefined ? '' : `&context=${encodeURIComponent(context)}`}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    listGoogleCalendars: () =>
      ask('GET', '/api/v1/calendar/google/calendars', undefined, undefined, isJsonList),
    listCalendarSubscriptions: () =>
      ask('GET', '/api/v1/calendar/subscriptions', undefined, undefined, isJsonObject),
    createCalendarSubscription: (body) =>
      ask('POST', '/api/v1/calendar/subscriptions', body, crypto.randomUUID(), isJsonObject),
    updateCalendarSubscription: (id, body) =>
      ask('PATCH', `/api/v1/calendar/subscriptions/${id}`, body, crypto.randomUUID(), isJsonObject),
    refreshCalendarSubscription: (id) =>
      ask(
        'POST',
        `/api/v1/calendar/subscriptions/${id}/refresh`,
        undefined,
        undefined,
        isJsonObject,
      ),
    async deleteCalendarSubscription(id) {
      await ask('DELETE', `/api/v1/calendar/subscriptions/${id}`, undefined, undefined, isEmpty);
    },
    syncCalendars: () => ask('POST', '/api/v1/calendar/sync', undefined, undefined, isJsonObject),
    matrixRules: () => ask('GET', '/api/v1/matrix/rules', undefined, undefined, isJsonObject),
    saveMatrixRule: (body) => ask('PUT', '/api/v1/matrix/rules', body, undefined, isJsonObject),
    getViewPreferences: (key) =>
      ask(
        'GET',
        `/api/v1/me/view-preferences/${encodeURIComponent(key)}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    putViewPreferences: (key, body) =>
      ask(
        'PUT',
        `/api/v1/me/view-preferences/${encodeURIComponent(key)}`,
        body,
        undefined,
        isJsonObject,
      ),
    oauthRenewals: () =>
      ask('GET', '/api/v1/me/oauth/renewals', undefined, undefined, isJsonObject),
    oauthGrants: () => ask('GET', '/api/v1/me/oauth/grants', undefined, undefined, isJsonObject),
    revokeOauthGrant: async (id) => {
      await ask('POST', `/api/v1/me/oauth/grants/${id}/revoke`, undefined, undefined, isEmpty);
    },
    oauthGrantActivity: (id, cursor) =>
      ask(
        'GET',
        `/api/v1/me/oauth/grants/${id}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    startFocus: (body = {}) => ask('POST', '/api/v1/focus/sessions', body, undefined, isJsonObject),
    listFocusSessions: (status, cursor) =>
      ask(
        'GET',
        `/api/v1/focus/sessions?${new URLSearchParams({ ...(status ? { status } : {}), ...(cursor ? { cursor } : {}) })}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    focusStats: () => ask('GET', '/api/v1/focus/stats', undefined, undefined, isJsonObject),
    pauseFocus: (id) =>
      ask('POST', `/api/v1/focus/sessions/${id}/pause`, undefined, undefined, isJsonObject),
    resumeFocus: (id) =>
      ask('POST', `/api/v1/focus/sessions/${id}/resume`, undefined, undefined, isJsonObject),
    finishFocus: (id) =>
      ask('POST', `/api/v1/focus/sessions/${id}/finish`, undefined, undefined, isJsonObject),
    abortFocus: (id) =>
      ask('POST', `/api/v1/focus/sessions/${id}/abort`, undefined, undefined, isJsonObject),
    registerPushSubscription: (body) =>
      ask('POST', '/api/v1/me/push-subscriptions', body, undefined, isJsonObject),
    notificationAction: (id, body) =>
      ask('POST', `/api/v1/reminders/${id}/action`, body, undefined, isJsonObject),
    getNotificationSettings: () =>
      ask('GET', '/api/v1/me/notifications/settings', undefined, undefined, isJsonObject),
    updateNotificationSettings: (body) =>
      ask('PUT', '/api/v1/me/notifications/settings', body, undefined, isJsonObject),
    testNotification: (channel) =>
      ask('POST', '/api/v1/me/notifications/test', { channel }, undefined, isJsonObject),
    notificationDeliveries: (cursor) =>
      ask(
        'GET',
        `/api/v1/me/notifications/deliveries${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    getHealth: () => ask('GET', '/api/v1/health', undefined, undefined, isJsonObject),
    getFocusSettings: () =>
      ask('GET', '/api/v1/focus/settings', undefined, undefined, isJsonObject),
    updateFocusSettings: (body) =>
      ask('PUT', '/api/v1/focus/settings', body, undefined, isJsonObject),
    listNotes: () => ask('GET', '/api/v1/notes', undefined, undefined, isJsonObject),
    listStickies: () => ask('GET', '/api/v1/sticky-notes', undefined, undefined, isJsonObject),
    createSticky: (text) => ask('POST', '/api/v1/sticky-notes', { text }, undefined, isJsonObject),
    integrationStatus: (kind) =>
      ask('GET', `/api/v1/integrations/${kind}`, undefined, undefined, isJsonObject),
    configureTelegram: (token, force = false) =>
      ask(
        'PUT',
        '/api/v1/integrations/telegram/settings',
        { token, force },
        undefined,
        isJsonObject,
      ),
    // wt-c
    async removeTelegramBot() {
      await ask('DELETE', '/api/v1/integrations/telegram/settings', undefined, undefined, isEmpty);
    },
    retryTelegramWebhook: () =>
      ask(
        'POST',
        '/api/v1/integrations/telegram/settings/retry',
        undefined,
        undefined,
        isJsonObject,
      ),
    createTelegramPairing: () =>
      ask('POST', '/api/v1/integrations/telegram/pairing', undefined, undefined, isJsonObject),
    setGoogleService: (service, enabled) =>
      ask(
        'PATCH',
        `/api/v1/integrations/google/services/${service}`,
        { enabled },
        undefined,
        isJsonObject,
      ),
    googleConnect: (service = 'all') =>
      ask(
        'GET',
        `/api/v1/integrations/google/start?service=${service}`,
        undefined,
        undefined,
        isJsonObject,
      ),
    listWebhooks: () => ask('GET', '/api/v1/webhooks', undefined, undefined, isJsonObject),
    createWebhook: (body) => ask('POST', '/api/v1/webhooks', body, undefined, isJsonObject),
    updateWebhook: (id, body) =>
      ask('PATCH', `/api/v1/webhooks/${id}`, body, undefined, isJsonObject),
    rotateWebhook: (id) =>
      ask('POST', `/api/v1/webhooks/${id}/rotate`, undefined, undefined, isJsonObject),
    pingWebhook: (id) =>
      ask('POST', `/api/v1/webhooks/${id}/ping`, undefined, undefined, isJsonObject),
    async deleteWebhook(id) {
      await ask('DELETE', `/api/v1/webhooks/${id}`, undefined, undefined, isEmpty);
    },
    listAutomations: () => ask('GET', '/api/v1/automations', undefined, undefined, isJsonObject),
    createAutomation: (body) => ask('POST', '/api/v1/automations', body, undefined, isJsonObject),
    updateAutomation: (id, body) =>
      ask('PATCH', `/api/v1/automations/${id}`, body, undefined, isJsonObject),
    async deleteAutomation(id) {
      await ask('DELETE', `/api/v1/automations/${id}`, undefined, undefined, isEmpty);
    },
    listPlugins: () => ask('GET', '/api/v1/plugins', undefined, undefined, isJsonObject),
    async deleteAccount(confirmation) {
      await ask('DELETE', '/api/v1/me', { confirmation }, undefined, isEmpty);
    },
    exportJson: () => ask('GET', '/api/v1/export/json', undefined, undefined, isJsonObject),
    listBackups: () => ask('GET', '/api/v1/backups', undefined, undefined, isJsonObject),
    restoreBackup: (stamp) =>
      ask(
        'POST',
        '/api/v1/backups/restore',
        { stamp, confirmation: 'restore' },
        undefined,
        isJsonObject,
      ),
    achievements: () => ask('GET', '/api/v1/me/achievements', undefined, undefined, isJsonObject),
    setAchievements: (enabled) =>
      ask('PATCH', '/api/v1/me/achievements', { enabled }, undefined, isJsonObject),
    beginTotp: () => ask('POST', '/api/v1/me/totp', undefined, undefined, isJsonObject),
    totpStatus: () => ask('GET', '/api/v1/me/totp', undefined, undefined, isTotpStatus),
    confirmTotp: (code) =>
      ask('POST', '/api/v1/me/totp/confirm', { code }, undefined, isJsonObject),
    async cancelTotp() {
      await ask('DELETE', '/api/v1/me/totp/pending', undefined, undefined, isEmpty);
    },
    async changePassword(currentPassword, newPassword) {
      await ask(
        'POST',
        '/api/v1/me/password',
        { current_password: currentPassword, new_password: newPassword },
        undefined,
        isEmpty,
      );
    },
    reportLocation: (lat, lon) =>
      ask('POST', '/api/v1/me/location', { lat, lon }, undefined, isJsonObject),
    createCalendarFeed: (projectId) =>
      ask('POST', '/api/v1/calendar/feeds', { project_id: projectId }, undefined, isJsonObject),
    listCalendarFeeds: () =>
      ask('GET', '/api/v1/calendar/feeds', undefined, undefined, isJsonObject),
    rotateCalendarFeed: (id) =>
      ask('POST', `/api/v1/calendar/feeds/${id}/rotate`, undefined, undefined, isJsonObject),
    async revokeCalendarFeed(id) {
      await ask('DELETE', `/api/v1/calendar/feeds/${id}`, undefined, undefined, isEmpty);
    },
    async disconnectGoogle(options) {
      await ask(
        'DELETE',
        `/api/v1/integrations/google${options?.removeImportedEvents ? '?remove_imported_events=true' : ''}`,
        undefined,
        undefined,
        isEmpty,
      );
    },
    recheckTelegram: () =>
      ask('POST', '/api/v1/integrations/telegram/recheck', undefined, undefined, isJsonObject),
    async disconnectTelegram() {
      await ask('DELETE', '/api/v1/integrations/telegram', undefined, undefined, isEmpty);
    },
    listMembers: (projectId) =>
      ask('GET', `/api/v1/projects/${projectId}/members`, undefined, undefined, isJsonObject),
    addMember: (projectId, email, permission) =>
      ask(
        'POST',
        `/api/v1/projects/${projectId}/members`,
        { email, permission },
        undefined,
        isJsonObject,
      ),
  };
}

async function upload(http: Http, id: string, file: Blob, fileName: string): Promise<Attachment> {
  const body = new FormData();
  body.append('file', file, fileName);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (http.options.devUserEmail !== undefined && http.options.devUserEmail.length > 0) {
    headers['X-Dev-User-Email'] = http.options.devUserEmail;
  }
  const prefix = http.options.baseUrl.replace(/\/$/, '');
  const response = await http.call(`${prefix}/api/v1/tasks/${id}/attachments`, {
    method: 'POST',
    headers,
    body,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, 'request_failed', 'Request failed');
  }
  if (!isAttachment(payload)) {
    throw new ApiError(response.status, 'request_failed', 'Response does not match the API');
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMe(value: unknown): value is Me {
  return isRecord(value) && typeof value.id === 'string' && typeof value.email === 'string';
}

function isWorkContext(value: unknown): value is WorkContext {
  return (
    isRecord(value) &&
    Array.isArray(value.work_days) &&
    typeof value.hide_work_outside_hours === 'boolean' &&
    typeof value.work_hidden_now === 'boolean'
  );
}

function isInboundStatus(value: unknown): value is InboundEmailStatus {
  return isRecord(value) && typeof value.active === 'boolean';
}

function isInboundAddress(value: unknown): value is InboundEmailAddress {
  return isRecord(value) && typeof value.address === 'string' && typeof value.token === 'string';
}

function isTag(value: unknown): value is Tag {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isTagPage(value: unknown): value is TagPage {
  return isRecord(value) && Array.isArray(value.items);
}

function isFolder(value: unknown): value is Folder {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isFolderPage(value: unknown): value is FolderPage {
  return isRecord(value) && Array.isArray(value.items);
}

function isProject(value: unknown): value is Project {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.is_inbox === 'boolean'
  );
}

function isProjectOverview(value: unknown): value is ProjectOverview {
  return isRecord(value) && Array.isArray(value.items) && isRecord(value.counts);
}

function isProjectReview(value: unknown): value is ProjectReviewResult {
  return isRecord(value) && typeof value.reviewed === 'number';
}

function isDeletionImpact(value: unknown): value is DeletionImpact {
  return (
    isRecord(value) &&
    typeof value.project_id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.task_count === 'number'
  );
}

function isColumn(value: unknown): value is Column {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isColumnPage(value: unknown): value is ColumnPage {
  return isRecord(value) && Array.isArray(value.items);
}

function isProjectData(value: unknown): value is ProjectData {
  return (
    isRecord(value) &&
    isProject(value.project) &&
    Array.isArray(value.columns) &&
    Array.isArray(value.tasks)
  );
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.status === 'string'
  );
}

function isTaskPage(value: unknown): value is { items: Task[]; next_cursor: string | null } {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    (value.next_cursor === null || typeof value.next_cursor === 'string')
  );
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.status === 'active' || value.status === 'completed')
  );
}

function isActivity(value: unknown): value is ActivityEntry {
  return isRecord(value) && typeof value.id === 'string' && typeof value.action === 'string';
}

function isTaskDetail(value: unknown): value is TaskDetail {
  if (!isTask(value)) {
    return false;
  }
  const row = value as unknown as Record<string, unknown>;
  return (
    Array.isArray(row.items) &&
    Array.isArray(row.subtasks) &&
    Array.isArray(row.activity) &&
    row.items.every(isChecklistItem) &&
    row.subtasks.every(isTask) &&
    row.activity.every(isActivity)
  );
}

function isReminder(value: unknown): value is Reminder {
  return isRecord(value) && typeof value.id === 'string' && typeof value.trigger === 'string';
}

function isReminderList(value: unknown): value is Reminder[] {
  return Array.isArray(value) && value.every(isReminder);
}

function isOccurrencePage(value: unknown): value is OccurrencePage {
  return isRecord(value) && Array.isArray(value.occurrences);
}

function isAttachment(value: unknown): value is Attachment {
  return isRecord(value) && typeof value.id === 'string' && typeof value.file_name === 'string';
}

function isAttachmentPage(value: unknown): value is AttachmentPage {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isAttachment);
}

function isCount(value: unknown): value is CountResult {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.deleted === 'number' ||
    typeof value.updated === 'number' ||
    typeof value.archived === 'number'
  );
}

function isTotpStatus(value: unknown): value is { enabled: boolean } {
  return isJsonObject(value) && typeof value.enabled === 'boolean';
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonList(value: unknown): value is readonly JsonObject[] {
  return Array.isArray(value) && value.every(isJsonObject);
}

function isEmpty(value: unknown): value is void {
  return value === undefined;
}

/** RF-2324: authenticated download, including development headers like all SDK calls. */
async function downloadStatistics(http: Http, query: string): Promise<Blob> {
  const headers: Record<string, string> = { accept: 'text/csv, application/json' };
  if (http.options.devUserEmail) headers['X-Dev-User-Email'] = http.options.devUserEmail;
  const init: RequestInit = { headers };
  if (http.options.credentials) init.credentials = http.options.credentials;
  const response = await http.call(
    `${http.options.baseUrl.replace(/\/$/, '')}/api/v1/stats/export?${query}`,
    init,
  );
  if (!response.ok) throw new ApiError(response.status, 'export_failed', 'Export failed');
  return response.blob();
}

export type StatsOverview =
  operations['StatsController_overview']['responses'][200]['content']['application/json'];
function isStatsOverview(value: unknown): value is StatsOverview {
  return isRecord(value) && 'summary' in value;
}

export type StatsTasks =
  operations['StatsController_tasks']['responses'][200]['content']['application/json'];
function isStatsTasks(value: unknown): value is StatsTasks {
  return isRecord(value) && 'completion_rate' in value;
}

export type StatsFocus =
  operations['StatsController_focus']['responses'][200]['content']['application/json'];
function isStatsFocus(value: unknown): value is StatsFocus {
  return isRecord(value) && 'focus_minutes' in value;
}

export type StatsHabits =
  operations['StatsController_habits']['responses'][200]['content']['application/json'];
function isStatsHabits(value: unknown): value is StatsHabits {
  return isRecord(value) && 'habits' in value;
}

export type StatsAchievement =
  operations['StatsController_achievement']['responses'][200]['content']['application/json'];
function isStatsAchievement(value: unknown): value is StatsAchievement {
  return isRecord(value) && 'enabled' in value;
}

function isTaskLink(value: unknown): value is TaskLink {
  if (!isJsonObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.task_id === 'string' &&
    typeof value.url === 'string' &&
    (value.title === null || typeof value.title === 'string') &&
    typeof value.source === 'string' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  );
}
function isTaskLinkPage(value: unknown): value is TaskLinkPage {
  return (
    isJsonObject(value) &&
    Array.isArray(value.items) &&
    value.items.every(isTaskLink) &&
    (value.next_cursor === null || typeof value.next_cursor === 'string')
  );
}
