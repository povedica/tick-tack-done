import type { Prisma } from '@prisma/client';
import {
  shiftLocalDays,
  type FilterClause,
  type FilterClock,
  type Priority,
} from '@reflexionia/domain';

const MATCH_NONE = '00000000-0000-0000-0000-000000000000';
const PRIORITY_ORDER = ['none', 'low', 'medium', 'high'] as const satisfies readonly Priority[];

/**
 * Mechanical map of a compiled filter clause.
 * Overdue is a superset unless a clock is passed; then timed and all-day tasks follow the grammar.
 */
export function whereFromClause(clause: FilterClause, clock?: FilterClock): Prisma.TaskWhereInput {
  switch (clause.op) {
    case 'and':
      return clause.items.length === 0
        ? {}
        : { AND: clause.items.map((item) => whereFromClause(item, clock)) };
    case 'or':
      return clause.items.length === 0
        ? matchNone()
        : { OR: clause.items.map((item) => whereFromClause(item, clock)) };
    case 'list_in':
      return clause.ids.length === 0 ? matchNone() : { projectId: { in: [...clause.ids] } };
    case 'tag_any':
      return tagWhere(clause.ids, clause.legacyNames);
    case 'due_range': {
      const range = { gte: new Date(clause.from), lt: new Date(clause.to) };
      return { OR: [{ startDate: range }, { startDate: null, dueDate: range }] };
    }
    case 'no_date':
      return { startDate: null, dueDate: null };
    case 'overdue':
      return overdueWhere(clock);
    case 'priority_gte':
      return { priority: { in: prioritiesAtLeast(clause.minimum) } };
    case 'keyword':
      return {
        OR: [
          { title: { contains: clause.text, mode: 'insensitive' } },
          { content: { contains: clause.text, mode: 'insensitive' } },
        ],
      };
    case 'status':
      return { status: clause.status };
    case 'assignee':
      return { assigneeId: clause.id };
    case 'deleted':
      return clause.deleted ? { deletedAt: { not: null } } : { deletedAt: null };
    case 'exclude_status':
      return { status: { not: clause.status } };
    case 'created_since':
      return { createdAt: { gte: new Date(clause.since) } };
    case 'never':
      return matchNone();
    case 'always':
      return {};
    case 'someday':
      return { isSomeday: clause.value };
    default: {
      const unreachable: never = clause;
      return unreachable;
    }
  }
}

function tagWhere(ids: readonly string[], legacyNames: readonly string[]): Prisma.TaskWhereInput {
  const links: Prisma.TaskTagWhereInput[] = [];
  if (ids.length > 0) {
    links.push({ tagId: { in: [...ids] }, tag: { deletedAt: null } });
  }
  if (legacyNames.length > 0) {
    links.push({
      tag: { name: { in: [...legacyNames], mode: 'insensitive' }, deletedAt: null },
    });
  }
  if (links.length === 0) {
    return matchNone();
  }
  const only = links[0];
  return {
    tags: { some: links.length === 1 && only !== undefined ? only : { OR: links } },
  };
}

function prioritiesAtLeast(minimum: Priority): Priority[] {
  const index = PRIORITY_ORDER.indexOf(minimum);
  return [...PRIORITY_ORDER.slice(index)];
}

function matchNone(): Prisma.TaskWhereInput {
  return { id: MATCH_NONE };
}

/**
 * Without a clock, overdue stays a superset (any active task with a due date).
 * With a clock, timed tasks are past `now` and all-day tasks are past the local day.
 */
function overdueWhere(clock: FilterClock | undefined): Prisma.TaskWhereInput {
  if (clock === undefined) {
    return { status: 'active', dueDate: { not: null } };
  }
  const start = shiftLocalDays(clock.now, clock.timeZone, 0);
  const tomorrow = shiftLocalDays(clock.now, clock.timeZone, 1);
  const timed = { isAllDay: false, dueDate: { lt: new Date(clock.now) } };
  const allDay =
    start === null
      ? { isAllDay: true, dueDate: { lt: new Date(clock.now) } }
      : { isAllDay: true, dueDate: { lt: new Date(start) } };
  const notPlannedLater: Prisma.TaskWhereInput =
    tomorrow === null
      ? {}
      : { OR: [{ startDate: null }, { startDate: { lt: new Date(tomorrow) } }] };
  return {
    status: 'active',
    dueDate: { not: null },
    AND: [{ OR: [timed, allDay] }, notPlannedLater],
  };
}
