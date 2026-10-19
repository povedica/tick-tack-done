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
    description: 'List active tasks.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ limit, cursor, project_id: id }),
  },
  {
    name: 'get_task',
    description: 'Read one task.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ id }, ['id']),
  },
  {
    name: 'create_task',
    description: 'Create a task. project_id defaults to the inbox.',
    scopes: ['tasks:write'],
    inputSchema: objectSchema(
      { title: { type: 'string', minLength: 1, maxLength: 500 }, project_id: id },
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
];

export function findTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

export function visibleTools(scopes: readonly string[]): readonly McpTool[] {
  return MCP_TOOLS.filter((tool) => missingScopes(scopes, tool.scopes).length === 0);
}
