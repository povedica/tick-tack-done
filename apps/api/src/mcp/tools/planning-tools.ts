import { civilDateKey, shiftCivilDate, PLAN_ACTIONS } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { requestPublicApi } from '../mcp-api.js';
import type { McpTool } from '../mcp.catalog.js';
import { DomainException } from '../../http/domain.exception.js';
import { HttpStatus } from '@nestjs/common';
const id = { type: 'string', format: 'uuid' };
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const schema = (
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[] = [],
): McpTool['inputSchema'] => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export const planningTools: readonly McpTool[] = [
  {
    name: 'get_day_plan',
    description: 'Read the day plan. Dates use the profile time zone.',
    scopes: ['tasks:read'],
    inputSchema: schema({ date }),
  },
  {
    name: 'start_day_plan',
    description:
      'Open or resume a single day-planning draft for today or the following thirteen days. No tasks change until confirmation.',
    scopes: ['tasks:write'],
    inputSchema: schema({ date, inbox: { type: 'boolean' }, undated: { type: 'boolean' } }),
  },
  {
    name: 'record_plan_decision',
    description:
      'Record one occurrence decision without changing the task. today/tomorrow/move change start date, never deadline. Duration is written only when chosen or a time is supplied.',
    scopes: ['tasks:write'],
    inputSchema: schema(
      {
        session_id: id,
        task_id: id,
        action: { type: 'string', enum: PLAN_ACTIONS },
        date,
        time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
        duration: { type: 'integer', minimum: 5, maximum: 480 },
      },
      ['session_id', 'task_id', 'action'],
    ),
  },
  {
    name: 'apply_day_plan',
    description:
      'Preview by default (auto_apply=false). Explicit auto_apply=true confirms the reviewed revision using an idempotency key. Zero changes returns nothing_to_apply.',
    scopes: ['tasks:write'],
    inputSchema: schema(
      {
        session_id: id,
        auto_apply: { type: 'boolean', default: false },
        expected_revision: { type: 'integer', minimum: 1 },
        idempotency_key: { type: 'string', minLength: 1 },
      },
      ['session_id'],
    ),
  },
  {
    name: 'revert_day_plan',
    description:
      'Undo a confirmed plan using its operation_id. Idempotent; returns a conflict if a task changed after confirmation.',
    scopes: ['tasks:write'],
    inputSchema: schema({ operation_id: id }, ['operation_id']),
  },
];
export function isPlanningTool(name: string): boolean {
  return (
    planningTools.some((t) => t.name === name) || name === 'get_day_load' || name === 'replan_day'
  );
}
export async function callPlanningTool(
  name: string,
  args: Record<string, unknown>,
  user: AuthUser,
  authorization: string | undefined,
): Promise<unknown> {
  const today = civilDateKey(new Date().toISOString(), user.timeZone) ?? '';
  const selected = typeof args.date === 'string' ? args.date : today;
  const ask = async (method: string, path: string, body?: unknown, key?: string) => {
    const response = await requestPublicApi(
      {
        method,
        path,
        ...(body === undefined ? {} : { body }),
        ...(key === undefined ? {} : { idempotency_key: key }),
      },
      authorization,
    );
    return response && typeof response === 'object' && 'data' in response
      ? response.data
      : response;
  };
  if (name === 'get_day_plan')
    return ask(
      'GET',
      `/api/v1/plans?date=${selected}&time_zone=${encodeURIComponent(user.timeZone)}`,
    );
  if (name === 'get_day_load')
    return ask(
      'GET',
      args.days === undefined
        ? `/api/v1/planning/load?date=${selected}&time_zone=${encodeURIComponent(user.timeZone)}`
        : `/api/v1/planning/load?from=${selected}&days=${String(typeof args.days === 'number' ? args.days : 1)}`,
    );
  if (name === 'start_day_plan' || name === 'replan_day') {
    if (
      name === 'replan_day' &&
      (args.auto_apply === true || (Array.isArray(args.overrides) && args.overrides.length > 0))
    )
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Use record_plan_decision and apply_day_plan to confirm explicit actions',
      );
    if (selected < today || selected > shiftCivilDate(today, 13))
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'date must be within the next fourteen days',
      );
    if (name === 'replan_day') {
      const candidates = (await ask('GET', `/api/v1/planning/candidates?date=${selected}`)) as {
        count: number;
      };
      if (candidates.count === 0) return { session: null, reason: 'nothing_to_replan' };
    }
    return ask('POST', '/api/v1/planning/sessions', {
      local_date: selected,
      time_zone: user.timeZone,
      today: true,
      overdue: true,
      inbox: args.inbox === true,
      undated: args.undated === true,
    });
  }
  const session = String(args.session_id);
  if (name === 'record_plan_decision')
    return ask('PUT', `/api/v1/planning/sessions/${session}/decisions/${String(args.task_id)}`, {
      action: args.action,
      ...(args.date === undefined ? {} : { date: args.date }),
      ...(args.time === undefined ? {} : { time: args.time }),
      ...(args.duration === undefined ? {} : { duration: args.duration }),
    });
  if (name === 'apply_day_plan') {
    if (args.auto_apply !== true) return ask('GET', `/api/v1/planning/sessions/${session}`);
    return ask(
      'POST',
      `/api/v1/planning/sessions/${session}/apply`,
      { expected_revision: args.expected_revision },
      typeof args.idempotency_key === 'string' ? args.idempotency_key : undefined,
    );
  }
  if (name === 'revert_day_plan')
    return ask('POST', `/api/v1/planning/operations/${String(args.operation_id)}/revert`);
  throw new DomainException(HttpStatus.BAD_REQUEST, 'unknown_tool', 'Unknown planning tool');
}
