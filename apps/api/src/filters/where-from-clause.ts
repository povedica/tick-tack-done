import type { Prisma } from '@prisma/client';
import type { FilterClause, Priority } from '@reflexionia/domain';

const MATCH_NONE = '00000000-0000-0000-0000-000000000000';
const PRIORITY_ORDER = ['none', 'low', 'medium', 'high'] as const satisfies readonly Priority[];

/**
 * Mechanical map of a compiled filter clause. Overdue stays a superset:
 * all-day tasks are decided by matchesClause, which is the grammar.
 */
export function whereFromClause(clause: FilterClause): Prisma.TaskWhereInput {
  switch (clause.op) {
    case 'and':
      return clause.items.length === 0
        ? {}
        : { AND: clause.items.map((item) => whereFromClause(item)) };
    case 'or':
      return clause.items.length === 0
        ? matchNone()
        : { OR: clause.items.map((item) => whereFromClause(item)) };
    case 'list_in':
      return clause.ids.length === 0 ? matchNone() : { projectId: { in: [...clause.ids] } };
    case 'tag_any':
      return clause.names.length === 0
        ? matchNone()
        : {
            tags: {
              some: {
                tag: { name: { in: [...clause.names], mode: 'insensitive' }, deletedAt: null },
              },
            },
          };
    case 'due_range':
      return { dueDate: { gte: new Date(clause.from), lt: new Date(clause.to) } };
    case 'no_date':
      return { dueDate: null };
    case 'overdue':
      return { status: 'active', dueDate: { not: null } };
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
    default: {
      const unreachable: never = clause;
      return unreachable;
    }
  }
}

function prioritiesAtLeast(minimum: Priority): Priority[] {
  const index = PRIORITY_ORDER.indexOf(minimum);
  return [...PRIORITY_ORDER.slice(index)];
}

function matchNone(): Prisma.TaskWhereInput {
  return { id: MATCH_NONE };
}
