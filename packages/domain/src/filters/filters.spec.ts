import { describe, expect, it } from 'vitest';
import {
  arrangeTasks,
  compileRules,
  matchesClause,
  matchesFilter,
  matchesSmartList,
  pageTaskGroups,
  parseFilterRules,
  requireConditions,
  resolveTagReference,
  rewriteMergedTag,
  parseSearchQuery,
  parseTaskView,
  savedFilterClause,
  smartListClause,
  type ArrangedTask,
  type FilterClock,
  type FilterSubject,
} from './index';

const clock: FilterClock = {
  now: '2026-10-17T10:00:00.000Z',
  timeZone: 'Europe/Madrid',
};

function subject(overrides: Partial<FilterSubject> = {}): FilterSubject {
  return {
    listId: 'list-1',
    tagIds: [],
    tagNames: ['casa'],
    dueDate: '2026-10-17T16:00:00.000Z',
    isAllDay: false,
    timeZone: 'Europe/Madrid',
    priority: 'medium',
    title: 'Leer el informe',
    content: 'capítulo 2',
    status: 'active',
    assigneeId: 'user-1',
    deleted: false,
    createdAt: '2026-10-17T09:00:00.000Z',
    ...overrides,
  };
}

function task(overrides: Partial<ArrangedTask> = {}): ArrangedTask {
  return {
    id: 't1',
    title: 'Alfa',
    dueDate: '2026-10-17T16:00:00.000Z',
    priority: 'high',
    sortOrder: '65536',
    createdAt: '2026-10-17T09:00:00.000Z',
    columnId: 'col-1',
    columnName: 'Hoy',
    columnSortOrder: '131072',
    tagNames: ['casa'],
    ...overrides,
  };
}

