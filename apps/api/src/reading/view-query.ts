import type { Prisma } from '@prisma/client';
import {
  arrangeTasks,
  type FilterClause,
  type FilterClock,
  type TaskGroupBy,
  type TaskSort,
} from '@reflexionia/domain';
import { whereFromClause as clauseWhere } from '../filters/where-from-clause.js';
import { encodeCursor } from '../http/cursor.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { Tx } from '../prisma/tx.js';
import { toViewJson, loadViewTasks, type ViewTask } from './view-tasks.js';
import type { ViewPageJson } from './view-page.js';

type Db = PrismaService | Tx;

export async function countViewTasks(
  db: Db,
  ownerId: string,
  clause: FilterClause,
  clock: FilterClock,
  extra?: Prisma.TaskWhereInput,
): Promise<number> {
  return db.task.count({ where: viewWhere(ownerId, clause, clock, extra) });
}

/** Applies the clause in SQL, then hydrates tags and checklist only for the page. */
export async function pageViewTasks(
  db: Db,
  input: {
    readonly ownerId: string;
    readonly clause: FilterClause;
    readonly clock: FilterClock;
    readonly groupBy: TaskGroupBy;
    readonly sort: TaskSort;
    readonly limit: number;
    readonly cursor: { index: number; id: string } | null;
    readonly ranking?: 'completed';
    readonly extra?: Prisma.TaskWhereInput;
    readonly scope?: Prisma.TaskWhereInput;
  },
): Promise<ViewPageJson> {
  const where = viewWhere(input.ownerId, input.clause, input.clock, input.extra, input.scope);
  const skip = input.cursor === null ? 0 : input.cursor.index + 1;
  const [count, ids] = await Promise.all([
    db.task.count({ where }),
    db.task.findMany({
      where,
      orderBy: orderByFor(input.sort, input.ranking),
      skip,
      take: input.limit + 1,
      select: { id: true },
    }),
  ]);
  const hasMore = ids.length > input.limit;
  const pageIds = ids.slice(0, input.limit).map((row) => row.id);
  const hydrated = pageIds.length === 0 ? [] : await loadViewTasks(db, { id: { in: pageIds } });
  const byId = new Map(hydrated.map((task) => [task.id, task]));
  const ordered = pageIds.flatMap((id) => {
    const task = byId.get(id);
    return task === undefined ? [] : [task];
  });
  const last = ordered.at(-1);
  return {
    count,
    group_by: input.groupBy,
    sort: input.sort,
    groups: groupPreserving(ordered, input.groupBy, input.clock.timeZone),
    next_cursor:
      hasMore && last !== undefined
        ? encodeCursor(String(skip + ordered.length - 1), last.id)
        : null,
  };
}

function viewWhere(
  ownerId: string,
  clause: FilterClause,
  clock: FilterClock,
  extra?: Prisma.TaskWhereInput,
  scope?: Prisma.TaskWhereInput,
): Prisma.TaskWhereInput {
  return {
    AND: [
      scope ?? { ownerId },
      { parentId: null },
      clauseWhere(clause, clock),
      ...(extra === undefined ? [] : [extra]),
    ],
  };
}

function orderByFor(
  sort: TaskSort,
  ranking: 'completed' | undefined,
): Prisma.TaskOrderByWithRelationInput[] {
  if (ranking === 'completed') {
    return [{ completedAt: 'desc' }, { id: 'desc' }];
  }
  switch (sort) {
    case 'date':
      return [{ dueDate: 'asc' }, { id: 'asc' }];
    case 'priority':
      return [{ priority: 'desc' }, { id: 'asc' }];
    case 'title':
      return [{ title: 'asc' }, { id: 'asc' }];
    case 'created':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
    case 'manual':
      return [{ sortOrder: 'asc' }, { id: 'asc' }];
    default: {
      const unreachable: never = sort;
      return unreachable;
    }
  }
}

function groupPreserving(
  tasks: readonly ViewTask[],
  groupBy: TaskGroupBy,
  timeZone: string,
): ViewPageJson['groups'] {
  if (tasks.length === 0) {
    return [];
  }
  const rank = new Map(tasks.map((task, index) => [task.id, index]));
  const arranged = arrangeTasks(tasks, { groupBy, sort: 'manual', timeZone });
  return arranged.map((group) => ({
    key: group.key,
    label: group.label,
    tasks: [...group.tasks]
      .sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0))
      .map((task) => toViewJson(task)),
  }));
}
