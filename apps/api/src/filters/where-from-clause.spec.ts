import { describe, expect, it } from 'vitest';
import { compileRules } from '@reflexionia/domain';
import { whereFromClause } from './where-from-clause';

describe('whereFromClause', () => {
  it('RF-904: compiles a keyword and a list into a Prisma where, and keeps overdue as a superset', () => {
    const clause = compileRules(
      {
        combinator: 'AND',
        groups: [
          {
            combinator: 'AND',
            conditions: [
              { field: 'list', op: 'in', value: ['list-1'] },
              { field: 'keyword', op: 'contains', value: 'leer' },
              { field: 'date', op: 'overdue' },
            ],
          },
        ],
      },
      { now: '2026-10-17T10:00:00.000Z', timeZone: 'Europe/Madrid' },
    );
    expect(whereFromClause(clause)).toEqual({
      AND: [
        {
          AND: [
            { projectId: { in: ['list-1'] } },
            {
              OR: [
                { title: { contains: 'leer', mode: 'insensitive' } },
                { content: { contains: 'leer', mode: 'insensitive' } },
              ],
            },
            { status: 'active', dueDate: { not: null } },
          ],
        },
      ],
    });
    expect(whereFromClause({ op: 'or', items: [] })).toEqual({
      id: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('RF-604: overdue with a clock excludes future timed tasks and all-day tasks due today', () => {
    const clock = { now: '2026-10-17T10:00:00.000Z', timeZone: 'Europe/Madrid' };
    expect(whereFromClause({ op: 'overdue' }, clock)).toEqual({
      status: 'active',
      dueDate: { not: null },
      OR: [
        { isAllDay: false, dueDate: { lt: new Date(clock.now) } },
        { isAllDay: true, dueDate: { lt: new Date('2026-10-16T22:00:00.000Z') } },
      ],
    });
  });
});