describe('filter grammar', () => {
  it('RF-902: normal mode keeps a single AND group and rejects a second group', () => {
    const rules = {
      combinator: 'AND',
      groups: [
        {
          combinator: 'AND',
          conditions: [
            { field: 'keyword', op: 'contains', value: 'informe' },
            { field: 'priority', op: 'gte', value: 'medium' },
          ],
        },
      ],
    };
    expect(parseFilterRules(rules, 'normal').ok).toBe(true);
    expect(parseFilterRules(rules, 'advanced').ok).toBe(true);
    const advanced = {
      combinator: 'OR',
      groups: [
        { combinator: 'AND', conditions: [{ field: 'tag', op: 'any_of', value: ['casa'] }] },
        { combinator: 'OR', conditions: [{ field: 'status', op: 'eq', value: 'completed' }] },
      ],
    };
    expect(parseFilterRules(advanced, 'advanced').ok).toBe(true);
    expect(parseFilterRules(advanced, 'normal')).toEqual({ ok: false, reason: 'normal_shape' });
  });

  it('TTD-FIL-08: requireConditions rejects an empty filter, an empty group, and accepts a real one', () => {
    const keyword = {
      field: 'keyword' as const,
      op: 'contains' as const,
      value: 'informe',
    };
    expect(
      requireConditions({
        combinator: 'AND',
        groups: [{ combinator: 'AND', conditions: [] }],
      }),
    ).toEqual({ ok: false, reason: 'empty_filter' });
    expect(
      requireConditions({
        combinator: 'AND',
        groups: [],
      }),
    ).toEqual({ ok: false, reason: 'empty_filter' });
    expect(
      requireConditions({
        combinator: 'OR',
        groups: [
          { combinator: 'AND', conditions: [keyword] },
          { combinator: 'OR', conditions: [] },
        ],
      }),
    ).toEqual({ ok: false, reason: 'empty_group' });
    expect(
      requireConditions({
        combinator: 'AND',
        groups: [{ combinator: 'AND', conditions: [keyword] }],
      }),
    ).toEqual({ ok: true });
  });

  it('RF-902: rejects an empty keyword, a reversed range and an unknown field', () => {
    expect(
      parseFilterRules(
        {
          combinator: 'AND',
          groups: [
            { combinator: 'AND', conditions: [{ field: 'keyword', op: 'contains', value: '  ' }] },
          ],
        },
        'normal',
      ),
    ).toEqual({ ok: false, reason: 'invalid_condition' });
    expect(
      parseFilterRules(
        {
          combinator: 'AND',
          groups: [
            {
              combinator: 'AND',
              conditions: [{ field: 'date', op: 'between', value: ['2026-10-20', '2026-10-17'] }],
            },
          ],
        },
        'normal',
      ),
    ).toEqual({ ok: false, reason: 'invalid_condition' });
    expect(parseFilterRules({ combinator: 'AND', groups: 'nope' }, 'advanced')).toEqual({
      ok: false,
      reason: 'invalid_rules',
    });
    expect(
      parseFilterRules(
        {
          combinator: 'AND',
          groups: [{ combinator: 'AND', conditions: [{ field: 'color', op: 'eq', value: 'red' }] }],
        },
        'normal',
      ),
    ).toEqual({ ok: false, reason: 'invalid_condition' });
  });

  it('RF-904: evaluates list, tag, priority, keyword, status and assignee', () => {
    const parsed = parseFilterRules(
      {
        combinator: 'AND',
        groups: [
          {
            combinator: 'AND',
            conditions: [
              { field: 'list', op: 'in', value: ['list-1'] },
              { field: 'tag', op: 'any_of', value: ['Casa'] },
              { field: 'priority', op: 'gte', value: 'medium' },
              { field: 'keyword', op: 'contains', value: 'CAPÍTULO' },
              { field: 'status', op: 'eq', value: 'active' },
              { field: 'assignee', op: 'eq', value: 'user-1' },
            ],
          },
        ],
      },
      'normal',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(matchesFilter(parsed.rules, subject(), clock)).toBe(true);
    expect(matchesFilter(parsed.rules, subject({ priority: 'low' }), clock)).toBe(false);
    expect(matchesFilter(parsed.rules, subject({ title: 'Otra', content: '' }), clock)).toBe(false);
    expect(matchesFilter(parsed.rules, subject({ tagNames: ['trabajo'] }), clock)).toBe(false);
  });

  it('RF-904: resolves today, tomorrow, the next 7 days, overdue, no date and a range in the user zone', () => {
    const today = parseFilterRules(
      {
        combinator: 'AND',
        groups: [{ combinator: 'AND', conditions: [{ field: 'date', op: 'today' }] }],
      },
      'normal',
    );
    const tomorrow = parseFilterRules(
      {
        combinator: 'AND',
        groups: [{ combinator: 'AND', conditions: [{ field: 'date', op: 'tomorrow' }] }],
      },
      'normal',
    );
    const week = parseFilterRules(
      {
        combinator: 'AND',
        groups: [{ combinator: 'AND', conditions: [{ field: 'date', op: 'next_7_days' }] }],
      },
      'normal',
    );
    const overdue = parseFilterRules(
      {
        combinator: 'AND',
        groups: [{ combinator: 'AND', conditions: [{ field: 'date', op: 'overdue' }] }],
      },
      'normal',
    );
    const undated = parseFilterRules(
      {
        combinator: 'AND',
        groups: [{ combinator: 'AND', conditions: [{ field: 'date', op: 'no_date' }] }],
      },
      'normal',
    );
    const range = parseFilterRules(
      {
        combinator: 'AND',
        groups: [
          {
            combinator: 'AND',
            conditions: [{ field: 'date', op: 'between', value: ['2026-10-17', '2026-10-18'] }],
          },
        ],
      },
      'normal',
    );
    expect(today.ok && tomorrow.ok && week.ok && overdue.ok && undated.ok && range.ok).toBe(true);
    if (!today.ok || !tomorrow.ok || !week.ok || !overdue.ok || !undated.ok || !range.ok) {
      return;
    }
    expect(matchesFilter(today.rules, subject(), clock)).toBe(true);
    expect(
      matchesFilter(
        today.rules,
        subject({ dueDate: '2026-10-16T22:00:00.000Z', isAllDay: true }),
        clock,
      ),
    ).toBe(true);
    expect(
      matchesFilter(tomorrow.rules, subject({ dueDate: '2026-10-17T22:30:00.000Z' }), clock),
    ).toBe(true);
    expect(matchesFilter(week.rules, subject({ dueDate: '2026-10-23T10:00:00.000Z' }), clock)).toBe(
      true,
    );
    expect(matchesFilter(week.rules, subject({ dueDate: '2026-10-23T22:00:00.000Z' }), clock)).toBe(
      false,
    );
    expect(
      matchesFilter(overdue.rules, subject({ dueDate: '2026-10-16T21:00:00.000Z' }), clock),
    ).toBe(true);
    expect(
      matchesFilter(
        overdue.rules,
        subject({ dueDate: '2026-10-15T22:00:00.000Z', isAllDay: true }),
        clock,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        overdue.rules,
        subject({ dueDate: '2026-10-16T22:00:00.000Z', isAllDay: true }),
        clock,
      ),
    ).toBe(false);
    expect(matchesFilter(overdue.rules, subject({ status: 'completed' }), clock)).toBe(false);
    expect(matchesFilter(undated.rules, subject({ dueDate: null }), clock)).toBe(true);
    expect(
      matchesFilter(range.rules, subject({ dueDate: '2026-10-18T19:00:00.000Z' }), clock),
    ).toBe(true);
    expect(
      matchesFilter(range.rules, subject({ dueDate: '2026-10-18T22:00:00.000Z' }), clock),
    ).toBe(false);
    expect(matchesFilter(today.rules, subject(), { now: clock.now, timeZone: 'Mars/Base' })).toBe(
      false,
    );
  });

  it('RF-902 RF-904: OR combines groups and an empty OR matches nothing', () => {
    const parsed = parseFilterRules(
      {
        combinator: 'OR',
        groups: [
          { combinator: 'AND', conditions: [{ field: 'tag', op: 'any_of', value: ['trabajo'] }] },
          { combinator: 'OR', conditions: [{ field: 'priority', op: 'gte', value: 'high' }] },
        ],
      },
      'advanced',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(matchesFilter(parsed.rules, subject({ priority: 'high', tagNames: [] }), clock)).toBe(
      true,
    );
    expect(matchesFilter(parsed.rules, subject({ priority: 'low', tagNames: [] }), clock)).toBe(
      false,
    );
    expect(matchesFilter({ combinator: 'OR', groups: [] }, subject(), clock)).toBe(false);
    expect(compileRules(parsed.rules, clock).op).toBe('or');
  });

  it('RF-904: a saved filter hides trash and archived tasks', () => {
    const clause = savedFilterClause({ combinator: 'AND', groups: [] }, clock);
    expect(
      matchesFilter({ combinator: 'AND', groups: [] }, subject({ deleted: true }), clock),
    ).toBe(true);
    expect(matchesClause(clause, subject({ deleted: true }), clock)).toBe(false);
    expect(matchesClause(clause, subject({ status: 'archived' }), clock)).toBe(false);
    expect(matchesClause(clause, subject(), clock)).toBe(true);
    expect(matchesClause(clause, subject({ status: 'completed' }), clock)).toBe(false);
  });
});

describe('smart lists', () => {
  const input = { clock, inboxProjectId: 'inbox-1', assigneeId: 'user-1' };

  it('RF-901: today, inbox, assigned, completed, no date and all use the shared grammar', () => {
    expect(matchesSmartList('today', subject(), input)).toBe(true);
    expect(matchesSmartList('today', subject({ dueDate: '2026-10-16T08:00:00.000Z' }), input)).toBe(
      true,
    );
    expect(matchesSmartList('today', subject({ dueDate: '2026-10-17T22:30:00.000Z' }), input)).toBe(
      false,
    );
    expect(
      matchesSmartList(
        'today',
        subject({ dueDate: '2026-10-16T08:00:00.000Z', status: 'completed' }),
        input,
      ),
    ).toBe(false);
    expect(matchesSmartList('inbox', subject({ listId: 'inbox-1' }), input)).toBe(true);
    expect(matchesSmartList('inbox', subject({ listId: 'other' }), input)).toBe(false);
    expect(matchesSmartList('inbox', subject(), { ...input, inboxProjectId: null })).toBe(false);
    expect(matchesSmartList('assigned_to_me', subject(), input)).toBe(true);
    expect(matchesSmartList('assigned_to_me', subject(), { ...input, assigneeId: '' })).toBe(false);
    expect(matchesSmartList('all', subject({ status: 'completed' }), input)).toBe(false);
    expect(matchesSmartList('completed', subject({ status: 'completed' }), input)).toBe(true);
    expect(matchesSmartList('no_date', subject({ dueDate: null }), input)).toBe(true);
    expect(matchesSmartList('trash', subject({ deleted: true, status: 'archived' }), input)).toBe(
      true,
    );
    expect(matchesSmartList('trash', subject(), input)).toBe(false);
  });

  it('RF-901: a future start stays out of today even when the deadline has passed', () => {
    const later = subject({
      startDate: '2026-10-20T22:00:00.000Z',
      dueDate: '2026-10-15T22:00:00.000Z',
      isAllDay: true,
    });
    const startedToday = subject({
      startDate: '2026-10-16T22:00:00.000Z',
      dueDate: '2026-10-15T08:00:00.000Z',
      isAllDay: false,
    });
    expect(matchesSmartList('today', later, input)).toBe(false);
    expect(matchesSmartList('today', startedToday, input)).toBe(true);
  });

  it('RF-901: recently added keeps the last 30 local days and drops older tasks', () => {
    expect(matchesSmartList('recently_added', subject(), input)).toBe(true);
    expect(
      matchesSmartList('recently_added', subject({ createdAt: '2026-09-16T22:00:00.000Z' }), input),
    ).toBe(true);
    expect(matchesSmartList('recently_added', subject({ status: 'completed' }), input)).toBe(false);
    expect(
      matchesSmartList('recently_added', subject({ createdAt: '2026-09-16T21:59:59.000Z' }), input),
    ).toBe(false);
    expect(smartListClause('tomorrow', input).op).toBe('and');
    expect(
      matchesSmartList('next_7_days', subject({ dueDate: '2026-10-20T10:00:00.000Z' }), input),
    ).toBe(true);
  });
});

describe('list view', () => {
  it('RF-1001: groups by section, date, tag and priority and sorts inside the group', () => {
    const rows = [
      task({
        id: 'b',
        title: 'Beta',
        sortOrder: '10',
        priority: 'low',
        tagNames: ['casa', 'trabajo'],
      }),
      task({
        id: 'a',
        title: 'alfa',
        sortOrder: '20',
        priority: 'high',
        columnId: null,
        columnName: null,
        columnSortOrder: null,
        dueDate: null,
        tagNames: [],
      }),
      task({
        id: 'c',
        title: 'Celta',
        sortOrder: 'nope',
        priority: 'high',
        createdAt: '2026-10-18T00:00:00.000Z',
      }),
    ];
    const bySection = arrangeTasks(rows, {
      groupBy: 'section',
      sort: 'manual',
      timeZone: clock.timeZone,
    });
    expect(bySection.map((group) => group.key)).toEqual(['col-1', 'none']);
    const byDate = arrangeTasks(rows, { groupBy: 'date', sort: 'date', timeZone: clock.timeZone });
    expect(byDate.at(-1)?.key).toBe('none');
    const byTag = arrangeTasks(rows, { groupBy: 'tag', sort: 'title', timeZone: clock.timeZone });
    const casa = byTag.find((group) => group.key === 'casa');
    expect(casa?.tasks.map((item) => item.id)).toEqual(['b', 'c']);
    expect(byTag.some((group) => group.key === 'none')).toBe(true);
    const byPriority = arrangeTasks(rows, {
      groupBy: 'priority',
      sort: 'priority',
      timeZone: clock.timeZone,
    });
    expect(byPriority.map((group) => group.key)).toEqual(['high', 'low']);
    const byCreated = arrangeTasks(rows, {
      groupBy: 'none',
      sort: 'created',
      timeZone: clock.timeZone,
    });
    expect(byCreated[0]?.tasks.map((item) => item.id)[0]).toBe('c');
    expect(arrangeTasks([], { groupBy: 'none', sort: 'manual', timeZone: clock.timeZone })).toEqual(
      [],
    );
    expect(parseTaskView(undefined, undefined)).toEqual({
      ok: true,
      groupBy: 'none',
      sort: 'manual',
    });
    expect(parseTaskView('kanban', 'manual')).toEqual({ ok: false, reason: 'invalid_view' });
  });

  it('RF-1001: pages a grouped list without splitting the cursor identity', () => {
    const groups = arrangeTasks(
      [
        task({ id: 'a', sortOrder: '1' }),
        task({ id: 'b', sortOrder: '2' }),
        task({ id: 'c', sortOrder: '3' }),
      ],
      { groupBy: 'none', sort: 'manual', timeZone: clock.timeZone },
    );
    const first = pageTaskGroups(groups, 2, null);
    expect(first.total).toBe(3);
    expect(first.groups[0]?.tasks.map((item) => item.id)).toEqual(['a', 'b']);
    expect(first.next).toEqual({ index: 1, id: 'b' });
    const second = pageTaskGroups(groups, 2, first.next);
    expect(second.groups[0]?.tasks.map((item) => item.id)).toEqual(['c']);
    expect(second.next).toBeNull();
    expect(pageTaskGroups(groups, 2, { index: 5, id: 'missing' }).groups[0]?.tasks).toHaveLength(2);
  });
});

describe('tag references', () => {
  const casa = '11111111-1111-4111-8111-111111111111';
  const hogar = '22222222-2222-4222-8222-222222222222';

  it('CA-DOM-05: tag_any matches an id, a leftover name, and a mix of both', () => {
    const rules = {
      combinator: 'AND' as const,
      groups: [
        {
          combinator: 'AND' as const,
          conditions: [{ field: 'tag' as const, op: 'any_of' as const, value: [casa, 'Casa'] }],
        },
      ],
    };
    expect(compileRules(rules, clock)).toMatchObject({
      items: [{ items: [{ op: 'tag_any', ids: [casa], legacyNames: ['Casa'] }] }],
    });
    expect(matchesFilter(rules, subject({ tagIds: [casa], tagNames: [] }), clock)).toBe(true);
    expect(matchesFilter(rules, subject({ tagIds: [], tagNames: ['casa'] }), clock)).toBe(true);
    expect(matchesFilter(rules, subject({ tagIds: [hogar], tagNames: ['trabajo'] }), clock)).toBe(
      false,
    );
  });

  it('CA-DOM-05: resolves a tag name without regard to case and rejects an unknown id', () => {
    const tags = [{ id: casa, name: 'casa' }];
    expect(resolveTagReference('Casa', tags)).toBe(casa);
    expect(resolveTagReference(casa.toUpperCase(), tags)).toBe(casa);
    expect(resolveTagReference('hogar', tags)).toBeNull();
    expect(resolveTagReference(hogar, tags)).toBeNull();
  });

  it('CA-DOM-05: a merge replaces the source id and drops a duplicate', () => {
    const rules = {
      combinator: 'AND' as const,
      groups: [
        {
          combinator: 'AND' as const,
          conditions: [{ field: 'tag' as const, op: 'any_of' as const, value: [casa, hogar] }],
        },
      ],
    };
    const rewritten = rewriteMergedTag(rules, casa, hogar);
    expect(rewritten.changed).toBe(true);
    expect(rewritten.rules.groups[0]?.conditions[0]).toEqual({
      field: 'tag',
      op: 'any_of',
      value: [hogar],
    });
    expect(rewriteMergedTag(rewritten.rules, casa, hogar).changed).toBe(false);
  });
});

describe('search query', () => {
  it('RF-1501: reads inline list, tag, priority and done tokens and keeps the remaining text', () => {
    expect(parseSearchQuery('leer in:"bandeja de entrada" #Casa priority:HIGH done:true')).toEqual({
      text: 'leer',
      listName: 'bandeja de entrada',
      tagNames: ['Casa'],
      priority: 'high',
      done: true,
    });
    expect(parseSearchQuery('in:inbox #  priority:urgent done:false nota')).toEqual({
      text: 'priority:urgent nota',
      listName: 'inbox',
      tagNames: [],
      priority: null,
      done: false,
    });
    expect(parseSearchQuery('in:"sin cierre')).toEqual({
      text: 'in:"sin cierre',
      listName: null,
      tagNames: [],
      priority: null,
      done: null,
    });
  });
});

describe('TTD-AUD-01 effective task date', () => {
  it('RF-601 RF-904: date filters prefer start over deadline, including all-day tasks', () => {
    const input = { clock, assigneeId: 'user-1', inboxProjectId: 'list-1' };
    const tomorrow = '2026-10-18T07:00:00.000Z';
    for (const isAllDay of [false, true]) {
      const task = subject({ startDate: tomorrow, dueDate: null, isAllDay });
      expect(matchesSmartList('tomorrow', task, input)).toBe(true);
      expect(matchesSmartList('next_7_days', task, input)).toBe(true);
      expect(matchesSmartList('no_date', task, input)).toBe(false);
      expect(matchesSmartList('today', task, input)).toBe(false);
      expect(matchesSmartList('tomorrow', subject({ ...task, dueDate: clock.now }), input)).toBe(
        true,
      );
    }
    expect(matchesSmartList('tomorrow', subject({ dueDate: tomorrow }), input)).toBe(true);
    expect(
      matchesSmartList('today', subject({ startDate: clock.now, dueDate: tomorrow }), input),
    ).toBe(true);
    const rules = {
      combinator: 'AND',
      groups: [
        {
          combinator: 'AND',
          conditions: [{ field: 'date', op: 'between', value: ['2026-10-18', '2026-10-18'] }],
        },
      ],
    } as const;
    expect(matchesFilter(rules, subject({ startDate: tomorrow, dueDate: null }), clock)).toBe(true);
  });
});

describe('folder conditions', () => {
  const folder = '11111111-1111-4111-8111-111111111111';
  const rules = {
    combinator: 'AND' as const,
    groups: [
      {
        combinator: 'AND' as const,
        conditions: [{ field: 'folder' as const, op: 'in' as const, value: [folder] }],
      },
    ],
  };

  it('parses folder ids and rejects a name', () => {
    expect(parseFilterRules(rules, 'normal').ok).toBe(true);
    expect(
      parseFilterRules(
        {
          combinator: 'AND',
          groups: [
            {
              combinator: 'AND',
              conditions: [{ field: 'folder', op: 'in', value: ['Proyectos'] }],
            },
          ],
        },
        'normal',
      ),
    ).toEqual({ ok: false, reason: 'invalid_condition' });
  });

  it('matches the list folder and misses when the subject has none', () => {
    expect(compileRules(rules, clock)).toMatchObject({
      items: [{ items: [{ op: 'folder_in', ids: [folder] }] }],
    });
    expect(matchesFilter(rules, subject({ folderId: folder }), clock)).toBe(true);
    expect(matchesFilter(rules, subject({ folderId: null }), clock)).toBe(false);
    expect(matchesFilter(rules, subject(), clock)).toBe(false);
  });
});
