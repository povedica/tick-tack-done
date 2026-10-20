import { mergeFieldClocks } from '@reflexionia/domain';
import type { Prisma } from '@prisma/client';
import type { UpdateTaskDto } from './tasks.dto.js';

const WATCHED = [
  'title',
  'content',
  'kind',
  'priority',
  'is_all_day',
  'start_date',
  'due_date',
  'time_zone',
  'duration_minutes',
  'someday',
  'evening_only',
  'repeat_rule',
  'repeat_from',
  'column_id',
  'tag_ids',
  'metadata',
] as const;

export function readClocks(value: Prisma.JsonValue | null | undefined): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const clocks: Record<string, string> = {};
  for (const [key, clock] of Object.entries(value)) {
    if (typeof clock === 'string') {
      clocks[key] = clock;
    }
  }
  return clocks;
}

export interface SelectedPatch {
  readonly dto: UpdateTaskDto;
  readonly clocks: Record<string, string>;
  readonly skipped: readonly string[];
  readonly changed: boolean;
}

/** RF-13012. Drops fields that lose last-write-wins. Null means a clock is not a timestamp. */
export function selectPatch(
  dto: UpdateTaskDto,
  stored: Record<string, string>,
  receivedAt: string,
): SelectedPatch | null {
  const fields = WATCHED.filter((key) => dto[key] !== undefined);
  if (fields.length === 0) {
    return { dto, clocks: stored, skipped: [], changed: false };
  }
  const decision = mergeFieldClocks({
    clocks: stored,
    fields,
    patchClocks: dto.field_clocks ?? {},
    receivedAt,
    operation: 'update',
  });
  if (!decision.ok) {
    return null;
  }
  return {
    dto: omitSkipped(dto, decision.skipped),
    clocks: decision.clocks,
    skipped: decision.skipped,
    changed: decision.apply.length > 0,
  };
}

function omitSkipped(dto: UpdateTaskDto, skipped: readonly string[]): UpdateTaskDto {
  const {
    title,
    content,
    kind,
    priority,
    is_all_day,
    start_date,
    due_date,
    time_zone,
    duration_minutes,
    someday,
    evening_only,
    repeat_rule,
    repeat_from,
    column_id,
    tag_ids,
    metadata,
    ...rest
  } = dto;
  return {
    ...rest,
    ...(keep(skipped, 'title', title) ? { title } : {}),
    ...(keep(skipped, 'content', content) ? { content } : {}),
    ...(keep(skipped, 'kind', kind) ? { kind } : {}),
    ...(keep(skipped, 'priority', priority) ? { priority } : {}),
    ...(keep(skipped, 'is_all_day', is_all_day) ? { is_all_day } : {}),
    ...(keep(skipped, 'start_date', start_date) ? { start_date } : {}),
    ...(keep(skipped, 'due_date', due_date) ? { due_date } : {}),
    ...(keep(skipped, 'time_zone', time_zone) ? { time_zone } : {}),
    ...(keep(skipped, 'duration_minutes', duration_minutes) ? { duration_minutes } : {}),
    ...(keep(skipped, 'someday', someday) ? { someday } : {}),
    ...(keep(skipped, 'evening_only', evening_only) ? { evening_only } : {}),
    ...(keep(skipped, 'repeat_rule', repeat_rule) ? { repeat_rule } : {}),
    ...(keep(skipped, 'repeat_from', repeat_from) ? { repeat_from } : {}),
    ...(keep(skipped, 'column_id', column_id) ? { column_id } : {}),
    ...(keep(skipped, 'tag_ids', tag_ids) ? { tag_ids } : {}),
    ...(keep(skipped, 'metadata', metadata) ? { metadata } : {}),
  };
}

function keep(skipped: readonly string[], field: string, value: unknown): boolean {
  return value !== undefined && !skipped.includes(field);
}

export function stampTerminal(
  stored: Record<string, string>,
  receivedAt: string,
  operation: 'complete' | 'delete',
): Record<string, string> {
  const fields = operation === 'complete' ? ['status', 'completed_at'] : ['deleted_at'];
  const decision = mergeFieldClocks({
    clocks: stored,
    fields,
    patchClocks: {},
    receivedAt,
    operation,
  });
  return decision.ok ? decision.clocks : stored;
}
