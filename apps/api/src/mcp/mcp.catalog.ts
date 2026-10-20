import { missingScopes } from '../auth/scopes.js';

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly scopes: readonly string[];
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
    readonly additionalProperties: false;
  };
}

const objectSchema = (
  properties: Readonly<Record<string, unknown>>,
  required?: readonly string[],
): McpTool['inputSchema'] => ({
  type: 'object',
  properties,
  ...(required === undefined ? {} : { required }),
  additionalProperties: false,
});

const id = { type: 'string', format: 'uuid' };
const limit = { type: 'integer', minimum: 1, maximum: 100 };
const cursor = { type: 'string', minLength: 1 };
const name = { type: 'string', minLength: 1 };

/**
 * Single catalog of MCP tools. A tool is visible only when the caller holds
 * every scope it declares (RF-2001). Listings that return next_cursor accept
 * the same cursor string as API v1.
 */
export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: 'list_tasks',
    description:
      'List active tasks. start_date is when you plan to do the task. due_date is the deadline. Tasks with only due_date still appear on that day. someday=true lists Someday; the default excludes them.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ limit, cursor, project_id: id, someday: { type: 'boolean' } }),
  },
  {
    name: 'get_task',
    description: 'Read one task.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'create_task',
    description:
      'Create a task. project_id defaults to the inbox. start_date is when (the day you plan to do it). due_date is the deadline. A task with only due_date behaves as before. someday parks it out of Today. evening_only reserves it for this evening.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        title: { type: 'string', minLength: 1, maxLength: 500 },
        project_id: id,
        due_date: { type: 'string' },
        start_date: { type: 'string' },
        is_all_day: { type: 'boolean' },
        duration_minutes: { type: 'integer', minimum: 0, maximum: 1440 },
        priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        someday: { type: 'boolean' },
        evening_only: { type: 'boolean' },
      },
      ['title'],
    ),
  },
  {
    name: 'complete_task',
    description: 'Mark a task complete. Does not materialize the next occurrence.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'update_task',
    description:
      'Update a task. start_date is when you plan to do it. due_date is the deadline and may be cleared without changing when. someday=true clears when and keeps the deadline.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        id,
        title: { type: 'string', minLength: 1, maxLength: 500 },
        due_date: { type: ['string', 'null'] },
        start_date: { type: ['string', 'null'] },
        is_all_day: { type: 'boolean' },
        duration_minutes: { type: ['integer', 'null'], minimum: 0, maximum: 1440 },
        priority: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        someday: { type: 'boolean' },
        evening_only: { type: 'boolean' },
      },
      ['id'],
    ),
  },
  {
    name: 'get_day_load',
    description:
      'Day load for a morning briefing. Counts active tasks (duration or the default estimate) plus external events overlapping the workday. Evening and Someday tasks do not count. All-day events count as zero. available_minutes is null when the workday is off.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({
      date: { type: 'string' },
      time_zone: { type: 'string' },
    }),
  },
  {
    name: 'start_day_shutdown',
    description:
      'Open a shutdown session for today or yesterday. Returns what was finished and the pending queue. Nothing changes until apply_day_shutdown.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({
      local_date: { type: 'string' },
      time_zone: { type: 'string' },
    }),
  },
  {
    name: 'record_shutdown_decision',
    description:
      'Record one shutdown decision: done, plan_day, later, someday, cancel, trash, or skip. plan_day and later take target_date.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      {
        session_id: id,
        task_id: id,
        decision: {
          type: 'string',
          enum: ['done', 'plan_day', 'later', 'someday', 'cancel', 'trash', 'skip'],
        },
        target_date: { type: 'string' },
        evening: { type: 'boolean' },
      },
      ['session_id', 'task_id', 'decision'],
    ),
  },
  {
    name: 'apply_day_shutdown',
    description:
      'Apply a shutdown session. Same idempotency key returns the same result. A stale expected_revision returns revision_conflict.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      { session_id: id, expected_revision: { type: 'integer', minimum: 1 }, idempotency_key: { type: 'string' } },
      ['session_id', 'expected_revision', 'idempotency_key'],
    ),
  },
  {
    name: 'replan_day',
    description:
      'Propose where leftover tasks should go. auto_apply defaults to false so a person can confirm before anything moves. Does not place calendar blocks.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema({
      date: { type: 'string' },
      auto_apply: { type: 'boolean' },
      idempotency_key: { type: 'string' },
      decisions: { type: 'array' },
    }),
  },
  {
    name: 'list_projects',
    description: 'List task lists.',
    scopes: ['lists:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_project',
    description: 'Create a task list.',
    scopes: ['lists:write'],
    inputSchema: objectSchema({ name }, ['name']),
  },
  {
    name: 'list_tags',
    description: 'List tags.',
    scopes: ['tags:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_tag',
    description: 'Create a tag.',
    scopes: ['tags:write'],
    inputSchema: objectSchema({ name }, ['name']),
  },
  {
    name: 'list_filters',
    description: 'List saved filters.',
    scopes: ['filters:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_filter',
    description: 'Save a normal filter that matches a keyword.',
    scopes: ['filters:write'],
    inputSchema: objectSchema({ name, keyword: { type: 'string', minLength: 1 } }, [
      'name',
      'keyword',
    ]),
  },
  {
    name: 'list_smart_lists',
    description: 'List system smart lists.',
    scopes: ['filters:read'],
    inputSchema: objectSchema({}),
  },
  {
    name: 'list_smart_list_tasks',
    description: 'List tasks in one smart list.',
    scopes: ['filters:read'],
    inputSchema: objectSchema({ key: { type: 'string', minLength: 1 }, limit, cursor }, ['key']),
  },
  {
    name: 'list_habits',
    description: 'List habits.',
    scopes: ['habits:read'],
    inputSchema: objectSchema({ limit, cursor }),
  },
  {
    name: 'create_habit',
    description: 'Create a daily habit.',
    scopes: ['habits:write'],
    inputSchema: objectSchema({ name }, ['name']),
  },
  {
    name: 'check_in_habit',
    description: 'Record a habit check-in for a date.',
    scopes: ['habits:write'],
    inputSchema: objectSchema(
      { id, date: { type: 'string' }, count: { type: 'integer', minimum: 0 } },
      ['id', 'date'],
    ),
  },
  {
    name: 'list_countdowns',
    description:
      'List countdowns. days and effective_date are already calculated in the user timezone.',
    scopes: ['countdowns:read'],
    inputSchema: objectSchema({
      archived: { type: 'boolean' },
      limit,
      cursor,
      due_within_days: { type: 'integer', minimum: 0 },
    }),
  },
  {
    name: 'get_countdown',
    description: 'Read one countdown with days calculated in the user timezone.',
    scopes: ['countdowns:read'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'create_countdown',
    description: 'Create a countdown. Returned days are calculated in the user timezone.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema(
      {
        title: name,
        target_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        type: { type: 'string' },
        emoji: { type: 'string' },
        color: { type: 'string' },
        repeat: { type: 'string' },
        day_mode: { type: 'string' },
        reminders: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 365 } },
        notes: { type: 'string' },
        show_in_sidebar: { type: 'boolean' },
        show_in_smart_list: { type: 'boolean' },
      },
      ['title', 'target_date'],
    ),
  },
  {
    name: 'update_countdown',
    description: 'Update a countdown.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema(
      {
        id,
        title: name,
        target_date: { type: 'string' },
        pinned: { type: 'boolean' },
        archived: { type: 'boolean' },
      },
      ['id'],
    ),
  },
  {
    name: 'delete_countdown',
    description: 'Soft-delete a countdown.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'archive_countdown',
    description: 'Archive a countdown and stop its reminders.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'unarchive_countdown',
    description: 'Unarchive a countdown.',
    scopes: ['countdowns:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'search',
    description: 'Search tasks, lists and tags.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ q: { type: 'string' } }, ['q']),
  },
  {
    name: 'list_notes',
    description: 'List notes.',
    scopes: ['notes:read'],
    inputSchema: objectSchema({ limit }),
  },
  {
    name: 'pin_sticky_note',
    description: 'Pin a sticky note.',
    scopes: ['notes:write'],
    inputSchema: objectSchema({ text: { type: 'string', minLength: 1, maxLength: 4000 } }, [
      'text',
    ]),
  },
  {
    name: 'dashboard_snapshot',
    description: 'Read the dashboard KPIs.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({}),
  },
  {
    name: 'start_focus',
    description: 'Start a server-side focus session.',
    scopes: ['focus:write'],
    inputSchema: objectSchema({ minutes: { type: 'integer', minimum: 1, maximum: 180 } }),
  },
  {
    name: 'review_daily',
    description: 'Propose a daily review. The tool does not apply it.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({}),
  },
  {
    name: 'list_external_calendars',
    description:
      'List read-only external calendars. Events cannot be edited. With include_available, also list Google calendars that can be added. Times elsewhere are ISO 8601 with an offset.',
    scopes: ['calendar:read'],
    inputSchema: objectSchema({ include_available: { type: 'boolean' } }),
  },
  {
    name: 'list_calendar_events',
    description:
      'List tasks and read-only external events in a range. External events cannot be edited. Times are ISO 8601 with an offset, in the user time zone when the event is all-day.',
    scopes: ['calendar:read'],
    inputSchema: objectSchema(
      {
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        include_external: { type: 'boolean' },
        subscription_id: id,
      },
      ['from', 'to'],
    ),
  },
  {
    name: 'add_external_calendar',
    description:
      'Subscribe to a Google calendar or an iCal URL and run the initial read-only sync. External events cannot be edited.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema(
      {
        provider: { type: 'string', enum: ['google', 'ical'] },
        calendar_id: { type: 'string', minLength: 1, maxLength: 1024 },
        url: { type: 'string', minLength: 1, maxLength: 2000 },
        color: { type: 'string' },
        visible: { type: 'boolean' },
      },
      ['provider'],
    ),
  },
  {
    name: 'sync_calendar',
    description:
      'Sync one external calendar, or every external calendar when subscription_id is omitted. Read-only for Google events.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema({ subscription_id: id }),
  },
  {
    name: 'update_external_calendar',
    description: 'Rename, recolor or hide an external calendar. Hiding keeps the events stored.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema(
      {
        id,
        summary: { type: 'string', minLength: 1, maxLength: 200 },
        color: { type: 'string' },
        visible: { type: 'boolean' },
      },
      ['id'],
    ),
  },
  {
    name: 'remove_external_calendar',
    description: 'Soft-delete an external calendar and its events.',
    scopes: ['calendar:write'],
    inputSchema: objectSchema({ id }, ['id']),
  },
];

export function findTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export function visibleTools(scopes: readonly string[]): readonly McpTool[] {
  return MCP_TOOLS.filter((tool) => missingScopes(scopes, tool.scopes).length === 0);
}
