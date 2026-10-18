import { missingScopes } from '../auth/scopes';

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
const name = { type: 'string', minLength: 1 };

/**
 * Tools for resources that already exist. Notes are V1 and are not exposed.
 * A tool is visible only when the caller holds every scope it declares (RF-2001).
 */
export const MCP_TOOLS: readonly McpTool[] = [
  {
    name: 'list_tasks',
    description: 'List active tasks.',
    scopes: ['tasks:read'],
    inputSchema: objectSchema({ limit, project_id: id }),
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
    inputSchema: objectSchema({ limit }),
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
    inputSchema: objectSchema({ limit }),
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
    inputSchema: objectSchema({ limit }),
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
    inputSchema: objectSchema({ key: { type: 'string', minLength: 1 }, limit }, ['key']),
  },
  {
    name: 'list_habits',
    description: 'List habits.',
    scopes: ['habits:read'],
    inputSchema: objectSchema({ limit }),
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
